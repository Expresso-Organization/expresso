# Expresso 배포

## 상태와 승인 경계

현재 저장소의 런타임은 MongoDB를 사용하도록 준비되어 있습니다. 실제 운영 전환은
`docs/operations/MONGODB_CUTOVER.md`를 만드는 T19이며 별도 승인이 필요합니다.
`MONGODB_CUTOVER_APPROVED` 저장소 변수가 `true`가 되기 전에는 자동 배포 workflow가
운영 서버를 변경하지 않습니다.

## 서버 구성

| 구성 | 위치 | 기본 포트 |
| --- | --- | ---: |
| MongoDB rs0 | `infra/compose.server.yaml` | loopback 57017 |
| Redis | `infra/compose.server.yaml` | loopback 56379 |
| API | systemd `expresso-api` | 4500 |
| Worker | systemd `expresso-worker` | 없음 |
| Web | systemd `expresso-web` | 3500 |

서버 compose는 CI와 같은 MongoDB image digest, keyfile 생성, rs0 초기화 스크립트를
사용합니다. runtime 계정은 데이터 읽기·쓰기만 가능하고 migration 계정이
validator와 index를 적용합니다.

```mermaid
flowchart TD
    FETCH["승인된 commit checkout"] --> INSTALL["pnpm install"]
    INSTALL --> CONTRACTS["contracts · database build"]
    CONTRACTS --> INFRA["MongoDB rs0 · Redis 준비"]
    INFRA --> MIGRATE["migration 계정 schema 적용"]
    MIGRATE --> BUILD["API · Web build"]
    BUILD --> WORKER["Worker 재시작"]
    WORKER --> API["API 재시작"]
    API --> READY{"rs0·schema·Redis ready?"}
    READY -->|예| WEB["Web 재시작"]
    READY -->|아니오| STOP["중단 · 로그 보존"]
```

## 필수 환경

`infra/.env`에는 admin, runtime, migration 계정을 서로 다른 값으로 설정합니다.
`services/backend/.env`에는 다음 값이 필요합니다.

```dotenv
MONGODB_URL=mongodb://runtime-user:...@127.0.0.1:57017/expresso?authSource=expresso&replicaSet=rs0
MONGODB_MIGRATE_URL=mongodb://migration-user:...@127.0.0.1:57017/expresso?authSource=expresso&replicaSet=rs0
MONGODB_DATABASE=expresso
REDIS_URL=redis://127.0.0.1:56379
QUEUE_PREFIX=expresso-mongo-v1
```

비밀번호를 저장소, 명령 인자 또는 로그에 기록하지 않습니다. 서버의 환경 파일은
소유자만 읽을 수 있어야 합니다.

## 실행

운영 승인 후 GitHub Actions가 다음과 같은 서버 명령을 실행합니다.

```bash
scripts/operations/deploy.sh <검증된-commit>
```

스크립트는 기존 MySQL volume을 참조하거나 삭제하지 않습니다. `down -v`도
실행하지 않습니다. schema migration과 readiness가 통과하지 않으면 API를 준비된
것으로 취급하지 않습니다.

## 실패와 복구

사용자 쓰기를 열기 전 실패하면 새 프로세스를 중단하고 이전 artifact와 설정으로
복구할 수 있습니다. 사용자 쓰기를 연 뒤에는 URI만 MySQL로 되돌리지 않습니다.
먼저 모든 쓰기를 멈추고 새 MongoDB 데이터, Redis와 파일을 보존한 뒤 복원 또는
전진 수정을 선택합니다. 백업과 복원은
[MongoDB 백업과 복원](BACKUP_AND_RESTORE.md)을 따릅니다.
