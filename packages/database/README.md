# @expresso/database

MongoDB 문서 타입, collection 접근자, validator·index 명세와 순서가 고정된
마이그레이션을 소유합니다. 애플리케이션 시작 과정에서는 schema를 바꾸지 않습니다.

```bash
MONGODB_MIGRATE_URL='mongodb://migration-user@127.0.0.1:57017/expresso?authSource=expresso&replicaSet=rs0' \
MONGODB_DATABASE=expresso pnpm db:migrate
```

마이그레이션은 `schema_migrations`에 버전과 SHA-256 checksum을 기록하고 lease로
동시 실행을 막습니다. 적용한 파일은 수정하지 않고 새 버전을 추가합니다. runtime
계정에는 collection·validator·index 변경 권한을 주지 않습니다.

공고 이관 도구가 읽는 MySQL 코드는 일회성 source adapter이며 런타임 의존성이
아닙니다.
