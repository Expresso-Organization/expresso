---
title: 실패한 레시피·질문 작업의 다시 시도
slug: brew-job-retry
stage: plan
status: accepted
intent: .intent/intent_brew-job-retry.md
spec: .intent/spec_brew-job-retry.md
date: 2026-10-25
---

# 실패한 레시피·질문 작업의 다시 시도 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/backend/src/modules/brew-jobs/service.ts` | `brewJobOutboxKey` 추가, `submit`의 재시도 가능한 실패 되돌리기와 새 키 발행 |
| `services/backend/src/modules/brew-jobs/service.test.ts` (새 파일) | `brewJobOutboxKey` 단위 테스트 |
| `services/backend/src/modules/brew-jobs/brew-jobs.integration.test.ts` (새 파일) | 실제 MongoDB에서 재제출 · 발행 · 재처리 검증 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. `brewJobOutboxKey`와 단위 테스트 — `vitest run src/modules/brew-jobs/service.test.ts` 통과
2. `submit` 수정 — `pnpm --filter @expresso/backend typecheck` 통과
3. 통합 테스트: `materials.integration.test.ts`처럼 `createMongoFixture` · 가입 · `createFreeBrew`로 준비한다. 경우는 넷이다.
   - 재시도 가능한 실패 → 재제출 → 같은 `jobId` · `queued` · 아웃박스 2건(키가 다름). `MongoOutboxDispatcher.pollOnce()`를 가짜 `QueuePublisher`로 돌려 서로 다른 `jobId`로 두 번 `add`되는지 본다. 이어서 성공하는 실행부로 `process` → `succeeded`
   - 재시도 불가 실패 → 재제출 → `failed` 유지, 아웃박스 1건
   - 성공 → 재제출 → 재생, 아웃박스 1건
   - 실패 후 동시 재제출 두 번 → 아웃박스 2건(새로 1건)
4. `pnpm infra:up` 후 `pnpm test:infra`, 이어서 `pnpm typecheck` · `pnpm test`

## 가장 위험한 단계

2단계. 대기·실행 중 작업에 대한 재제출에서 발행을 생략하는 변경이 기존 동시 첫 제출 테스트에 영향을 줄 수 있다. 첫 제출은 삽입한 쪽만 발행하고, 경합에서 진 쪽은 `withTransaction` 재시도로 기존 문서를 읽는다. 깨지면 `service.ts` 한 파일을 되돌리면 된다.

## 검증

```
pnpm --filter @expresso/backend exec vitest run src/modules/brew-jobs/service.test.ts
pnpm infra:up
pnpm test:infra
pnpm typecheck
pnpm test
```

UI 변경은 없다. 화면 확인 경로: 실패한 브루의 레시피 단계에서 "레시피 만들기"를 누르면 "차례를 기다리는 중"이 보인다.
