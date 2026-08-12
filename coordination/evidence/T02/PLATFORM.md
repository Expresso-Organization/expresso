# T02 플랫폼·인프라·CI·관측 증거

- 상태: verified
- 일자: 2026-08-09 (Asia/Seoul)
- 체크리스트: M0-04, M0-06

## 산출물

- 고정 이미지 `postgres:18.4-bookworm`, `redis:8.2.1-alpine`의 로컬 Docker Compose와 health check.
- 추가 전용 `0003_platform_outbox.sql`: idempotency key, claim lock, retry, published/dead-letter 상태.
- 동일 outbox UUID를 BullMQ job ID로 사용하는 dispatcher와 exponential retry.
- terminal Worker failure를 별도 DLQ로 옮기는 queue factory/worker wiring.
- 실제 outbox polling을 수행하는 `backend-worker` runtime.
- request ID 생성/응답 전파, 공통 오류 envelope, URL query·인증/쿠키/토큰 redaction, 메시지 없는 error summary.
- PostgreSQL/Redis service를 사용하는 backend CI workflow.

## 검증

| 명령 또는 동작 | 결과 |
|---|---|
| `pnpm infra:up` | PASS — PostgreSQL/Redis 모두 healthy |
| compose image manifest | PASS — 두 고정 tag 존재 |
| compose DB `pnpm db:migrate` | PASS — 0001, 0002, 0003 적용 |
| compose DB migration 재실행 | PASS — 세 파일 모두 already applied |
| `pnpm test:infra` | PASS — 실제 PostgreSQL/Redis 3 files, 4 tests |
| Worker runtime smoke | PASS — outbox UUID job enqueue, DB state `published`, Redis job 존재 |
| API runtime `/health/ready` | PASS — HTTP 200, postgres/redis `up` |
| API runtime missing route | PASS — stable `NOT_FOUND` envelope, unsafe request ID 교체 |
| `actionlint .github/workflows/backend-ci.yml` | PASS |
| `docker compose ... config --quiet` | PASS |
| 전체 `pnpm test` | PASS — contracts 6 + database 11 + backend 15 = 32 tests |
| 전체 `pnpm typecheck` | PASS |
| 전체 `pnpm build` | PASS |
| `git diff --check` | PASS |

## 자체 리뷰

- DB publish 표시 직전에 프로세스가 죽어도 stale lock을 다시 claim하고 동일 BullMQ job ID로 수렴한다.
- queue enqueue 실패 메시지는 저장하지 않고 Error name과 안전한 code만 outbox에 남긴다.
- terminal Worker 실패의 error message는 DLQ metadata에 복제하지 않는다.
- API는 Fastify 기본 404를 그대로 노출하지 않고 공통 오류 계약으로 바꾼다.
- 외부 request ID는 8–128자의 안전한 문자만 수용하고 나머지는 서버 UUID로 교체한다.
- integration test가 남긴 outbox 행과 Redis test namespace는 테스트 종료 시 정리한다.
