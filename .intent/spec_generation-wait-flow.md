---
title: 생성 기다림 화면과 다듬기 바로 넘어가기
slug: generation-wait-flow
stage: spec
status: accepted
intent: .intent/intent_generation-wait-flow.md
date: 2026-10-27
---

# 생성 기다림 화면과 다듬기 바로 넘어가기 — 명세

## 요구사항

- [ ] `BrewState.latestGeneration`에 `createdAt`이 있다. Mongo(`materials/service.ts`)와 MySQL(`legacy-mysql-service.ts`) 둘 다 채운다.
- [ ] 생성 중(`queued` · `running`)인 03 화면은 시작 시각(`createdAt`) 뒤 10초까지 브루잉, 그 뒤 입력 묶음을 보인다. 10은 사용자가 정한 값이다(2026-10-27 요청).
- [ ] 브루잉 줄은 이 브루에서 고른 기록(`brews.materials` 중 `selected`)이고, 기록이 없으면 빈 잔만 그린다.
- [ ] 입력 묶음은 공고(`brew.posting`), 디자인 이름(`designSystems.revision`), 레시피 섹션 전부(제목 · 목적 · `context.goal` · `context.points`), 고른 기록을 보인다. 디자인을 못 읽으면 그 줄만 빠진다.
- [ ] 전환: 기록 줄은 같은 `recordId`의 입력 묶음 행으로 옮겨 가고, 잔은 상태 줄의 로고 자리로 옮겨 가며 작아지고, 섹션은 위에서부터 차례로 나타난다. `prefers-reduced-motion`이면 바로 바꾼다.
- [ ] 청사진(`blueprint` 이벤트)이 오면 `LivePreview`가 지금처럼 카드를 지면으로 바꾼다. 브루잉 중에 와도 같다.
- [ ] 끝난 생성(`done`, `again` 아님)의 03 화면은 `/edit/{portfolioId}`로 `redirect`한다. 생성 중 `done` 이벤트 뒤 `router.refresh()`가 같은 분기를 타서 편집 화면으로 간다.
- [ ] "다 뽑혔습니다" 카드와 `openPortfolioAction`이 없다.
- [ ] 편집 화면 머리줄에 `/brew/{brewId}/design?again=1` 링크 "디자인을 바꿔 다시 뽑기"가 있다.

## 설계

- **재사용:** `docs/portfolio-creation-flow-v2`의 `recipe/Brewing.tsx` · `Brewing.module.css`(3e16ed04 · cae5637d · bbd4cb74)를 `design/Brewing.tsx`로 옮긴다. 레시피 전용 `ReadingPanel`은 버리고 잔과 기록 줄(`Brewing`)만 내보낸다. 줄마다 `data-record-id`를 단다. 아래 문장(`STAGES`)은 지면 작업으로 바꾼다.
- **`design/GenerationWait.tsx`(새 파일):**
  - `startedAt`, `reading`(공고 · 디자인 이름 · 섹션 · 기록), `queued`를 받는다.
  - `phase`는 `brewing`이나 `reading`이다. 남은 시간만큼 `setTimeout`을 걸고, 바꾸기 직전에 브루잉 줄과 잔의 위치를 잰다(FLIP).
  - 입력 묶음이 그려진 뒤 `useLayoutEffect`에서 같은 `recordId` 행과 상태 줄 로고에 Web Animations API로 위치 차이를 거꾸로 걸었다가 푼다. 화면 밖이던 줄은 옮기지 않고 섹션과 함께 나타난다.
  - 시간 · 곡선은 `--ex-motion-panel`, 섹션 간격은 브루잉 줄과 같은 `WAVE_MS`를 쓴다.
- **`Generating.tsx`:** 생성 중 분기만 남는다. `LivePreview`의 `children`으로 `GenerationWait`과 새로고침 버튼을 준다.
- **`LivePreview`:** `thinking` 문장(`.thought`)은 지운다. 상태 줄이 같은 말을 한다.
- **`page.tsx`:** 생성 중이면 `brews.materials` · `recipes.get` · `designSystems.revision`을 함께 불러 `reading`을 만든다. 끝났으면 `redirect`한다.
- **편집 화면:** `Editor.tsx`의 `toolbarRight`, "테마" 앞에 `Link`를 둔다. 모양은 `themeAction`과 같다. 다듬기 안내(`refining` · 8초 `router.refresh`)는 이미 있으므로 그대로 둔다.

## 버린 대안

- 레시피 대기 화면 브랜치를 merge하는 방법: main과 36커밋이 갈렸고 `recipe/` 흐름이 이미 바뀌어 충돌만 늘어난다. 컴포넌트만 옮긴다.
- 클라이언트 마운트 시각으로 10초를 세는 방법: 새로고침마다 브루잉이 다시 뜬다(intent의 "다시 열면 이어서"에 어긋난다).
- `done` 이벤트에서 클라이언트가 직접 `/edit`로 옮기는 방법: `done`에는 `pageId`만 있고 `portfolioId`가 없다. 서버 분기 하나로 모은다.

## 함정

- 숨긴 브라우저 창에서는 애니메이션과 rAF가 멈춘다. 전환 확인은 창을 보이게 하거나 headless Chrome으로 한다.
- 서버 시각과 브라우저 시각이 다르면 남은 시간이 틀어진다. 남은 시간은 0~10초로 자른다.
- 옛 CSS가 지금 `tokens.css`에 없는 변수를 쓸 수 있다. 옮길 때 확인한다.
- `brew.posting`이 없는 자유 브루는 공고 줄이 빠진다.

## 완료 기준

- `pnpm typecheck`, `pnpm test`(web · contracts · backend), `pnpm test:infra` 통과.
- 체험 서버(3107 · 4007)에서 생성을 눌러 0초 브루잉, 10초 전환, 입력 묶음, 청사진, 완성 후 `/edit` 이동을 스크린샷으로 확인한다.
