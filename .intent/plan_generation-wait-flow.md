---
title: 생성 기다림 화면과 다듬기 바로 넘어가기
slug: generation-wait-flow
stage: plan
status: accepted
intent: .intent/intent_generation-wait-flow.md
spec: .intent/spec_generation-wait-flow.md
date: 2026-10-27
---

# 생성 기다림 화면과 다듬기 바로 넘어가기 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/contracts/src/materials.ts` | `latestGeneration.createdAt`, 재료의 `categoryKey` 추가 |
| `services/backend/src/modules/materials/service.ts` · `legacy-mysql-service.ts` | `createdAt` · `categoryKey` 채우기 |
| `services/web/src/lib/career-category-icons.ts` · `components/shell/SidebarCategories.tsx` · `features/career-editor/views/CareerViewShell.tsx` | 서랍 아이콘 표(§3.5)를 한 곳으로 모음. 저장된 아이콘 이름(lucide)이 웹 아이콘 묶음(Phosphor)에 없어 기록 카드 아이콘이 비던 것을 서랍 키로 고친다 |
| `services/backend/src/modules/materials/materials.integration.test.ts` | `createdAt` 확인 |
| `services/web/src/app/(app)/brew/[brewId]/design/Brewing.tsx` · `Brewing.module.css` | 옛 브랜치에서 옮겨 온 잔 · 기록 줄 |
| `services/web/src/app/(app)/brew/[brewId]/design/GenerationWait.tsx` · `GenerationWait.module.css` | 위의 브루잉과 잔 아래 한 줄, 구역이 하나씩 올라와 쌓이는 지면, 전환 |
| `services/web/src/app/(app)/brew/[brewId]/design/feed-steps.ts` · `feed-steps.test.ts` | 멈출 자리 계산, 곡선, 움직임 값 읽기 |
| `services/web/src/app/(app)/brew/[brewId]/design/wait-timing.ts` | 브루잉 시간(10초)과 남은 시간 계산 |
| `services/web/src/app/(app)/brew/[brewId]/design/GenerationWait.test.tsx` | 10초 분기 · 다시 열기 · 구역 · 문구 없음 · 남은 시간 |
| `services/web/src/app/(app)/brew/[brewId]/design/DesignCatalog.tsx` | `DesignThumb` 내보내기 |
| `services/web/src/app/(app)/brew/[brewId]/requirement-kind.ts` · `analyze/page.tsx` | 요건 종류의 말을 두 화면이 함께 쓰게 옮김 |
| `services/web/src/app/(app)/brew/[brewId]/design/page.module.css` | 쓰지 않게 된 완료 카드 스타일 제거 |
| `services/web/src/app/(app)/brew/[brewId]/design/Generating.tsx` | 완료 카드 제거, 기다림 화면 연결 |
| `services/web/src/app/(app)/brew/[brewId]/design/LivePreview.tsx` · `.module.css` | `thinking` 문장 제거 |
| `services/web/src/app/(app)/brew/[brewId]/design/page.tsx` | 완료 시 `redirect`, 입력 묶음 데이터 |
| `services/web/src/app/(app)/brew/[brewId]/design/design-actions.ts` | `openPortfolioAction` 제거 |
| `services/web/src/app/(app)/edit/[portfolioId]/Editor.tsx` | 다시 뽑기 링크 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 계약 · 백엔드 `createdAt`: contracts 빌드 후 `pnpm --filter @expresso/backend test:infra`의 materials 통합 테스트가 통과한다.
2. `Brewing` 옮기기: 옛 CSS 변수가 `tokens.css`에 있는지 확인하고, 없는 것은 지금 토큰으로 바꾼다.
3. `GenerationWait`와 테스트: 가짜 시계로 9초에는 브루잉만, 10초에는 구역 넷, 남은 시간이 0이면 처음부터 구역이 보이는지, 진행 문구가 없는지 확인한다.
4. `Generating` · `page.tsx` · `LivePreview` · `design-actions` 연결: `pnpm --filter @expresso/web typecheck`.
5. 편집 화면 링크.
6. 체험 서버에서 실제 생성 한 번: 보이는 창에서 0초 · 10초 · 청사진 · 완성 후 `/edit`를 스크린샷으로 남긴다.

## 가장 위험한 단계

입력 묶음 한 칸 이동. 사람의 스크롤과 우리가 쓴 스크롤을 위치 차이로 가르므로, 브라우저가 소수 위치를 반올림하는 폭보다 기준이 작으면 스스로 멈춘다. headless Chrome으로 0.25초마다 위치와 올라온 구역 수를 재서 1.5초마다 하나씩 쌓이는지, 다 쌓인 뒤 비우고 다시 쌓는지, 휠 뒤 멈췄다가 이어 가는지 본다. 어긋나면 흐름을 끄고 손 스크롤만 남긴 뒤 spec을 고친다.

## 검증

```
pnpm typecheck
pnpm test
pnpm test:infra
```

화면: 03 디자인 선택에서 생성을 누른다. 브루잉 10초, 전환, 흐르는 입력 묶음, 휠로 멈추기, 청사진 채우기, 완성 후 편집 화면 이동, 편집 화면 "디자인을 바꿔 다시 뽑기"까지 따라간다. 생성 중 새로고침도 한 번 한다.
