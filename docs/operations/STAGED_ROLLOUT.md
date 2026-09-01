# MongoDB 단계적 전환 리허설

## 범위

이 절차는 격리된 rehearsal DB와 새 Redis prefix에서 빌드 artifact를 검증합니다.
운영 전환이나 T19 승인을 대신하지 않습니다.

```mermaid
flowchart LR
    BUILD["계약·DB·백엔드 빌드"] --> MIGRATE["격리 DB migration"]
    MIGRATE --> START["API·Worker<br/>새 queue prefix"]
    START --> READY["readiness"]
    READY --> SMOKE["가입 smoke"]
    SMOKE --> VERIFY["schema·collection 검증"]
    VERIFY --> DROP["격리 DB만 삭제"]
```

```bash
export MONGODB_REHEARSAL_URL='mongodb://admin:...@127.0.0.1:57017/?authSource=admin&replicaSet=rs0'
export MONGODB_REHEARSAL_DATABASE=expresso_staging_rehearsal
export TEST_REDIS_URL=redis://127.0.0.1:56379
scripts/operations/rehearse-staged-rollout.sh
```

스크립트는 DB 이름에 `staging` 또는 `rehearsal`이 없으면 중단합니다. 종료할 때
자신이 만든 DB만 삭제하고 Redis 전체 삭제와 기존 prefix 소비를 하지 않습니다.
