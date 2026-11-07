# Plan: 포트폴리오 병렬 생성

1. `services/backend/src/config/runtime-config.ts`, `.env.example`: `WORKER_CONCURRENCY`.
2. `services/backend/src/worker/queue-routing.ts`(새 파일): `queueNameFor`. 시험을 붙인다.
3. `services/backend/src/worker/main.ts`: `generation-jobs` 큐 · 워커, 세 큐에 동시 수 적용, 종료 절차.
4. 시험: `create-queue-worker` 동시 실행 통합 시험. 같은 공고 동시 분석은 기존 `scores a concurrent reader against the common extraction that actually won` 시험이 이미 검증한다.
5. 검증: `pnpm typecheck` → `pnpm test` → `pnpm test:infra`, 머지 후 운영에서 생성을 겹쳐 실행해 측정한다.
