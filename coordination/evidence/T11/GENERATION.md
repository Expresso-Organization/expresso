# T11 생성·quota·포트폴리오 materialization 증거

- 상태: verified
- 일자: 2026-08-09 (Asia/Seoul)
- 체크리스트: M4-02, M4-03, M4-04

## M4-02 생성 작업·사용량 원장

- 생성 요청은 user/idempotency key/request hash로 한 job과 outbox에 수렴한다.
- Worker 중복 실행은 job row lock과 done fast-path로 materialization과 quota 효과를 한 번만 만든다.
- user row lock 아래 중앙 entitlement 판정, usage counter 증가, append-only ledger, done 전이를 한 transaction으로 처리한다.
- validator/provider 실패는 quota를 차감하지 않고 실패 코드·retryability와 draft portfolio를 보존한다.

## M4-03 근거·사실·잠금 검증

- 모든 block은 recipe evidence path UUID를 하나 이상 요구하고 sentence trace 행을 저장한다.
- 최종 문장은 연결한 source label에 완전히 근거해야 하며 출처 없는 주장/수치와 recipe exclude 위반을 차단한다.
- 기존 locked block 문장이 출력에서 사라지거나 바뀌면 materialization 전에 거부한다.

## M4-04 portfolio와 초기 복원점

- recipe section/item을 portfolio section/block으로 materialize하고 record source는 `record_usage`로 연결한다.
- 성공 transaction에서 generation sentence trace와 `initial_generation` snapshot을 함께 저장한다.
- snapshot은 포트폴리오별 최근 50개 보존 정책으로 이후 편집 복원점을 수용한다.

## 검증 결과

| 검사 | 결과 |
|---|---|
| migration 0014 PGlite/Compose PostgreSQL 적용 | PASS |
| evidence/exclude/locked 적대적 validator | PASS — 2 tests |
| 100 submit + 10 duplicate process concurrency | PASS — 1 job, 1 charge, 1 ledger |
| 실패 draft·retryability·무차감 | PASS |
| block trace/record usage/initial snapshot | PASS |
| contracts | PASS — 13 tests |
| database | PASS — 11 tests |
| backend | PASS — 28 files, 58 tests |
| 전체 `pnpm test` | PASS — 82 tests |
| 전체 `pnpm typecheck` / `pnpm build` | PASS |
| `git diff --check` | PASS |
