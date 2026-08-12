# 단계 배포·rollback runbook

## 순서

1. 검증된 PostgreSQL 백업과 현재 API/Worker artifact checksum을 보존한다.
2. expand-only migration을 적용한다.
3. 새 Worker 한 인스턴스를 시작하고 scheduled/outbox lag와 dead letter를 확인한다.
4. 새 API 한 인스턴스를 시작해 `/health/live`, `/health/ready`와 핵심 public/auth smoke를 확인한다.
5. 트래픽을 5%→25%→100%로 늘리며 5xx, p95, queue lag, failed/dead-letter, quota ledger를 관찰한다.
6. 임계값을 넘으면 트래픽을 0%로 내리고 보존한 이전 API/Worker artifact를 다시 시작한다.
7. deployment rollback은 불변 행을 수정하지 않고 portfolio current pointer만 이전 version으로 전환한다.

## 중단 임계값

- readiness 실패 또는 5xx > 1%
- read/write p95 > 300ms, event p95 > 150ms, queue registration p95 > 200ms
- outbox dead-letter 증가, queue lag 5분 초과
- quota/ledger 불일치 또는 공개 snapshot checksum 불일치
- P0/P1 보안 발견

## 로컬 staging 리허설

```bash
scripts/operations/rehearse-staged-rollout.sh
```

이 스크립트는 고정된 격리 DB와 queue prefix에서 migration→compiled API/Worker→readiness→scheduled queue drain을 실행한다. 이어 보존한 pre-deploy artifact로 API/Worker를 재시작하고 current deployment를 version 1로 되돌려 public snapshot과 version 2 비노출을 확인한 뒤 격리 DB를 제거한다.

2026-08-09 실행 결과: migration 20, scheduled succeeded 6, dead-letter 0, failed run 0, rollback snapshot `version one`, PASS.
