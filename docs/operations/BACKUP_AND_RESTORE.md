# PostgreSQL 백업·복구 runbook

## 백업

저장 위치를 명시해 custom-format 논리 백업을 만든다.

```bash
scripts/operations/backup-postgres.sh /secure/path/expresso-$(date +%Y%m%dT%H%M%S).dump
```

백업 파일은 애플리케이션 checkout 밖의 암호화 저장소로 이동하고 접근 권한과 보존 기간을 별도로 적용한다.

## 격리 복구 검증

아래 명령은 고정 이름 `expresso_restore_rehearsal` DB만 새로 만들고 종료 시 제거한다. 운영 `expresso` DB와 volume은 변경하지 않는다.

```bash
scripts/operations/rehearse-postgres-restore.sh /secure/path/expresso-TIMESTAMP.dump
```

복구 후 migration 수, 사용자/기록/deployment 행 수와 deployment snapshot checksum을 원본과 비교한다. `restore_rehearsal=PASS` 전에는 백업을 복구 가능하다고 판정하지 않는다.

## 장애 복구 순서

1. 쓰기 트래픽과 Worker를 중지하고 마지막 outbox/queue lag를 기록한다.
2. 새 PostgreSQL 환경에 검증된 백업을 복원한다.
3. API와 Worker가 사용하는 `DATABASE_URL`을 새 환경으로 전환한다.
4. migration checksum, 핵심 row count, deployment snapshot checksum을 다시 확인한다.
5. API readiness 후 Worker를 먼저 한 인스턴스로 시작해 outbox 중복 효과가 없는지 확인한다.
6. 단계적으로 API 트래픽을 열고 오류율·queue lag·quota ledger를 관찰한다.

## 마이그레이션 rollback 원칙

운영 migration은 기존 컬럼을 제거하거나 의미를 바꾸지 않는 expand 단계로 배포한다. 장애 시 DB down-migration 대신 이전 API/Worker 이미지를 재배포한다. destructive contract 단계는 별도 백업과 호환성 기간 후 다음 릴리스에서 수행한다.

