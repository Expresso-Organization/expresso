---
title: 거절·성공한 레시피·질문 작업의 다시 만들기
slug: brew-job-rebrew
stage: plan
status: accepted
intent: .intent/intent_brew-job-rebrew.md
spec: .intent/spec_brew-job-rebrew.md
date: 2026-10-25
---

# 거절·성공한 레시피·질문 작업의 다시 만들기 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/app/(app)/brew/[brewId]/brew-job-key.ts` (새 파일) | `brewJobKey` |
| `services/web/src/app/(app)/brew/[brewId]/brew-job-key.test.ts` (새 파일) | 키 단위 테스트 |
| `services/web/src/app/(app)/brew/[brewId]/brew-actions.ts` | 두 액션이 `basisJobId`로 키를 만든다 |
| `services/web/src/app/(app)/brew/[brewId]/Waiting.tsx` | `basisJobId` 속성과 숨은 입력 |
| `services/web/src/app/(app)/brew/[brewId]/counter/page.tsx` · `outline/page.tsx` | `brew.latestJob?.jobId` 전달, "구성 다시 만들기" 폼에 숨은 입력 |
| `services/backend/src/worker/processors/brew-jobs.ts` | `finalAttempt` 전달, 재시도 불가 실패를 `UnrecoverableError`로, 주석 정리 |
| `services/backend/src/worker/processors/brew-jobs.test.ts` (새 파일) | 처리기 단위 테스트 |
| `services/backend/src/modules/brew-jobs/service.ts` | `process`의 `{ finalAttempt }`와 큐 재시도 중 `queued` 기록 |
| `services/backend/src/modules/brew-jobs/legacy-mysql-service.ts` | 같은 선택 인자와 규칙 |
| `services/backend/src/modules/brew-jobs/brew-jobs.integration.test.ts` | 새 키 재제출 · 큐 재시도 중 상태 경우 추가 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 백엔드 `process`의 `finalAttempt`와 legacy 시그니처 — 백엔드 typecheck 통과
2. 처리기와 단위 테스트 — `vitest run src/worker/processors/brew-jobs.test.ts` 통과
3. 통합 테스트 추가: 성공 잡에 새 키 → 새 `jobId` · 새 아웃박스 · 다른 `resultId`. 재시도 불가 실패에 새 키 → 새 잡. `finalAttempt: false` 재시도 가능한 실패 → `queued`, 같은 키 재제출은 아웃박스를 늘리지 않음, 이어서 `finalAttempt: true` 실패 → `failed`
4. 웹 키 함수와 단위 테스트, 액션 · `Waiting` · 두 페이지 — 웹 typecheck와 테스트 통과
5. 전체 검증

## 가장 위험한 단계

3단계에서 고칠 `process`의 실패 기록. 조건을 잘못 쓰면 마지막 시도 실패가 `queued`로 남아 화면이 계속 기다린다. `finalAttempt` 기본값이 `true`라 직접 호출은 영향이 없고, Mongo e2e(실제 BullMQ)로 확인한다. 깨지면 `service.ts`와 처리기 두 파일을 되돌린다.

## 검증

```
pnpm --filter @expresso/backend exec vitest run src/worker/processors/brew-jobs.test.ts src/modules/brew-jobs/service.test.ts
pnpm --filter @expresso/web exec vitest run "src/app/(app)/brew/[brewId]/brew-job-key.test.ts"
pnpm test:infra
TEST_MONGODB_URL=… TEST_REDIS_URL=… pnpm --filter @expresso/backend exec vitest run test/e2e/brewing-flow.test.ts
pnpm typecheck
pnpm --filter @expresso/backend test
pnpm --filter @expresso/web test
```

화면 확인 경로: 레시피가 있는 브루의 레시피 단계에서 "구성 다시 만들기"를 누르면 "레시피 만드는 중"이 보이고, 끝나면 버전이 올라간다.
