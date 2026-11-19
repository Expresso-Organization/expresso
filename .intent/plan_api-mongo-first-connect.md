---
title: API Mongo 첫 연결 실패 뒤 영구 503 복구
slug: api-mongo-first-connect
stage: plan
status: draft
intent: .intent/intent_api-mongo-first-connect.md
spec: .intent/spec_api-mongo-first-connect.md
date: 2026-11-07
---

# API Mongo 첫 연결 실패 뒤 영구 503 복구 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/backend/src/platform/mongodb.ts` | `connectMongoUntilReady` |
| `services/backend/src/platform/mongodb.test.ts` | 재시도와 중단 시험 |
| `services/backend/src/api/main.ts` | 재시도 시작과 중단 |
| `services/backend/src/api/api-process.integration.test.ts` | 새 파일. 실제 API 프로세스 시험 |
| `README.md` | 503 계약 설명에 자동 복구 추가 |

## 작업 순서

1. 프로세스 시험으로 재현 — 완료. 지금 코드에서 Mongo 복귀 20초 뒤에도 503이다.
2. `connectMongoUntilReady`와 단위 시험 — `vitest run src/platform/mongodb.test.ts`.
3. `api/main.ts` 연결 — 프로세스 시험 두 건 통과.
4. 전용 Mongo 컨테이너로 실제 재시작 확인.
5. `pnpm typecheck`, `pnpm test`, `pnpm test:infra`.

## 가장 위험한 단계

3단계의 종료 순서다. 재시도가 `database.close()` 뒤에 `connect()`를 부르면 닫은 클라이언트가 다시 열려 프로세스가 끝나지 않는다. `stop`의 첫 줄에서 중단하고, SIGTERM 시험으로 확인한다. 문제가 생기면 `api/main.ts`의 세 줄만 되돌리면 된다.

## 검증

```
pnpm typecheck
pnpm test
pnpm test:infra
```

실제 재시작: 전용 컨테이너로 확인하고 결과를 PR에 붙인다. 공용 `expresso-local-mongodb-1`은 건드리지 않는다.
