# Expresso

커리어 기록을 축적하고, 채용 공고에 맞는 포트폴리오를 생성·배포하며, 방문 데이터를 다음 행동으로 연결하는 플랫폼입니다.

이 저장소는 제품 전체를 관리하는 pnpm 모노레포입니다.

## 저장소 구조

```text
services/
  backend/      API와 비동기 Worker
  web/          사용자 웹
  mobile/       모바일 클라이언트
  desktop/      데스크톱 클라이언트
  dev-portal/   명세와 개발 포털
packages/
  contracts/    서비스 간 API 계약과 공유 타입
  database/     데이터베이스 스키마와 마이그레이션
```

`services`에는 독립적으로 실행하거나 배포할 제품 단위를 둡니다. 여러 서비스가 함께 사용하는 코드만 `packages`로 올립니다.

## 시작하기

Node.js 24 이상과 pnpm 11을 사용합니다.

```bash
pnpm install
pnpm infra:up
cp services/backend/.env.example services/backend/.env
pnpm db:migrate
pnpm dev:backend
```

백엔드 API의 기본 주소는 `http://127.0.0.1:4000`입니다.

```bash
curl http://127.0.0.1:4000/health/live
curl http://127.0.0.1:4000/health/ready
```

## 배포

운영 배포는 `docs/operations/DEPLOYMENT.md`를 따릅니다. `main`에 머지되면
`.github/workflows/web-deploy.yml`이 서버에서 `scripts/operations/deploy.sh`를
실행합니다.

현재 API는 PostgreSQL과 Redis를 준비 상태 검사에 포함합니다. `pnpm infra:up`은 기존 로컬 서비스와 충돌하지 않도록 PostgreSQL `55432`, Redis `56379`에 고정 이미지를 실행합니다. 두 인프라가 준비되지 않아도 API 프로세스는 시작되지만 `/health/ready`는 `503`을 반환합니다.
