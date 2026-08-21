# 출시 성능·backpressure 보고서

## 2026-08-21 · MySQL

- 환경: local Docker MySQL 8.4, Node.js 26, fresh migrated database
- dataset: home read 100회, record write 40회, anonymous event 60회, aggregate queue registration 40회

| 경로 | 예산 | 측정 p95 | 결과 |
|---|---:|---:|---|
| 대표 read (`GET /v1/home`) | 300ms | 54.9ms | PASS |
| 대표 write (`POST /v1/career/records`) | 300ms | 2.9ms | PASS |
| event collection | 150ms | 2.4ms | PASS |
| queue registration | 200ms | 1.4ms | PASS |

측정값은 같은 suite의 가장 최근 verbose 실행에서 올림해 기록했다. 성능 test는 매
실행마다 p95를 다시 계산해 예산 초과 시 실패한다.

Backpressure는 visitor hash별 이름 있는 잠금과 rate limit, outbox batch size, BullMQ
worker concurrency, retry/backoff 및 DLQ로 제한된다. hot visitor 20건 fixture에서
10건 수락 후 10건을 429로 거부했으며 poison job은 설정된 재시도 뒤 DLQ 한 건으로
수렴한다.

## 2026-08-09 · PostgreSQL (전환 전)

- 환경: local Docker PostgreSQL 18.4, Node.js 26, fresh migrated database
- dataset: home read 100회, record write 40회, anonymous event 60회, aggregate queue registration 40회

| 경로 | 예산 | 측정 p95 | 결과 |
|---|---:|---:|---|
| 대표 read (`GET /v1/home`) | 300ms | 50.3ms | PASS |
| 대표 write (`POST /v1/career/records`) | 300ms | 5.1ms | PASS |
| event collection | 150ms | 3.1ms | PASS |
| queue registration | 200ms | 1.4ms | PASS |

측정값은 같은 suite의 가장 최근 verbose 실행에서 올림해 기록했다. 성능 test는 매 실행마다 p95를 다시 계산해 예산 초과 시 실패한다.

Backpressure는 visitor hash별 advisory lock과 rate limit, outbox batch size, BullMQ worker concurrency, retry/backoff 및 DLQ로 제한된다. hot visitor 20건 fixture에서 10건 수락 후 10건을 429로 거부했으며 poison job은 설정된 재시도 뒤 DLQ 한 건으로 수렴한다.

