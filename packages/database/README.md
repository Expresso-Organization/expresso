# Expresso Database

개발 포털의 데이터 모델 명세서와 ERD를 PostgreSQL 스키마로 구현합니다.

## 명령

```bash
pnpm --filter @expresso/database migrate
pnpm --filter @expresso/database test
```

마이그레이션 실행에는 `DATABASE_URL`이 필요합니다. 실행된 파일의 SHA-256 체크섬을 `schema_migration`에 저장하므로, 적용된 마이그레이션 파일을 나중에 수정하면 실행을 중단합니다.

## 원칙

- 마이그레이션은 순서를 바꾸거나 수정하지 않고 새 파일로만 확장합니다.
- 사용자 소유 테이블은 직접 `user_id`를 갖습니다.
- 분류 값은 PostgreSQL enum 대신 `text + check`로 검증합니다.
- 명세와 ERD의 차이는 [데이터 모델 구현 결정](../../docs/architecture/data-model-decisions.md)에 기록합니다.

