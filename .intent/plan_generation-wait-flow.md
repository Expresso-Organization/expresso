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
| `packages/contracts/src/materials.ts` | `latestGeneration.createdAt` 추가 |
| `services/backend/src/modules/materials/service.ts` · `legacy-mysql-service.ts` | `createdAt` 채우기 |
| `services/backend/src/modules/materials/materials.integration.test.ts` | `createdAt` 확인 |
| `services/web/src/app/(app)/brew/[brewId]/design/Brewing.tsx` · `Brewing.module.css` | 옛 브랜치에서 옮겨 온 잔 · 기록 줄 |
| `services/web/src/app/(app)/brew/[brewId]/design/GenerationWait.tsx` · `GenerationWait.module.css` | 브루잉 → 입력 묶음과 전환 |
| `services/web/src/app/(app)/brew/[brewId]/design/GenerationWait.test.tsx` | 10초 분기 · 다시 열기 · 동작 줄이기 |
| `services/web/src/app/(app)/brew/[brewId]/design/Generating.tsx` | 완료 카드 제거, 기다림 화면 연결 |
| `services/web/src/app/(app)/brew/[brewId]/design/LivePreview.tsx` · `.module.css` | `thinking` 문장 제거 |
| `services/web/src/app/(app)/brew/[brewId]/design/page.tsx` | 완료 시 `redirect`, 입력 묶음 데이터 |
| `services/web/src/app/(app)/brew/[brewId]/design/design-actions.ts` | `openPortfolioAction` 제거 |
| `services/web/src/app/(app)/edit/[portfolioId]/Editor.tsx` | 다시 뽑기 링크 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 계약 · 백엔드 `createdAt`: contracts 빌드 후 `pnpm --filter @expresso/backend test:infra`의 materials 통합 테스트가 통과한다.
2. `Brewing` 옮기기: 옛 CSS 변수가 `tokens.css`에 있는지 확인하고, 없는 것은 지금 토큰으로 바꾼다.
3. `GenerationWait`와 테스트: 가짜 시계로 9초에는 브루잉, 10초에는 입력 묶음, `startedAt`이 30초 전이면 처음부터 입력 묶음이 보이는지 확인한다.
4. `Generating` · `page.tsx` · `LivePreview` · `design-actions` 연결: `pnpm --filter @expresso/web typecheck`.
5. 편집 화면 링크.
6. 체험 서버에서 실제 생성 한 번: 보이는 창에서 0초 · 10초 · 청사진 · 완성 후 `/edit`를 스크린샷으로 남긴다.

## 가장 위험한 단계

3번 전환. 브루잉 줄은 `transform` · `opacity` · `blur`가 걸린 채 움직이고 있어서, 잰 위치가 줄의 실제 자리와 다를 수 있다. `getBoundingClientRect`는 `transform`이 반영된 값을 주므로 그대로 쓴다. 어긋나면 기록 이동을 빼고 나타나기만 남긴다. 그때는 이 plan과 spec을 같은 커밋에서 고친다.

## 검증

```
pnpm typecheck
pnpm test
pnpm test:infra
```

화면: 03 디자인 선택에서 생성을 누른다. 브루잉 10초, 전환, 입력 묶음, 청사진 채우기, 완성 후 편집 화면 이동, 편집 화면 "디자인을 바꿔 다시 뽑기"까지 따라간다. 생성 중 30초쯤 새로고침도 한 번 한다.
