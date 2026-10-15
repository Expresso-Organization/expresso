---
title: 포트폴리오 제작 흐름의 설계서 6단계 복원
slug: portfolio-six-step-flow
stage: plan
status: accepted
intent: .intent/intent_portfolio-six-step-flow.md
spec: .intent/spec_portfolio-six-step-flow.md
date: 2026-10-15
---

# 포트폴리오 제작 흐름의 설계서 6단계 복원 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/contracts/src/generation.ts` (+ 테스트) | `SubmitGenerationSchema`에 `designSystemRevisionId`, 정확히 하나 규칙 |
| `packages/database/src/documents/generation.ts` · `portfolio.ts` | `designSystemRevisionId?` 타입 |
| `services/backend/src/modules/design-systems/index.ts` (새 파일) | `findDesignSystemRevision`, `generationStyleFor` |
| `services/backend/src/modules/design-systems/generation-style.test.ts` (새 파일) | 프리셋 30종 템플릿 일치, 내장 3종은 판의 색 사용, Refero 대체 |
| `services/backend/src/modules/generation/service.ts` | 판 ID 요청 처리와 저장, 포트폴리오로 복사 |
| `services/backend/src/modules/generation/*.test.ts` | 판 ID 요청 저장 테스트 |
| `services/backend/src/modules/page/service.ts` | 디자인 시스템 이름·설명 사용 |
| `services/web/src/components/shell/WizardShell.tsx` | 단계 정의 하나, `flow` 제거 |
| `services/web/src/app/(app)/brew/[brewId]/BrewFrame.tsx` · `outline/page.tsx` | `flow` 전달 제거 |
| `services/web/src/app/(app)/brew/[brewId]/design/page.tsx` | `legacy=1` 분기 제거, 카탈로그에 `recipeId`·`allowed` 전달 |
| `services/web/src/app/(app)/brew/[brewId]/design/DesignCatalog.tsx` | "이 디자인으로 만들기" 버튼, 레시피 없음·한도 초과 표시 |
| `services/web/src/app/(app)/brew/[brewId]/design/design-actions.ts` (+ 테스트) | 디자인 시스템 기준 `startGenerationAction` |
| `DesignPicker.tsx` · `TemplateThumb.tsx` · `template-thumb.module.css` · `design-filters.ts` · `design-picker.test.tsx` (삭제) | 닿지 않는 레거시 선택 화면 |
| `services/web/src/app/(app)/portfolio/new/page.tsx` | `/brew/new`로 이동 |
| `services/web/src/app/(app)/brew/new/new-brew-actions.ts` | 자유 제작 → `analyze` |
| `SidebarNav.tsx` · `ShellNav.tsx` · `home/page.tsx` · `Editor.tsx` · `onboarding/first-portfolio/page.tsx` | 입구 링크, 편집기 단계 표시줄 |
| `docs/architecture/portfolio-creation-flow-v2.md` | 상단에 "6단계로 되돌림(2026-10-15)" 상태 표기 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 계약과 문서 타입 — 계약 테스트가 정확히 하나 규칙을 확인하면 끝난 것이다.
2. 디자인 시스템 진입점과 변환 함수 — 템플릿 일치 테스트가 통과하면 끝난 것이다. 구현 중 확인: 연결된 판은 33종이며 내장 3종의 색이 템플릿과 달라 판의 색을 쓴다.
3. 생성 서비스와 `PageService` — 단위·통합 테스트가 통과하면 끝난 것이다.
4. 웹 단계 정의 하나로 통합, 입구 링크, 자유 제작 경로, 편집기 단계 표시줄 — 웹 타입 검사와 테스트가 통과하면 끝난 것이다.
5. 7단계 카탈로그 생성 연결과 레거시 선택 화면 삭제 — 액션 테스트가 통과하면 끝난 것이다.
6. 체험 서버를 이 워크트리로 바꿔 띄우고 처음부터 끝까지 진행한다. 화면 기록과 생성 CSS 값을 남기면 끝난 것이다.

## 가장 위험한 단계

**5단계와 6단계.** 카탈로그 버튼이 선택 저장과 생성 제출을 이어서 하는데, 저장만 되고 제출이 실패하면 사용자는 "적용됨"만 보게 됩니다. 제출 실패 문구를 카탈로그 하단에 보여 주고, 같은 버튼으로 다시 시도할 수 있게 합니다. 6단계에서 실제 AI 생성이 실패하면 원인이 이번 변경인지 생성기인지 로그로 가려서 보고합니다. 웹 변경은 커밋을 나눠 두어 하나씩 되돌릴 수 있게 합니다.

## 검증

```
pnpm typecheck
pnpm test
pnpm test:infra integration.test.ts --maxWorkers=2
```

화면 확인: 체험 서버(웹 3107)에서 사이드바 "새 포트폴리오" → 공고 붙여넣기 또는 목표 없이 → 여섯 단계 → 디자인 카탈로그에서 하나 선택 → "이 디자인으로 만들기" → 생성 완료 → 포트폴리오 열기 → 편집기 단계 표시줄.
