---
title: 설정 화면의 사이드바 활성 표시
slug: settings-nav-indicator
stage: spec
status: accepted
intent: .intent/intent_settings-nav-indicator.md
date: 2026-11-10
---

# 설정 화면의 사이드바 활성 표시 — 명세

## 요구사항

- [ ] `sectionForPath("/account")`와 `/account/...`는 `null`을 돌려준다.
- [ ] `sectionForPath("/home")`은 `"home"`을 돌려준다.
- [ ] `/account` 아래 경로에서 사용자 줄이 `aria-current="page"`와 `rowActive` 클래스를 갖는다. 그 밖의 경로에서는 갖지 않는다.
- [ ] 로딩 골격(`SidebarSkeleton`)의 사용자 줄도 같은 부품을 쓴다.

## 설계

- `SidebarNav.tsx`의 `sectionForPath`에서 `/account`를 홈으로 묶던 조건과 그 주석을 지운다. `ShellTabBar`도 같은 함수를 쓰므로 함께 고쳐진다.
- 새 클라이언트 컴포넌트 `AccountLink.tsx`(`components/shell`)를 만든다. `usePathname()`으로 `/account` 하위 여부를 보고 `Link`에 `rowActive`를 붙인다. `Sidebar`는 서버 컴포넌트라 활성 판정을 여기서 할 수 없다.
- `Sidebar.tsx`와 `SidebarSkeleton.tsx`의 사용자 줄 `Link`를 `AccountLink`로 바꾼다. 자식(아바타·이름·톱니)은 그대로 넘긴다.
- 기존 `.rowActive` 배경(`--ex-bg-tint`)을 재사용한다. 새 CSS와 토큰은 만들지 않는다. `.userLink:hover`가 같은 색이므로 활성 줄은 호버와 구분되지 않는데, 다른 활성 줄도 같은 색이라 의도한 일관성이다.

## 버린 대안

`/account`를 `SidebarSection`의 새 값으로 추가하는 방법. `PRIMARY_ITEMS`에 없는 값이라 1차 메뉴 판정이 의미 없는 값을 들고 다니게 된다.

## 함정

`usePathname()`은 클라이언트 훅이라 `Sidebar.tsx`에 직접 쓸 수 없다. 설정 안의 해시 링크(`/account#ai-chat-settings`)는 경로가 `/account`이므로 같은 판정을 받는다.

## 완료 기준

`pnpm --filter @expresso/web test`와 `pnpm typecheck`가 통과하고, 개발 서버에서 `/account`의 사이드바를 확인한다.
