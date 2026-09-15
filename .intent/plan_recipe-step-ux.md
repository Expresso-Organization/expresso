---
title: 02 레시피 고르기·고치기 화면 완성도
slug: recipe-step-ux
stage: plan
status: accepted
intent: .intent/intent_recipe-step-ux.md
spec: .intent/spec_recipe-step-ux.md
date: 2026-09-15
---

# 02 레시피 고르기·고치기 화면 완성도 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/styles/tokens.css` | 간격 · 반경 · 조작 높이 토큰 추가 (고침) |
| `packages/contracts/src/recipe-v2.ts` | `confirm` · `restore` 편집 연산 (고침) |
| `packages/contracts/src/contracts.test.ts` | 두 연산의 파싱 테스트 (고침) |
| `services/backend/src/modules/recipe/recipe-v2-service.ts` | 두 연산 적용 · 편집 뒤 `draft` 복귀 (고침) |
| `services/backend/src/modules/recipe/recipe-v2.integration.test.ts` | confirm · restore · draft 복귀 검사 (고침) |
| `services/web/package.json` | `@dnd-kit/core` · `sortable` · `utilities` (고침) |
| `services/web/src/components/shell/SaveState.tsx` | 저장 상태 제공자 · 표시 (새로) |
| `services/web/src/components/shell/WizardShell.tsx` | 머리말이 표시 컴포넌트를 그림 (고침) |
| `services/web/src/app/(app)/brew/[brewId]/BrewFrame.tsx` | 제공자로 감쌈 (고침) |
| `services/web/src/app/(app)/brew/[brewId]/recipe/recipe-editor.ts` | 낙관적 리듀서 · 저장 큐 · 실행 취소 훅 (새로) |
| `services/web/src/app/(app)/brew/[brewId]/recipe/Workbench.tsx` | 카드 위계 · DnD · 메뉴 · 근거 줄 · 안 쓴 기록 · 확정 CTA (고침) |
| `services/web/src/app/(app)/brew/[brewId]/recipe/Workbench.module.css` | 토큰 기반으로 다시 씀 (고침) |
| `services/web/src/app/(app)/brew/[brewId]/recipe/Setup.tsx` | 두 칸 · 요약 · 순위 이유 조건 · 다시 짜기 확인 (고침) |
| `services/web/src/app/(app)/brew/[brewId]/recipe/Setup.module.css` | 토큰 기반으로 다시 씀 (고침) |
| `services/web/src/app/(app)/brew/[brewId]/recipe/page.tsx` | 공고 요건 글 전달 · 안 쓴 기록 전달 (고침) |
| `packages/contracts/src/materials.ts` | 재료에 `matchedTerms` 추가 — 「순위 이유」 칸이 문장 대신 겹친 말을 그린다 (고침, 구현 중 추가) |
| `services/backend/src/modules/materials/ranking.ts` · `service.ts` · `legacy-mysql-service.ts` · `ranking.test.ts` | 저장된 이유 문장에서 겹친 말을 되돌리는 `matchedTermsOf` (고침, 구현 중 추가) |
| `services/web/src/app/(app)/brew/[brewId]/BrewSkeleton.tsx` | 머리말의 없어진 `saveState` prop 제거 (고침, 구현 중 추가) |

## 작업 순서

1. 토큰 — `tokens.css`에 추가. `pnpm --filter @expresso/web typecheck`가 그대로 통과.
2. 계약 — `confirm` · `restore` 추가, 테스트. `pnpm --filter @expresso/contracts test`.
3. 백엔드 — `#apply`에 두 분기, `reorder` · 편집 끝에 `status: draft`. 통합 테스트
   추가. `pnpm --filter @expresso/backend test` · `pnpm test:infra`.
4. 의존성 — `pnpm --filter @expresso/web add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`.
5. 저장 상태 — `SaveState.tsx` · `WizardHeader` · `BrewFrame`. 다른 마법사 화면의
   머리말이 그대로 "자동 저장됨"을 보이는지 03(legacy) 화면에서 확인.
6. 편집기 훅 — `recipe-editor.ts`. 리듀서는 계약의 연산마다 한 분기. 큐는 Promise
   체인. `past` · `future`.
7. Workbench — 훅으로 갈아 끼우고 카드 · DnD · 메뉴 · 근거 줄 · 레일 · CTA. CSS 다시 씀.
8. Setup — 두 칸 · 요약 · 조건부 칸 · 확인 단계. CSS 다시 씀.
9. page.tsx — 요건 글 · 안 쓴 기록 전달.
10. 검증 — 아래 명령과 브라우저 확인. 대비 재계산.
11. 커밋 — 토큰/계약/백엔드 하나, 웹 하나. 푸시.

## 구현 중 벗어난 것

- 「순위 이유」를 빈 칸으로 두려면 겹친 말이 있는지 화면이 알아야 한다. 저장된
  이유는 문장 하나(`reasonText`)라, 계약에 `matchedTerms`를 더하고 백엔드가 읽을 때
  그 문장에서 되돌린다(`matchedTermsOf`). 저장 문서는 바꾸지 않았다.
- 「다시 짜기」 확인 단계가 처음 구현에서 건너뛰어졌다 — 같은 자리의 버튼 한 노드가
  누르는 순간 `type="submit"`으로 바뀌어 브라우저가 폼을 냈다. `key`로 노드를 갈라
  고쳤다. 그 사이 로컬 브루 하나(`0b7a…`)에 실제 초안 잡이 한 번 걸렸다.
- dnd-kit 의 접근성 id 가 서버 · 클라이언트에서 달라 hydration 경고가 났다.
  `DndContext`에 `useId()` 값을 준다.

## 가장 위험한 단계

7번. 낙관적 반영과 서버 판 교체가 엇갈리면 화면이 서버와 다른 것을 보여 준다.
되돌리는 방법: 실패하면 `recipeV2.get`으로 서버 판을 다시 받아 그대로 그리고
스택을 비운다. DnD가 깨지면 손잡이를 빼도 「⋯」 메뉴로 같은 일을 할 수 있다.

## 검증

```
pnpm --filter @expresso/contracts build && pnpm --filter @expresso/database build
pnpm typecheck
pnpm --filter @expresso/contracts test
pnpm --filter @expresso/backend test
pnpm test:infra
```

브라우저 — 브랜치 서버 `http://localhost:3103`.
- `/brew/532f768d-9c25-4be2-ba9b-58b0a0992e8b/recipe` (섹션 없음 → 고르기)
- `/brew/0b7a4a30-0be5-45bd-a8c4-55a7caaa28ef/recipe` (섹션 6 → 고치기)
- 1440×940 · 1024×768 · 390×844. spec 「완료 기준」의 조작 경로대로.
