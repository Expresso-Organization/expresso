# T19 계정 export·삭제 유예 증거

- 상태: verified
- 일자: 2026-08-09 (Asia/Seoul)
- 체크리스트: M6-04

## 데이터 export

- schemaVersion 1과 생성 시각이 있는 JSON-safe 계약으로 account/career/jobs/brewing/publishing/analytics 소유 데이터를 묶는다.
- 모든 쿼리가 user UUID로 직접 scope되고 삭제된 계정은 export할 수 없다.
- 반환값을 JSON round-trip한 값과 동일하게 정규화해 기계 판독성을 보장한다.

## 삭제 요청과 취소

- 요청 시 user row lock과 함께 `deletion_requested_at`, 30일 `purge_after`, 해시된 취소 token을 원자 저장한다.
- 같은 transaction에서 공개 portfolio를 unlisted, 현재 asset을 revoked 처리해 즉시 외부 접근을 차단한다.
- 인증이 차단된 상태에서도 opaque cancellation token으로 유예 취소가 가능하다.
- 취소 시 원래 portfolio 상태와 asset 접근을 복원하되 asset nonce를 회전해 요청 전 서명 URL은 다시 유효해지지 않는다.

## 유예 만료

- 30일 직전에는 어떤 데이터도 제거하지 않는다.
- 만료 시 analytics receipt/visit, metric/insight, user-owned graph 순으로 한 transaction에서 정리한다.
- account deletion request는 user FK를 분리해 purge 후에도 status/phase와 단계별 affected row 감사를 보존한다.

## 검증 결과

| 검사 | 결과 |
|---|---|
| migration 0019 PGlite/Compose PostgreSQL 적용 | PASS |
| export schema/JSON round-trip/owner scope | PASS |
| request 즉시 public·signed asset 차단 | PASS |
| cancel 상태 복원·old signature 무효화 | PASS |
| day 29 보존 / day 30 ordered purge audit | PASS |
| contracts | PASS — 13 tests |
| database | PASS — 11 tests |
| backend | PASS — 35 files, 75 tests |
| 전체 `pnpm test` | PASS — 99 tests |
| 전체 `pnpm typecheck` / `pnpm build` | PASS |
| `git diff --check` | PASS |

