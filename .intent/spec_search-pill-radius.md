---
title: 검색 칸 · 검색 버튼 pill 곡률 통일
slug: search-pill-radius
stage: spec
status: accepted
intent: .intent/intent_search-pill-radius.md
date: 2026-11-10
---

# 검색 칸 · 검색 버튼 pill 곡률 통일 — 명세

## 요구사항

- [ ] `tokens.css` 셸 치수 절에 `--ex-radius-pill: 999px`가 있다.
- [ ] 아래 규칙의 `border-radius`가 `var(--ex-radius-pill)`이다.
  - `home/page.module.css` `.searchBar` · `.searchSubmit`(이미 999px — 토큰으로만 바꾼다)
  - `jobs/page.module.css` `.searchBar` · `.querySubmit` · `.queryRow`(새로 칠함)
  - `brew/new/page.module.css` `.entrySearch` · `.entryGo` · `.search`
  - `analytics/page.module.css` `.drawerSearch`
  - `brew/[brewId]/design/DesignCatalog.module.css` `.searchField`
  - `features/agent-chat/AgentChat.module.css` `.search` · `.browserTabs .search`
  - `features/career-editor/views/views.module.css` `.searchField` · `.searchField button`
  - `edit/[portfolioId]/page.module.css` 새 `.librarySearch`(RecordLibrary 검색 칸)
- [ ] `/jobs` 확정 상태: `.queryCard`는 테두리 · 배경 · 곡률이 없는 세로 묶음이다. `.queryRow`가 pill 바(강조 테두리 + 링)이고 `.parsedRow`는 그 아래 테두리 없는 줄이다. 조건 칩 팝오버가 잘리지 않는다.
- [ ] `styles/tokens.test.ts`: 모듈 CSS에서 마지막 복합 선택자의 클래스 이름에 `search`가 들어간 규칙이 `border-radius`를 적으면 값이 `var(--ex-radius-pill)`이다.
- [ ] pill 안쪽 패딩이 버튼과 바의 중심을 맞춘다 — 바 안 버튼의 위 · 아래 · 오른쪽 여백이 같다.

## 설계

재사용: 홈 `.searchBar`/`.searchSubmit`이 기준 모양이다(패딩 `8px 8px 8px 22px`, 버튼 pill). `/jobs` `.searchBar`가 이미 같은 구조라 `.querySubmit`만 토큰으로 바꾸면 된다.

- 토큰: `tokens.css`의 `:root` 셸 치수 절에 곡률 토큰을 하나 둔다. 테마마다 값이 같으므로 역할 토큰 절이 아니라 치수 절이다.
- `/jobs` 확정 상태: 마크업은 그대로 두고 CSS만 바꾼다. `.queryCard`에서 테두리 · 링 · 배경 · 곡률을 걷고 `display:flex; flex-direction:column; gap`만 남긴다. 테두리 · 링 · 배경은 `.queryRow`로 옮기고 패딩을 빈 검색바와 같은 `8px 8px 8px 22px`로 맞춘다. `.parsedRow`의 배경 · 윗선 · 아래 곡률(14.5px)을 걷고 좌우 패딩을 바의 글자 시작점(22px)에 맞춘다. 클리핑을 쓰지 않으므로 칩 팝오버는 지금처럼 밖으로 나간다.
- `/brew/new` `.entrySearch`: 높이 56px, 패딩 `0 8px 0 18px` 그대로 pill이 된다. 왼쪽 패딩은 홈과 같은 22px로 넓혀 둥근 끝과 아이콘이 붙지 않게 한다.
- RecordLibrary: `.textInput`은 속성 패널 입력 칸들과 공유하므로 바꾸지 않는다. 검색 칸에만 `.librarySearch`를 더해 곡률과 좌우 패딩을 덮는다.
- 작은 칸: 곡률만 토큰으로 바꾸고 좌우 패딩을 높이의 절반 가까이로 늘려 글자가 둥근 끝에 닿지 않게 한다. 커리어 툴바의 닫기 버튼(`.searchField button`)은 원으로 만들어 바깥 pill과 동심이 되게 한다.
- 검사: `tokens.test.ts`에 「검색 칸 곡률」 describe를 더한다. 기존 `cssFiles` · `stripComments`를 재사용하고 규칙 단위로 선택자를 쪼개 본다.

## 버린 대안

- `/jobs` 확정 카드를 유지하고 버튼만 pill: 검색 전후 모양이 달라 요청자가 고르지 않았다.
- 곡률 단계(sm · md · lg) 전체 도입: 화면 정의서에도 단계가 없고(7px 363회, 999px 342회, 5 · 8 · 9 · 10px 각각 100회 이상) 단계 값을 정할 근거가 없다. 보고서로 결정을 요청한다.
- 공용 `SearchField` 컴포넌트로 묶기: 화면마다 마크업 · 아이콘 · 동작이 달라 이번 범위(곡률)보다 크다.

## 함정

- `.querySubmit`은 빈 검색바와 확정 검색바가 함께 쓴다 — 두 상태 모두 확인한다.
- `/portfolio/new`는 `/brew/new`의 `.entrySearch`를 함께 쓴다.
- 커리어 툴바 `.searchField`는 모바일 폭 미디어 쿼리에서 `flex`만 바뀐다. 곡률은 그대로 이어진다.
- `next dev`가 `services/web/AGENTS.md`를 다시 쓴다 — 스테이징하지 않는다.

## 완료 기준

- `pnpm typecheck`, `pnpm --filter @expresso/web test` 통과.
- 브라우저 조사 스크립트(`radius-probe.mjs`)를 다시 돌려 위 라우트의 검색바와 버튼이 `pill: true`로 나온다.
- 검사가 실제로 잡는지: `.drawerSearch`를 10px로 되돌리면 「검색 칸 곡률」이 실패한다(확인 뒤 원복).
