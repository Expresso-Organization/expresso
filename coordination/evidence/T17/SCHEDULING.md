# T17 정기 작업·retention 운영 증거

- 상태: verified
- 일자: 2026-08-09 (Asia/Seoul)
- 체크리스트: M6-05

## 실행 슬롯과 lease

- 저장 검색, 만료 공고, 알림 묶음, 일 집계, 삭제 유예, retention 6개 definition을 migration으로 고정한다.
- due definition을 `FOR UPDATE SKIP LOCKED`로 점유하고 다음 시각을 현재보다 미래로 먼저 전진시킨다.
- `(job_key, scheduled_for)` unique run과 run UUID outbox key로 scheduler/dispatcher 중복 실행을 단일 슬롯에 수렴시킨다.
- 20개 동시 tick 결과 scheduled run 6개, outbox 6개만 생성되었다.

## 멱등 도메인 효과

- 저장 검색은 마지막 실행 시각, 만료 공고는 closed 상태로 수렴한다.
- 알림 묶음은 기존 notification UUID outbox key를 재사용한다.
- 일 집계는 raw 기반 metric upsert, 삭제 유예는 요청 transaction, retention은 조건부 delete로 재실행에 안전하다.
- 같은 run의 Worker 5회 호출에서도 attempts 1과 succeeded 결과 하나만 남는다.

## 관측과 실패

- run별 scheduled/start/finish, status, attempts, sanitized error class, result, queue lag를 조회한다.
- definition별 next run, last status, failure count를 제공한다.
- 주입 실패가 failed/attempt 1로 보존되고 같은 run 재시도 성공 후 attempt 2, failure count 0으로 회복됨을 검증했다.

## 검증 결과

| 검사 | 결과 |
|---|---|
| migration 0020 fresh/Compose PostgreSQL 적용 | PASS |
| 20-way scheduler dedupe / outbox 6 | PASS |
| 6 operation duplicate processing single effect | PASS |
| failure/lag/next-run observation and retry | PASS |
| contracts | PASS — 13 tests |
| database | PASS — 11 tests |
| backend | PASS — 36 files, 77 tests |
| 전체 `pnpm test` | PASS — 101 tests |
| 전체 `pnpm typecheck` / `pnpm build` | PASS |
| `git diff --check` | PASS |

