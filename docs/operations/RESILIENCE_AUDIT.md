# 장애 재시도·멱등성 감사

- 감사일: 2026-08-09
- 결론: 중복 도메인 효과 0건, 감사 대상 outbox 유실 0건, quota 중복 차감 0건

| 주입 장애 | 기대 상태 | 결과 |
|---|---|---|
| DB transaction 중 강제 예외 | domain/outbox 모두 rollback | PASS |
| Redis/queue `ECONNREFUSED` | outbox pending, sanitized 오류, 복구 후 1회 publish | PASS |
| hung provider/API dependency | typed timeout, late result 미사용 | PASS |
| Worker 실패/재전달 | 동일 job ID retry, terminal DLQ 또는 단일 완료 | PASS |
| generation provider 오류 | retryable draft, quota 미차감 | PASS |
| duplicate generation 100회/Worker 10회 | portfolio/quota/ledger 각 1회 | PASS |
| duplicate analysis/scheduler | version/run/domain effect 각 1회 | PASS |

실제 Redis Worker restart/재전달 경로는 M2/M4/M5 종단 E2E와 queue retry/DLQ 통합 테스트에서 함께 검증한다. 오류 메시지 원문은 outbox, notification, scheduler, DLQ에 저장하지 않고 error name/code만 보존한다.

