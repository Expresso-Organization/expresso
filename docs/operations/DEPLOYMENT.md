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

## nginx

호스트 nginx 설정의 출처는 `infra/nginx/expresso.ai.kr.conf`입니다. 배포 스크립트는 이 파일을 서버에 복사하지 않습니다. 저장소 파일을 바꾼 뒤에는 서버 파일에 같은 변경을 직접 적용합니다. 서버 파일은 인증서 경로가 저장소와 다를 수 있으므로 통째로 덮어쓰지 않습니다.

`location /v1/`은 WebSocket 업그레이드를 넘겨야 합니다. 커리어 본문 저장 소켓(`/v1/career/records/:id/session`)이 이 경로로 들어옵니다. 헤더가 빠지면 API가 일반 GET으로 받아 404를 내고, 편집기는 「오프라인」에서 재연결만 반복합니다. 2026-11-02 운영이 이 상태였습니다.

```nginx
# http 블록 안(사이트 파일 맨 위)
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

# location /v1/ 안
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection $connection_upgrade;
```

적용과 확인:

```bash
sudo nginx -t
sudo systemctl reload nginx
curl -4 --http1.1 -s -o /dev/null -w '%{http_code}\n' -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' https://expresso.ai.kr/v1/career/records/00000000-0000-4000-8000-000000000000/session
```

마지막 명령은 101을 내야 합니다. `deploy.sh`도 배포 끝에 같은 요청을 보내고, 101이 아니면 실패로 끝납니다. API `.env`의 `CAREER_SOCKET_ALLOWED_ORIGIN`은 `https://expresso.ai.kr`이어야 합니다. 이 값이 틀리면 핸드셰이크는 101이지만 소켓이 곧바로 닫힙니다.

## 측정 브라우저

워커는 생성한 포트폴리오 지면을 Playwright Chromium(chromium-headless-shell)으로 열어 390 · 926 · 1440px에서 잽니다.
브라우저 바이너리는 배포 스크립트가 `ubuntu` 계정의 `~/.cache/ms-playwright`에 받습니다. 시스템 라이브러리와
한국어 폰트는 서버마다 처음 한 번 설치합니다. 한국어 폰트가 없으면 대체 서체로 재므로 한 글자 줄바꿈 판정이 실제 화면과 달라집니다.

```bash
cd ~/expresso/services/backend
sudo env "PATH=$PATH" npx playwright install-deps chromium
sudo apt-get install -y fonts-noto-cjk
```

브라우저를 띄우지 못하면 워커는 측정 없이 생성을 이어 가고, 생성 기록(`generationManifest.renderMeasure`)에
`status: "skipped"`와 이유가 남습니다.

## 실행

운영 승인 후 GitHub Actions가 다음과 같은 서버 명령을 실행합니다.

```bash
scripts/operations/deploy.sh <검증된-commit>
```

스크립트는 기존 MySQL volume을 참조하거나 삭제하지 않습니다. `down -v`도
실행하지 않습니다. schema migration과 readiness가 통과하지 않으면 API를 준비된
것으로 취급하지 않습니다.

## 관리자와 더미 계정

관리자는 서버에서 명령으로만 지정합니다. 웹에는 관리자를 지정하는 화면이 없습니다.

```bash
cd ~/expresso
pnpm --filter @expresso/backend admin grant <email>
pnpm --filter @expresso/backend admin revoke <email>
```

- 명령은 빌드된 `services/backend/dist/cli/admin.js`를 실행하고 `services/backend/.env`의
  `MONGODB_URL`로 붙습니다. 배포 스크립트가 빌드를 마친 뒤에 실행합니다.
- 대상 계정은 미리 가입해 있어야 합니다. 지정과 해제는 `admin_audit_events`에 남습니다.
- 관리자가 로그인하면 사이드바에 「관리」가 생깁니다. `/admin`에서 더미 계정 5종을 만들고,
  그 계정으로 대신 로그인합니다. 원본 데이터는 `services/backend/src/modules/admin/personas/`에
  있습니다.

주의: 남길 포트폴리오가 있으면 그 더미 계정의 「다시 채우기」와 「지우기」를 누르지 않습니다.
그 계정의 기록과 포트폴리오가 모두 지워지고 되돌릴 수 없습니다.

## 실패와 복구

사용자 쓰기를 열기 전 실패하면 새 프로세스를 중단하고 이전 artifact와 설정으로
복구할 수 있습니다. 사용자 쓰기를 연 뒤에는 URI만 MySQL로 되돌리지 않습니다.
먼저 모든 쓰기를 멈추고 새 MongoDB 데이터, Redis와 파일을 보존한 뒤 복원 또는
전진 수정을 선택합니다. 백업과 복원은
[MongoDB 백업과 복원](BACKUP_AND_RESTORE.md)을 따릅니다.
