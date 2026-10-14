# Spring Career 운영 준비

## 상태와 승인 경계

PR-E는 팀장 서버에 적용할 구성 제안입니다. 운영값은 아직 확정하지 않았습니다.
실제 배포, 서비스 등록, writer 활성화는 서버 관리자의 검토와 별도 승인이 필요합니다.
이 문서의 서버 명령은 이번 구현 과정에서 운영 서버에 실행하지 않았습니다.

기존 [배포 절차](DEPLOYMENT.md), Compose, nginx, CI, 자동 배포 스크립트는 유지합니다.
Spring JAR는 기존 API·Worker·Web과 별도 프로세스로 실행합니다.
PR-B2의 제품 호출 전환과 명시적 활성화 절차는 [Career Writer Cutover](CAREER_WRITER_CUTOVER.md)를 따릅니다.

## 기존 서버 구성

저장소의 구성은 MongoDB rs0를 loopback 57017, Redis를 loopback 56379에 연결합니다.
API는 4500, Web은 3500이며 Worker는 별도 systemd 프로세스입니다.
이 값은 기존 파일의 근거이며 서버의 실제 상태를 대신하지 않습니다.
Spring의 포트, 설치 위치, Java 실행 경로, 서비스명은 저장소에 확정된 값이 없습니다.

Spring은 Redis에 직접 연결하지 않습니다. 큐는 기존 Fastify/Worker가 소유합니다.
MongoDB와 Redis의 기존 배포 방식이나 볼륨을 변경하지 않습니다.

## 운영값과 환경변수

[환경 예시](../../services/backend-spring/.env.example)를 별도 파일로 복사합니다.
비어 있는 필수 값을 팀장이 확인한 뒤 입력합니다. 예시 파일 자체는 실행 가능한 운영 설정이 아닙니다.

| 변수 | 준비값 또는 규칙 |
| --- | --- |
| `SPRING_PROFILES_ACTIVE` | `operations` |
| `SPRING_BIND_ADDRESS` | 기본 `127.0.0.1`. `::1`도 허용합니다. |
| `SPRING_PORT` | 필수. 1..65535의 미사용 포트를 지정합니다. |
| `MONGODB_URL` | 필수. 기존 runtime 계정의 URI입니다. `replicaSet`을 명시합니다. |
| `MONGODB_DATABASE` | 필수. runtime DB 이름입니다. URI에 DB가 있으면 같은 이름이어야 합니다. |
| `MONGODB_REPLICA_SET` | 기존 구성의 `rs0`입니다. URI의 값과 같아야 합니다. |
| `CAREER_WRITER_ENABLED` | 기본 `false`. PR-E에서는 유지합니다. |
| `CAREER_INTEGRATION_ENABLED` | 기본 `false`. PR-E에서는 유지합니다. |
| `CAREER_WRITER_MOVE_SECRET` | writer가 꺼져 있으면 비워 둡니다. |
| `CAREER_INTEGRATION_AI_SECRET` | producer integration이 꺼져 있으면 비워 둡니다. |
| `CAREER_INTEGRATION_INTERVIEW_SECRET` | producer integration이 꺼져 있으면 비워 둡니다. |

기본 프로필은 기존처럼 HTTP 서버와 DB writer를 띄우지 않습니다.
`operations` 프로필만 HTTP와 readiness 연결을 준비합니다.
유닛의 명령줄은 이 프로필을 명시합니다. business controller와 producer는 기본적으로 생성하지 않습니다.

환경 파일은 root 소유 0600으로 보관합니다. 상위 디렉터리도 접근을 제한합니다.
systemd가 파일을 읽고 비관리자 서비스 계정으로 Java를 실행합니다.
환경 파일을 shell로 `source`하지 않습니다. URI와 secret을 명령 인수, Git, 로그에 넣지 않습니다.
migration 계정, 사용자 세션 토큰, 외부 AI 키는 이 파일에 넣지 않습니다.
예시는 한 줄 `KEY=value` 또는 전체 값을 감싼 따옴표만 사용합니다. escape와 multiline은 지원하지 않습니다.
환경 파일은 BOM 없는 UTF-8로 저장합니다. `validate`는 UTF-8 BOM을 제거하지 않고 거부합니다.
유닛 설치, `start`, `restart`, `rollback` 전에 매번 `validate`를 통과해야 합니다.
systemd는 Java 실행 전에 환경 파일을 읽으므로, 검증하지 않은 파일을 기존 서비스의 환경 파일에 연결하지 않습니다.

[내부 consumer URL 예시](../../infra/spring-consumer.env.example)의 `CAREER_SPRING_BASE_URL`은
Web 서버/Fastify에서 사용할 loopback URL의 준비값입니다. Spring 포트와 같은 값을 지정합니다.
브라우저에 공개하는 `NEXT_PUBLIC_*` 변수로 만들지 않습니다.
PR-B2에서는 API와 Worker가 이 설정을 읽습니다. 빈 주소·키는 활성화 설정이 아닙니다. 운영 적용 승인은 별도로 필요합니다.

## Java와 빌드

빌드에는 JDK 21과 저장소의 Gradle wrapper를 사용합니다.
서버 실행에는 Java 21이 필요합니다. OS 패키지 선택과 설치는 서버 관리자가 결정합니다.
루트 `pnpm build`는 Java 빌드를 대신하지 않습니다.

```bash
cd services/backend-spring
# JAVA_HOME에 검토한 JDK 21 경로를 지정한 환경에서 실행합니다.
./gradlew clean assemble build
```

배포 대상은 `build/libs/backend-spring-0.0.1-SNAPSHOT.jar`입니다.
`-plain.jar`를 배포하지 않습니다. 빌드 결과의 SHA256과 승인된 코드 버전을 함께 보관합니다.
운영 준비 도구는 저장소의 Node 24 이상으로 실행합니다. 새로운 Node 설치나 CI 변경은 하지 않습니다.

## MongoDB와 readiness

Spring 시작 시 migration이나 index 생성은 실행하지 않습니다.
현재 stack의 0014·0015·0016이 별도 migration 절차로 적용되어 있어야 합니다.
PR-E는 이 migration 파일을 수정하지 않습니다. 운영 DB 적용 시점은 관리자가 결정합니다.

readiness는 다음을 읽기만 합니다.

- MongoDB 연결과 `hello`의 replica set 이름 및 writable primary.
- `ping` 성공.
- `schema_migrations`의 0014·0015·0016 `state=applied`.
- command receipt, mutation receipt, Interview input key의 기존 unique index.

runtime 계정에는 해당 DB 조회와 기존 writer 계약에 필요한 최소 권한을 부여합니다.
admin/migration 계정을 readiness 우회 수단으로 사용하지 않습니다.
migration checksum 전체 검증과 DDL 적용은 기존 database migrator가 담당합니다.
readiness는 그 작업을 대신하지 않습니다.

| endpoint | 성공 | 실패 |
| --- | --- | --- |
| `GET /health/live` | 200, `{"status":"ok"}` | 프로세스/HTTP가 응답하지 않으면 실패합니다. |
| `GET /health/ready` | 200, `{"status":"ready","checks":{"mongodb":"up"}}` | 503, `{"status":"not_ready","checks":{"mongodb":"down"}}` |

두 endpoint는 인증 없이 loopback에서 확인합니다.
MongoDB 장애나 권한 부족, schema 미준비 시 liveness는 계속 200을 반환하고 readiness는 503을 반환합니다.
공개 응답에는 URI, DB 이름, 서버 오류, credential을 포함하지 않습니다.
readiness 실패는 systemd의 프로세스 장애와 구분합니다. DB 장애마다 Java를 무조건 재시작하지 않습니다.

## Service actor 인증

PR-D의 service actor는 사용자 session과 구분됩니다.
내부 producer 명령은 `expi` 서명을 확인하고 producer/user/source/operation/fingerprint에 권한을 묶습니다.
유효기간은 최대 300초이며, 일반 사용자 session token으로 내부 명령을 호출할 수 없습니다.
receipt, lease, CAS 검증은 기존 Spring business writer가 유지합니다.
서비스 actor credential만으로 범위를 벗어난 요청이나 삭제된 사용자를 허용하지 않습니다.

향후 승인된 활성화에서는 AI, Interview, move secret을 각각 다른 32 UTF-8 byte 이상 값으로 설정해야 합니다.
producer integration은 writer가 켜져 있어야 합니다.
실제 키 발급·전달·회전, 발급 프로세스 권한, 운영 secret 저장 위치는 팀장이 결정합니다.
PR-E의 검증 CLI는 두 enable flag가 `false`인 구성만 허용합니다.
Spring 장애 시 Fastify direct Mongo write로 fallback하는 경로를 추가하지 않습니다.

loopback은 동일 호스트의 다른 사용자까지 격리하지는 않습니다.
비관리자 서비스 계정과 root 전용 환경 파일을 함께 사용합니다.
JAR·릴리스 루트는 서비스 계정이 변경할 수 없도록 root 또는 승인된 배포 계정이 소유해야 합니다.

## systemd 구성

[유닛 template](../../infra/systemd/expresso-career-spring.service.template)은 그대로 설치하지 않습니다.
[운영 도구](../../scripts/operations/spring-runtime.mjs)의 `render-unit`으로 입력값을 채웁니다.
기존 `expresso-api`, `expresso-worker`, `expresso-web` 서비스명은 사용할 수 없습니다.

유닛은 비관리자 계정, journald, SIGTERM graceful shutdown, 45초 종료 대기를 사용합니다.
`Restart=on-failure`는 프로세스 종료 오류에만 재시작합니다.
`ProtectSystem=strict`, `ProtectHome=read-only`, `PrivateTmp`, `NoNewPrivileges`를 적용합니다.
Java JIT을 막는 `MemoryDenyWriteExecute` 설정은 추가하지 않습니다.
환경 파일의 읽기 방식과 보호 설정은 [systemd 공식 문서](https://github.com/systemd/systemd/blob/main/man/systemd.exec.xml)를 참고합니다.

다음 shell 변수에는 관리자에게 확인한 값을 미리 지정합니다. 기본값은 제공하지 않습니다.

```bash
: "${REPO_ROOT:?검토한 저장소 절대 경로}"
: "${NODE_BIN:?Node 24 실행 파일 절대 경로}"
: "${SPRING_JAVA:?Java 21 실행 파일 절대 경로}"
: "${SPRING_RELEASE_ROOT:?별도 릴리스 루트 절대 경로}"
: "${SPRING_ENV_FILE:?root 전용 환경 파일 절대 경로}"
: "${SPRING_SERVICE_USER:?비관리자 서비스 계정}"
: "${SPRING_SERVICE_NAME:?기존 서비스와 다른 이름. .service 접미사 제외}"
: "${UNIT_CANDIDATE:?검토할 유닛 파일 절대 경로. 아직 없는 파일}"
```

필요한 계정과 디렉터리는 관리자가 먼저 생성합니다.
릴리스 루트는 절대 경로이며 symlink 경로를 사용하지 않습니다.
상위 경로는 서비스 계정이 통과할 수 있어야 합니다.
릴리스 루트는 0755, root 소유를 권장합니다. 서비스 계정에는 쓰기 권한을 주지 않습니다.
환경 파일은 0600으로 설정합니다. 경로와 계정명은 도구가 허용하는 단순한 Linux 이름을 사용합니다.

```bash
cd "$REPO_ROOT"
sudo "$NODE_BIN" scripts/operations/spring-runtime.mjs validate \
  --java "$SPRING_JAVA" --env-file "$SPRING_ENV_FILE"
"$NODE_BIN" scripts/operations/spring-runtime.mjs render-unit \
  --java "$SPRING_JAVA" --release-root "$SPRING_RELEASE_ROOT" \
  --env-file "$SPRING_ENV_FILE" --service-user "$SPRING_SERVICE_USER" \
  --service-name "$SPRING_SERVICE_NAME" --output "$UNIT_CANDIDATE"
sudo systemd-analyze verify "$UNIT_CANDIDATE"
```

`UNIT_CANDIDATE`는 선택한 서비스명에 `.service`를 붙인 이름으로 지정합니다.
도구는 기존 파일을 덮어쓰지 않습니다. 유닛 내용을 검토한 뒤 설치합니다.

## 수동 배포와 재시작

이 단계는 서버 관리자의 승인 후에만 실행합니다.
기존 자동 배포 스크립트를 실행하거나 변경하지 않습니다.
실행 중인 Spring 릴리스 파일은 덮어쓰지 않습니다.
매번 새로운 버전 디렉터리에 검증한 JAR를 보관하고 `current` 링크만 바꿉니다.

```bash
: "${RELEASE_ID:?새 릴리스 식별자}"
: "${JAR_FILE:?검증된 boot JAR 절대 경로}"
: "${JAR_SHA256:?빌드 산출물의 64자리 SHA256}"

cd "$REPO_ROOT"
sudo "$NODE_BIN" scripts/operations/spring-runtime.mjs stage \
  --release-root "$SPRING_RELEASE_ROOT" --version "$RELEASE_ID" \
  --jar "$JAR_FILE" --sha256 "$JAR_SHA256"
sudo "$NODE_BIN" scripts/operations/spring-runtime.mjs select \
  --release-root "$SPRING_RELEASE_ROOT" --version "$RELEASE_ID"
```

`select`는 Linux에서 `current` symlink를 원자적으로 교체하고
`version`, `previousVersion`을 출력합니다. 이전 버전을 배포 기록에 저장합니다.
기존 링크 대상이 손상되었으면 중단합니다. 새 버전 선택 전에 확인합니다.
`stage`는 버전 재사용, SHA256 불일치, symlink 경로를 거부합니다.
복사 실패 시 남은 부분 릴리스는 자동 삭제하지 않습니다. 관리자가 확인하고 새 버전명으로 재시도합니다.

최초 유닛 설치에서만 다음 두 명령을 실행합니다.

```bash
sudo install -o root -g root -m 0644 "$UNIT_CANDIDATE" \
  "/etc/systemd/system/$SPRING_SERVICE_NAME.service"
sudo systemctl daemon-reload
```

같은 유닛의 JAR만 바꿀 때는 `daemon-reload`가 필요하지 않습니다.
유닛을 변경할 때에는 별도 candidate를 검토한 뒤 설치하고 reload합니다.

```bash
sudo "$NODE_BIN" scripts/operations/spring-runtime.mjs validate \
  --java "$SPRING_JAVA" --env-file "$SPRING_ENV_FILE"
sudo systemctl restart "$SPRING_SERVICE_NAME.service"
: "${SPRING_PORT:?환경 파일과 같은 포트}"
: "${SPRING_BIND_ADDRESS:?환경 파일과 같은 127.0.0.1 또는 ::1}"
"$NODE_BIN" scripts/operations/spring-runtime.mjs ready \
  --port "$SPRING_PORT" --bind-address "$SPRING_BIND_ADDRESS" --timeout-ms 60000
sudo systemctl status "$SPRING_SERVICE_NAME.service" --no-pager
sudo journalctl -u "$SPRING_SERVICE_NAME.service" -n 100 --no-pager
```

종료는 `systemctl stop`, 시작은 `systemctl start`를 사용합니다. 시작 직전에 `validate`를 다시 실행합니다.
서버 부팅 시 자동 시작은 관리자가 따로 승인한 뒤 `systemctl enable`합니다.
readiness 실패 시 배포 성공으로 기록하지 않습니다. 실패 로그를 보호된 위치에 보관합니다.

## Rollback

이전 JAR의 SHA256과 릴리스 디렉터리를 보존합니다.
readiness가 실패하면 현재 서비스와 로그를 확인한 뒤 다음 순서로 이전 버전을 선택합니다.
`rollback`은 대상의 SHA256을 먼저 검증하고 `current` 링크를 원자적으로 교체합니다.
현재 JAR 또는 manifest의 손상·삭제는 복구를 막지 않습니다. 현재 링크의 상대 경로와 릴리스 디렉터리,
존재하는 파일의 symlink·일반 파일 검사는 유지합니다. 대상이나 경로 검증에 실패하면 링크를 바꾸지 않습니다.

```bash
: "${PREVIOUS_RELEASE_ID:?select 결과에서 보관한 이전 버전}"
sudo systemctl stop "$SPRING_SERVICE_NAME.service"
sudo "$NODE_BIN" scripts/operations/spring-runtime.mjs validate \
  --java "$SPRING_JAVA" --env-file "$SPRING_ENV_FILE"
sudo "$NODE_BIN" scripts/operations/spring-runtime.mjs rollback \
  --release-root "$SPRING_RELEASE_ROOT" --version "$PREVIOUS_RELEASE_ID"
sudo "$NODE_BIN" scripts/operations/spring-runtime.mjs validate \
  --java "$SPRING_JAVA" --env-file "$SPRING_ENV_FILE"
sudo systemctl start "$SPRING_SERVICE_NAME.service"
"$NODE_BIN" scripts/operations/spring-runtime.mjs ready \
  --port "$SPRING_PORT" --bind-address "$SPRING_BIND_ADDRESS" --timeout-ms 60000
```

이전 버전이 없는 최초 설치의 실패에서는 서비스를 멈추고 원인을 해결합니다.
이전 JAR로의 rollback은 DB migration이나 business/document 데이터를 되돌리지 않습니다.
환경·유닛을 함께 변경했다면 보호된 이전 설정을 별도로 복원하고 검증합니다.
운영 도구는 Git, migration, Compose, systemctl, 기존 제품 서비스를 실행하지 않습니다.

## 검증 명령

```bash
node --test scripts/operations/spring-runtime.test.mjs
pnpm test
pnpm typecheck
pnpm build
pnpm test:infra
cd services/backend-spring
./gradlew clean assemble build
```

실제 Spring Mongo/Node HTTP integration은 disposable replica set URI를 `B1_TEST_MONGO_URL`로,
Node 실행 파일을 `B1_TEST_NODE`로 전달한 빌드에서 수행합니다.
이 값은 테스트 전용입니다. 운영 DB를 지정하지 않습니다.
일반 build에서 실제 인프라 테스트가 skip되면 운영 연결 검증 완료로 기록하지 않습니다.
Ubuntu 24.04 disposable 환경에서 Java 21, Node 24, systemd 유닛 검증과
시작·종료·재시작·실패 JAR rollback을 별도로 검증했습니다.
이 결과는 팀장 서버의 경로·권한·배포 승인을 대신하지 않습니다.

## 팀장 결정 항목

| 항목 | 확인할 내용 |
| --- | --- |
| 포트·네트워크 | 빈 loopback 포트, 같은 호스트 내부 URL, 외부 공개 필요 여부 |
| Java | JDK/JRE 21 설치 방식과 실제 실행 파일 |
| 서비스 | 별도 서비스명, 비관리자 계정, 자원 한도, 자동 시작 여부 |
| 설치 위치 | 릴리스 루트, 상위 경로 권한, 환경 파일·유닛 위치 |
| MongoDB | 실제 DB/authSource/rs 이름, runtime 최소 권한, migration 적용 승인 |
| Secret | producer별 발급·배포·회전 방식, 배포 담당자의 접근 권한 |
| 배포 | 수동 승인 담당자, JAR 전달·SHA256 보관, 로그 접근, rollback 보존 기간 |
| Cutover | PR-B2에서 writer 활성화·legacy 제거·caller 전환의 별도 검토 |
