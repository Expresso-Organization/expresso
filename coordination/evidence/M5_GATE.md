# M5 배포·방문·분석 종단 게이트

- 상태: verified
- 일자: 2026-08-09 (Asia/Seoul)
- 체크리스트: M5-07

## fresh infrastructure E2E

별도 PostgreSQL database를 생성해 migration 0001–0017을 처음부터 적용하고 격리 Redis queue namespace를 사용했다.

1. 인증된 사용자가 HTTP API로 version 1 포트폴리오를 배포했다.
2. 익명 방문자 5명이 public collection API에 이벤트를 전송했다.
3. 인증된 집계 요청이 transactional outbox에 기록되었다.
4. dispatcher가 Redis queue로 전달하고 실제 BullMQ Worker가 raw event에서 일 metric 6종을 생성했다.
5. HTTP insight 조회가 sample size 5와 `visits`, `completes` 근거를 반환했다.
6. draft block 변경 후 version 2를 배포해 이전 주소 redirect를 확인했다.
7. version 1 rollback 후 공개 주소가 즉시 원래 불변 snapshot을 반환하고 version 2 주소는 404가 됐다.

## 검증 결과

| 검사 | 결과 |
|---|---|
| fresh DB migration 0001–0017 | PASS |
| HTTP publish→anonymous event | PASS |
| outbox→Redis→Worker aggregate | PASS |
| metric sample/evidence insight | PASS |
| redirect→rollback→public snapshot | PASS |
| 전체 `pnpm test` | PASS — 92 tests |
| 전체 `pnpm typecheck` / `pnpm build` | PASS |
| `git diff --check` | PASS |

