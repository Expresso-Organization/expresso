---
title: 사이드바 로고 홈 이동 · 검색 줄 제거
slug: sidebar-logo-home
stage: spec
status: accepted
intent: .intent/intent_sidebar-logo-home.md
date: 2026-11-19
---

# 사이드바 로고 홈 이동 · 검색 줄 제거 — 명세

## 요구사항

- [ ] `SidebarFrame`에 `title`을 넘기지 않으면 브랜드 줄은 `href="/home"`, 접근 가능한 이름 「Expresso 홈」인 링크다.
- [ ] `title`을 넘기면(`ConversationSwitcher`) 브랜드 줄은 지금처럼 링크가 아니다.
- [ ] 사이드바가 접히면 브랜드 링크는 `tabIndex=-1`, `aria-hidden`이고 포인터를 받지 않는다. 펴기 단추는 지금처럼 눌린다.
- [ ] 브랜드 링크는 hover에 `--ex-bg-tint` 배경, `:focus-visible`에 `--ex-focus-ring`을 보인다.
- [ ] `SidebarNav`에 「검색」 버튼이 없다. 홈 · 라이브러리 · 탐색 · 분석 링크와 활성 표시는 그대로다.
- [ ] `HeaderActions`의 검색 단추와 `CommandPalette`의 ⌘K 처리는 바뀌지 않는다.

## 설계

재사용: `next/link`, 기존 `.brand` · `.brandMark` · `.brandName` 클래스, 접기 단추가 쓰는 `collapsed` 기반 `tabIndex` · `aria-hidden` 처리, 토큰 `--ex-bg-tint` · `--ex-focus-ring`.

- `SidebarFrame.tsx`: `title`이 없을 때 `.brand`를 `<Link href="/home" aria-label="Expresso 홈">`으로 그린다. 안쪽 `LogoMark` · `Wordmark`는 그대로다. `title`이 있으면 지금의 `<div>`다. 브랜드 줄이 제품 로고일 때만 홈으로 가는 것이 관행에 맞는다.
- `Sidebar.module.css`: `.brandLink`(링크일 때만 붙는다)에 radius · hover · focus-visible을 둔다. 접힌 상태 규칙(`@media (min-width: 1024px)`)에 `.brandLink { pointer-events: none; }`을 더한다. `collapsed`는 서랍 폭에서 언제나 거짓이므로 서랍에서는 링크가 그대로 동작한다.
- `SidebarNav.tsx`: 검색 버튼과 `openSearch` import를 지운다. `Sidebar.module.css`의 `.searchRow` · `.shortcut`은 다른 곳에서 쓰지 않으므로 지운다.

## 버린 대안

- `homeHref` 같은 새 prop: 호출 쪽 둘(`Sidebar`, `SidebarSkeleton`)이 같은 값을 넘기게 될 뿐이다. 「`title`이 없으면 제품 로고」라는 기존 규칙에 붙이는 편이 단순하다.
- 검색 줄을 숨기기(CSS): 쓰이지 않는 코드가 남는다.

## 함정

- 브랜드 줄 오른쪽은 접기 단추가 절대 위치로 덮는다(`.head` padding-right). 링크 영역이 단추 아래로 들어가지 않게 `.brand`의 기존 폭 규칙을 그대로 둔다.
- 화면 정의서의 사이드바 시안 다섯 곳에 「검색 ⌘K」가 남아 제품과 어긋난다. 이번 변경 범위 밖이다.

## 완료 기준

- `pnpm --filter @expresso/web typecheck`, `pnpm --filter @expresso/web test` 통과.
- 개발 서버에서 `/jobs` → 로고 클릭 → `/home` 이동, 사이드바에 「검색」 줄 없음, ⌘K로 검색 창 열림, 접은 상태에서 펴기 단추 동작.
