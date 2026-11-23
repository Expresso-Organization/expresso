---
title: 사이드바 「새 대화」 버튼
slug: sidebar-new-chat
stage: spec
status: accepted
intent: .intent/intent_sidebar-new-chat.md
date: 2026-11-23
---

# 사이드바 「새 대화」 버튼 — 명세

## 요구사항

- [ ] `SidebarNav`의 첫 줄에 「새 포트폴리오」 링크와 「새 대화」 링크(`href="/home"`, 접근 이름 「새 대화」)가 이 순서로 선다.
- [ ] 「새 대화」의 곡률은 `--ex-radius-pill`, 높이는 「새 포트폴리오」와 같은 34px이다.
- [ ] `:hover`와 `:focus-visible`에서 문구가 펼쳐지고, 폭은 고정값 없이 문구 폭만큼 늘어난다.
- [ ] `/home`에서 `chat` · `compose` · `new` 파라미터가 있으면 `router.push("/home", { transitionTypes: [AGENT_CHAT_CLOSE] })`로 간다.
- [ ] `/home`에 파라미터가 없으면 이동하지 않고 홈 입력창에 포커스를 준다.
- [ ] 수정키(⌘ · Ctrl · Shift) 클릭과 가운데 클릭은 브라우저 기본 동작(새 탭)을 그대로 둔다.
- [ ] 접힌 레일(≥1024px, `data-sidebar-collapsed="true"`)에서는 두 버튼이 세로로 쌓이고 문구가 펼쳐지지 않는다.

## 설계

- 재사용: `.brew` 스타일, `--ex-radius-pill` · `--ex-border-soft` · `--ex-border-firm` · `--ex-motion-glide` 토큰, 대화 화면 「새 대화」가 쓰는 `AGENT_CHAT_CLOSE` 전환, 묶음 머리말이 쓰는 `grid-template-*: 0fr → 1fr` 접기 기법.
- `SidebarNav.tsx`: 두 링크를 `.actions` 줄로 감싼다. 「새 대화」는 `next/link`의 `Link`에 `onClick`을 붙여 위 두 경우만 기본 이동을 막는다. 쿼리는 클릭할 때 `window.location.search`에서 읽어, `useSearchParams` 구독으로 사이드바가 주소마다 다시 그려지지 않게 한다.
- 문구 펼침: `.newChatLabel`을 `display:grid; grid-template-columns:0fr`로 두고 hover · focus-visible에서 `1fr`로 바꾼다. 안쪽 글자는 `min-width:0; overflow:hidden`이다.
- 입력창 포커스: `agent-handoff.ts`에 창 이벤트 이름 `AGENT_COMPOSER_FOCUS`를 두고, `HomeStart`가 이 이벤트를 들어 `input.current?.focus()`를 부른다. 기존 `AGENT_CONVERSATIONS_EVENT`와 같은 방식이다.

## 버린 대안

- 고정 폭(`width: 88px`) 전환: 문구와 글꼴에 따라 값이 바뀌고 토큰에 없는 수를 새로 만든다.
- `interpolate-size: allow-keywords`로 `width:auto` 전환: Safari가 지원하지 않는다.
- 「최근 대화」 머리말의 `+` 버튼: 레일과 대화 0개일 때 사라진다(시안 검토에서 버림).

## 함정

- `[data-sidebar-collapsed] .copy`가 글자를 숨기므로, 레일에서는 문구 칸도 `0fr`로 못 박아야 hover에서 폭이 늘지 않는다.
- 서랍(<1024px)에서는 터치라 hover가 없다. 원형 버튼만 보이고 누르면 동작한다.
- `SidebarNav.test.tsx`가 링크 순서를 검사하므로 `/home`이 하나 더 들어간 순서로 고친다.

## 완료 기준

- `pnpm --filter @expresso/web test` 통과, `pnpm --filter @expresso/web typecheck` 통과.
- 개발 서버에서 펼침 · hover · 레일 · 대화 중 클릭을 스크린샷으로 확인.
