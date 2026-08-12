# Expresso local infrastructure

Docker Compose는 로컬에 이미 실행 중인 PostgreSQL/Redis와 충돌하지 않도록 기본적으로 PostgreSQL `55432`, Redis `56379` 포트를 사용합니다.

```bash
pnpm infra:up
pnpm infra:ready
DATABASE_URL=postgres://expresso:expresso@127.0.0.1:55432/expresso pnpm db:migrate
```

백엔드 실행 시 compose 인프라를 사용하려면 `services/backend/.env`의 URL을 다음과 같이 설정합니다.

```dotenv
DATABASE_URL=postgres://expresso:expresso@127.0.0.1:55432/expresso
REDIS_URL=redis://127.0.0.1:56379
```

`pnpm infra:down`은 컨테이너만 중지하고 volume은 보존합니다. 데이터 volume 삭제는 별도 운영이며 자동화하지 않습니다.
