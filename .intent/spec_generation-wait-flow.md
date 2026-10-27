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
- [ ] 브루잉은 처음 10초 동안 화면 가운데에, 그 뒤로는 화면 위에 계속 선다. 무엇을 하는 중인지 적는 문구("추출하는 중", 차례 · 단계 문장)는 없다.
- [ ] 입력 묶음은 구역 넷이다. 채용 공고(`brew.posting` + `jobAnalyses.get`의 요건 · 종류), 디자인(`designSystems.list`에서 고른 판의 `DesignThumb` 표지 · 이름 · 설명 · 특징), 섹션(제목 · 목적 · `context.points`), 기록(고른 재료의 서랍 · 제목 · 순위 이유). 빈 구역과 못 읽은 구역은 그리지 않는다.
- [ ] 입력 묶음은 두 벌을 이어 두고 아래에서 위로 흐른다(초당 18px). 첫 벌을 다 올리면 그만큼 되돌려 끝없이 돈다. 묶음이 칸보다 짧거나 `prefers-reduced-motion`이면 흐르지 않는다.
- [ ] 사용자가 스크롤하면 흐름이 멈추고, `scrollend`에서 그 자리부터 다시 흐른다.
- [ ] 전환: 10초가 되면 브루잉 그림이 화면 위로 옮겨 가고(잔이 내려가는 결 `--ex-fall`), 구역이 아래에서 차례로 올라온다(`--ex-motion-panel`, 간격 `WAVE_MS`). `prefers-reduced-motion`이면 바로 바꾼다.
- [ ] 청사진(`blueprint` 이벤트)이 오면 `LivePreview`가 지금처럼 카드를 지면으로 바꾼다. 브루잉 중에 와도 같다.
- [ ] 끝난 생성(`done`, `again` 아님)의 03 화면은 `/edit/{portfolioId}`로 `redirect`한다. 생성 중 `done` 이벤트 뒤 `router.refresh()`가 같은 분기를 타서 편집 화면으로 간다.
- [ ] "다 뽑혔습니다" 카드와 `openPortfolioAction`이 없다.
- [ ] 편집 화면 머리줄에 `/brew/{brewId}/design?again=1` 링크 "디자인을 바꿔 다시 뽑기"가 있다.

## 설계

- **재사용:** `docs/portfolio-creation-flow-v2`의 `recipe/Brewing.tsx` · `Brewing.module.css`(3e16ed04 · cae5637d · bbd4cb74)를 `design/Brewing.tsx`로 옮긴다. 레시피 전용 `ReadingPanel`과 단계 문장(`STAGES`)은 버리고 잔과 기록 줄(`Brewing`)만 내보낸다. 디자인 표지는 카탈로그의 `DesignThumb`을 내보내 쓴다. 요건 종류의 말은 01 공고 분석과 같은 표(`requirement-kind.ts`)를 쓴다.
- **`design/GenerationWait.tsx`(새 파일):**
  - `brewingLeftMs`, `reading`, `actions`(새로고침)를 받는다. 남은 시간은 `page.tsx`가 서버 시계로 잡 시작 시각과 견줘 계산한다(`wait-timing.ts`의 `brewingLeftMs`). 브라우저 시계와 섞지 않아 시계 차이가 생기지 않고, 서버 렌더와 첫 화면이 같은 단계로 그려진다.
  - `phase`는 `brewing`이나 `reading`이다. 남은 시간만큼 `setTimeout`을 걸고, 바꾸기 직전에 브루잉 그림의 위치와 잔의 결을 잰 뒤, 바뀐 자리에서 Web Animations API로 위치 차이를 거꾸로 걸었다가 푼다(FLIP). 브루잉 그림은 같은 노드로 남아 잔과 줄이 끊기지 않는다.
  - `useFeedLoop`: rAF로 `scrollTop`을 올린다. 우리가 쓴 값과 다른 위치가 읽히면 사람이 움직인 것으로 보고 멈춘다. 두 번째 벌은 `aria-hidden` · `inert`다.
- **`Generating.tsx`:** 생성 중 분기만 남는다. `LivePreview`의 `children`으로 `GenerationWait`과 새로고침 버튼을 준다.
- **`LivePreview`:** `thinking` 문장(`.thought`)을 지운다.
- **`page.tsx`:** 생성 중이면 `brews.materials` · `recipes.get` · `designSystems.list` · `jobAnalyses.get`을 함께 불러 `reading`을 만든다. 뒤의 둘은 실패해도 그 구역만 빠진다. 끝났으면 `redirect`한다.
- **편집 화면:** `Editor.tsx`의 `toolbarRight`, "테마" 앞에 `Link`를 둔다. 모양은 `themeAction`과 같다. 다듬기 안내(`refining` · 8초 `router.refresh`)는 이미 있으므로 그대로 둔다.

## 버린 대안

- 레시피 대기 화면 브랜치를 merge하는 방법: main과 36커밋이 갈렸고 `recipe/` 흐름이 이미 바뀌어 충돌만 늘어난다. 컴포넌트만 옮긴다.
- 첫 시안: 상태 줄 · 제목 · 안내 문구를 단 한 장짜리 문서와, 기록 줄을 기록 목록 행으로 옮기는 전환. 사용자가 시각적으로 지루하다고 해서 구역별 그리드와 흐르는 묶음으로 바꿨다. 위의 브루잉이 계속 남으므로 기록 줄을 옮길 곳도 없어졌다.
- 클라이언트 마운트 시각으로 10초를 세는 방법: 새로고침마다 브루잉이 다시 뜬다(intent의 "다시 열면 이어서"에 어긋난다).
- `done` 이벤트에서 클라이언트가 직접 `/edit`로 옮기는 방법: `done`에는 `pageId`만 있고 `portfolioId`가 없다. 서버 분기 하나로 모은다.

## 함정

- 숨긴 브라우저 창에서는 애니메이션과 rAF가 멈춘다. 전환 확인은 창을 보이게 하거나 headless Chrome으로 한다.
- 서버 시각과 브라우저 시각이 다르면 남은 시간이 틀어진다. 그래서 서버가 남은 시간을 계산해 넘기고, 0~10초로 자른다.
- 옛 CSS가 지금 `tokens.css`에 없는 변수를 쓸 수 있다. 옮길 때 확인한다.
- `brew.posting`이 없는 자유 브루는 채용 공고 구역이 빠진다. 체험 DB의 실측 브루가 그렇다.
- `scrollTop`에 소수를 써도 브라우저가 화면 픽셀로 맞춰 읽는다. 사람의 스크롤을 가르는 기준은 그 차이(1px)보다 크게 둔다.
- Turbopack이 컴파일 오류를 보여 주다 한글 글자 경계에서 패닉으로 죽은 적이 있다(next 16.3.0). 체험 서버가 내려가면 다시 띄운다.

## 완료 기준

- `pnpm typecheck`, `pnpm test`(web · contracts · backend), `pnpm test:infra` 통과.
- 체험 서버(3107 · 4007)에서 생성을 눌러 0초 브루잉, 10초 전환, 입력 묶음, 청사진, 완성 후 `/edit` 이동을 스크린샷으로 확인한다.
