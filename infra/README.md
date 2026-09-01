# Expresso local infrastructure

로컬 인프라는 인증된 MongoDB 8.0 단일 노드 replica set과 Redis입니다. 데이터
포트는 각각 `127.0.0.1:57017`, `127.0.0.1:56379`에만 열립니다.

```bash
pnpm infra:up
MONGODB_MIGRATE_URL='mongodb://expresso_migration:expresso_migration@127.0.0.1:57017/expresso?authSource=expresso&replicaSet=rs0' pnpm db:migrate
pnpm infra:ready
```

`mongodb-keyfile`이 keyfile을 준비하고 `mongodb-init`이 rs0 primary와 두 계정을
검증·생성합니다. `expresso_runtime`은 데이터 읽기·쓰기만 가능하고 collection,
validator, index 변경은 migration 계정만 할 수 있습니다. CI와 서버 compose도 같은
MongoDB image digest와 초기화 스크립트를 사용합니다.

`pnpm infra:down`은 컨테이너만 내립니다. 기존 `expresso-mysql`을 포함한 어떤
volume도 삭제하지 않으며, 운영 절차에서도 `down -v`를 사용하지 않습니다.

MongoDB만 필요한 격리 검증에는 `infra/compose.mongodb.yaml`과
`pnpm infra:mongodb:up`을 사용할 수 있습니다. 테스트는 자신이 만든 무작위 DB만
삭제합니다.
