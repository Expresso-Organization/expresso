---
title: Worker Mongo 복구 불가 오류 종료 처리
slug: worker-mongo-exit
stage: plan
status: draft
intent: .intent/intent_worker-mongo-exit.md
spec: .intent/spec_worker-mongo-exit.md
date: 2026-11-06
---

# Worker Mongo 복구 불가 오류 종료 처리 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/backend/src/platform/mongodb.ts` | 선택 시간 상수와 오류 판별 함수 |
| `services/backend/src/platform/mongodb.test.ts` | 새 파일. 실제 드라이버로 닫힌 topology 재현 |
| `services/backend/src/worker/poll-loop.ts` | 새 파일. 폴링 루프 |
| `services/backend/src/worker/poll-loop.test.ts` | 새 파일. 실제 dispatcher로 장애 재현 |
| `services/backend/src/worker/create-queue-worker.ts` | 도달 불가 오류 지연 처리와 `onFatalError` |
| `services/backend/src/platform/queue.integration.test.ts` | 잡 지연 · 시도 횟수 · DLQ 시험 |
| `services/backend/src/worker/worker-process.integration.test.ts` | 새 파일. Worker 프로세스 종료 코드 시험 |
| `services/backend/src/worker/main.ts` | 시작 연결, `stopOnFatal`, 루프 교체 |

## 작업 순서

1. 프로세스 시험을 먼저 쓰고 지금 코드에서 실패하는지 본다 — 프로세스가 끝나지 않아 시간 초과.
2. `mongodb.ts` 판별 함수와 단위 시험 — `vitest run src/platform/mongodb.test.ts`.
3. `poll-loop.ts`와 단위 시험 — 실제 dispatcher가 폴링 2회 만에 `onFatal`에 닿는다.
4. `create-queue-worker.ts`와 큐 통합 시험 — `attemptsMade` 0, DLQ 비어 있음.
5. `main.ts` 연결 — 1단계 시험 통과.
6. 전용 Mongo 컨테이너로 실제 재시작 확인 — intent의 세 장면.
7. `pnpm typecheck`, `pnpm test`, `pnpm test:infra`.

## 가장 위험한 단계

4단계. 도달 불가 오류의 범위를 넓게 잡으면 영구 오류가 시도 횟수 없이 무한히 미뤄진다. 그래서 `MongoServerSelectionError`, `MongoNetworkError`, 닫힌 클라이언트 오류로만 한정한다. 인증 오류(`MongoServerError`)는 포함하지 않는다. 문제가 생기면 `create-queue-worker.ts`의 지연 분기만 되돌리면 폴링 종료는 그대로 남는다.

## 검증

```
pnpm typecheck
pnpm test
pnpm test:infra
```

실제 재시작: 전용 컨테이너(공용 `expresso-local-mongodb-1`은 건드리지 않음)와 `Restart=always`를 흉내 낸 셸 루프로 확인하고 결과를 PR에 붙인다.
