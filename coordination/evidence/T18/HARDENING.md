# T18 보안·성능·복구 하드닝 증거

- 상태: verified
- 일자: 2026-08-09 (Asia/Seoul)
- 체크리스트: M7-01, M7-02, M7-03, M7-04

## M7-01 보안

- owner-scoped route inventory 23개가 bearer 검증 전 handler에 진입하지 않음을 자동 검사했다.
- 기존 전 도메인 IDOR, strict DTO/mass assignment, event 크기/rate, signed URL/nonce/expiry, 로그 secret 부정 회귀를 통합했다.
- resume storage key를 pdf/doc/docx로 제한하고 request/provider timeout을 30초로 고정했다.
- 미해결 P0/P1: 0건.

## M7-02 성능과 backpressure

- fresh DB 고정 부하의 p95: read 50.3ms, write 5.1ms, event 3.1ms, queue registration 1.4ms.
- 모든 수치가 각각 300/300/150/200ms 예산 이하다.
- hot visitor는 10건 수락 후 10건 429, outbox batch/Worker concurrency/retry/DLQ 경계를 검증했다.

## M7-03 fault injection

- DB 강제 rollback에서 domain/outbox 잔존 0건.
- queue `ECONNREFUSED` 후 outbox pending 보존, 복구 후 정확히 1회 publish.
- hung dependency는 typed timeout으로 종료된다.
- 실제 Redis retry/DLQ와 M2/M4/M5 Worker 재전달에서 유실/중복 효과/quota 중복 차감 0건.

## M7-04 백업 복구

- 비어 있지 않은 source를 custom-format으로 백업해 격리 DB에 실제 복원했다.
- `migration|user|record|deployment|snapshot md5` fingerprint가 원본과 복구본에서 일치했다.
- 결과: `20|1|1|1|8dbef496c255ae7bb149a3350d677a09`, PASS.
- runbook과 재실행 가능한 scripts를 `docs/operations`, `scripts/operations`에 보존했다.

## 검증 결과

| 검사 | 결과 |
|---|---|
| security gate | PASS — 2 tests |
| load/backpressure | PASS — 2 tests |
| fault injection | PASS — 3 tests |
| actual backup/restore/checksum | PASS |
| 전체 `pnpm test` | PASS — 108 tests |
| 전체 `pnpm typecheck` / `pnpm build` | PASS |
| pipeline structure / `git diff --check` | PASS |

