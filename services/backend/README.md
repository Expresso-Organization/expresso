# Expresso Backend

Expresso의 API와 비동기 Worker를 제공하는 TypeScript 서비스입니다.

## 실행 단위

- `pnpm dev`: Fastify API
- `pnpm dev:worker`: 비동기 Worker 런타임
- `pnpm build`: 두 런타임을 `dist/`에 컴파일

API와 Worker는 배포 단위만 분리하고, 도메인 모듈과 인프라 어댑터는 공유합니다.

## 현재 상태

첫 골격에는 환경 변수 검증, 종료 신호 처리, PostgreSQL·Redis 준비 상태 검사와 BullMQ Worker 팩토리가 포함되어 있습니다. 실제 도메인 모듈과 큐 프로세서는 다음 단계에서 명세 순서에 맞춰 추가합니다.

