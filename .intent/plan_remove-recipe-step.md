---
title: 제작 흐름의 레시피 단계 제거
slug: remove-recipe-step
stage: plan
status: accepted
intent: .intent/intent_remove-recipe-step.md
spec: .intent/spec_remove-recipe-step.md
date: 2026-10-27
---

# 제작 흐름의 레시피 단계 제거 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/contracts/src/generation.ts` | `SubmitGenerationSchema`의 `recipeId` · `brewId` 둘 중 하나 |
| `packages/database/src/documents/generation.ts` | `recipeId: string \| null` |
| `packages/database/src/mongodb-migrations/0021/migration.ts` · `mongo-migrations.ts` | `generation_jobs.recipeId` null 허용 |
| `services/backend/src/modules/generation/service.ts` · `legacy-mysql-service.ts` | `brewId` 경로, `attachRecipe` · `failWaiting` |
| `services/backend/src/modules/generation/generation.integration.test.ts` | 기다리는 생성 → 붙이기 · 실패 |
| `services/backend/src/worker/processors/brew-jobs.ts` · `worker/main.ts` · 처리기 테스트 | 구성 잡 성공 · 마지막 실패에서 생성 잇기 |
| `services/web/src/components/shell/WizardShell.tsx` · `.test.tsx` | 단계에서 `outline` 제거 |
| `services/web/src/app/(app)/brew/new/resume-step.ts` · `.test.ts` | `recipe` → `design` |
| `services/web/src/app/(app)/brew/[brewId]/outline/*` | 삭제 |
| `services/web/src/app/(app)/brew/[brewId]/brew-actions.ts` | `continueToDesignAction`, 다시 그리는 경로 |
| `services/web/src/app/(app)/brew/[brewId]/use-refresh-while.ts`(새 파일) · `Waiting.tsx` | 1.5초 다시 읽기 훅 |
| `services/web/src/app/(app)/brew/[brewId]/counter/page.tsx` | 마지막 버튼 · 안내 문구 |
| `services/web/src/app/(app)/brew/[brewId]/design/design-actions.ts` · `.test.ts` | 구성 없으면 구성 잡 먼저, `brewId`로 생성 |
| `services/web/src/app/(app)/brew/[brewId]/design/DesignCatalog.tsx` · `page.tsx` · `Generating.tsx` | 만들기 버튼 상시, 구성 실패 이유, `recipePending` |
| `services/web/src/app/(app)/brew/[brewId]/design/GenerationWait.tsx` · `.test.tsx` | 구성 로딩 화면 |
| `services/web/src/lib/api/endpoints.ts` | 생성 요청 입력 타입(계약에서 파생) 확인 |
| `services/web/src/app/(app)/edit/[portfolioId]/Editor.tsx` | 빈 섹션 안내 문구 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 계약 · 문서 타입 · 마이그레이션 — `pnpm --filter @expresso/database build` 뒤 `pnpm db:migrate`가 체험 DB에서 0021을 적용한다.
2. 생성 서비스 `brewId` 경로 · `attachRecipe` · `failWaiting`과 통합 테스트 — `pnpm test:infra`의 generation 테스트.
3. 워커 처리기 — 처리기 단위 테스트(성공 → 붙이기, 마지막 실패 → 끝내기, 다시 도는 실패 → 그대로).
4. 웹: 단계 · 이어하기 · 레시피 화면 삭제 · AI 대화 버튼 — `pnpm --filter @expresso/web typecheck`.
5. 웹: 생성 요청 · 디자인 화면 · 구성 로딩 화면과 테스트.
6. 문구 정리 — `grep -rn "레시피" services/web/src`에서 화면 문구가 남지 않았는지.
7. 체험 서버(API 재시작 · 워커 재시작)에서 새 제작 한 번을 끝까지.

## 가장 위험한 단계

2~3번의 엇갈림. 생성 요청과 구성 완료가 거의 같은 때 일어나면 어느 쪽도 상대를 못 볼 수 있다. 요청 쪽이 저장 뒤 한 번 더 `attachRecipe`를 부르고, 구성 쪽이 완료 뒤 부르므로 둘 중 늦은 쪽이 반드시 상대를 본다. 통합 테스트에서 "구성이 먼저 끝난 뒤 요청"과 "요청 뒤 구성 완료" 두 순서를 모두 돌린다.

## 검증

```
pnpm typecheck
pnpm test
pnpm test:infra
```

화면: 공고로 새 제작을 시작해 재료 · AI 대화를 지나 디자인 선택으로 가서 바로 만들기를 누른다. 구성 로딩 화면 → 빈 지면 → 편집 화면까지 본다. 단계 줄이 다섯 칸인지도 본다.
