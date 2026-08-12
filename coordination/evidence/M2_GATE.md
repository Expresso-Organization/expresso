# G02 공고 등록·분석 종단 게이트 증거

- 상태: verified
- 일자: 2026-08-09 (Asia/Seoul)
- 체크리스트: M2-07

## 실제 종단 흐름

1. 임시 PostgreSQL 데이터베이스를 만들고 0001–0008 마이그레이션을 처음부터 적용했다.
2. 실제 TCP Fastify API로 인증된 기록 3건과 200자 이상 공고 원문을 등록했다.
3. 제출 transaction에서 `job_analysis`와 outbox가 queued 상태로 생성됨을 API로 확인했다.
4. `OutboxDispatcher`가 실제 Redis/BullMQ queue에 게시하고 Worker가 작업을 받도록 했다.
5. extractor 직전 제어 지점에서 API가 `running/extracting/attempts=1`을 반환함을 확인했다.
6. Worker 완료 후 3–6개 요구사항, Unicode 원문 구간 일치, record 기반 coverage를 API와 DB에서 검증했다.
7. 같은 공고의 네 축 일치도를 API로 계산해 축 점수 합과 정수 총점·설명을 검증했다.

## 검증 결과

| 검사 | 결과 |
|---|---|
| fresh DB migration + TCP HTTP + PostgreSQL/Redis Worker E2E | PASS — 1 test |
| 상태 전이 | PASS — queued → running/extracting → done |
| outbox 전달 상태 | PASS — published |
| requirement 원문/coverage DB assertion | PASS |
| 설명 가능한 match score | PASS |
| 전체 `pnpm test` | PASS — contracts 11 + database 11 + backend 43 = 65 tests |
| 전체 `pnpm typecheck` / `pnpm build` | PASS |
| `actionlint` / `git diff --check` | PASS |
