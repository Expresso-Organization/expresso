---
title: 단축키 표시를 사용 중인 운영체제에 맞추기
slug: shortcut-platform-label
stage: spec
status: accepted
intent: .intent/intent_shortcut-platform-label.md
date: 2026-11-10
---

# 단축키 표시를 사용 중인 운영체제에 맞추기 — 명세

## 요구사항

- [ ] 맥·iOS·iPadOS에서는 수정 키가 `⌘`로 표시된다. 예: `⌘K`, `⌘↵`.
- [ ] 그 밖의 플랫폼에서는 `Ctrl+`로 표시된다. 예: `Ctrl+K`, `Ctrl+↵`.
- [ ] 서버 렌더와 하이드레이션 첫 렌더는 `⌘`로 그리고, 하이드레이션 뒤 비맥에서만 `Ctrl+`로 바뀐다. 하이드레이션 경고가 없다.
- [ ] `SidebarNav`, `EditorPanels`, `ElementChat`의 하드코딩된 `⌘` 표시가 모두 같은 함수를 쓴다.
- [ ] 플랫폼 판별과 표시 조립은 단위 테스트가 있다.

## 설계

- 새 파일 `src/lib/shortcut.ts`: 순수 함수 `isApplePlatform(platform: string)`(`/Mac|iPhone|iPad|iPod/`)와 `shortcutLabel(key: string, apple: boolean)`.
- 새 파일 `src/hooks/use-shortcut-label.ts`: `useShortcutLabel(key)`. `useSyncExternalStore`로 `navigator.userAgentData?.platform ?? navigator.platform`을 읽는다. 값이 바뀌지 않으므로 구독 함수는 빈 해제 함수를 돌려준다. 서버 스냅샷은 `true`(Apple)로 둔다.
- `SidebarNav.tsx`: `<span>⌘K</span>`를 `{useShortcutLabel("K")}`로 바꾼다.
- `EditorPanels.tsx`, `ElementChat.tsx`: `⌘↵`를 `useShortcutLabel("↵")`로 바꾼다.
- 키 입력 처리는 이미 `metaKey || ctrlKey`이므로 바꾸지 않는다.

## 버린 대안

- 서버에서 `sec-ch-ua-platform` 헤더로 정하기: 이 페이지들이 요청 헤더를 읽으면 정적 렌더가 풀리고, 플랫폼 판별은 클라이언트 값 하나로 충분하다.
- `navigator.platform`만 쓰기: deprecated이고 Chromium은 `userAgentData.platform`을 권장한다. 둘을 순서대로 쓴다.
- 비맥에서 `Ctrl`을 별도 글리프(`⌃`)로 표시하기: 윈도우 사용자에게 익숙한 표기가 아니다.

## 함정

- 서버 스냅샷과 클라이언트 값이 다르면 `useSyncExternalStore`가 하이드레이션 뒤 다시 그린다. 비맥에서 짧은 순간 `⌘K`가 보인다. 서버가 플랫폼을 모르므로 피할 수 없고, 맥(대부분 사용자)에서는 바뀌지 않는 쪽으로 기본값을 정했다.
- `.shortcut` 클래스는 mono 글꼴 3xs 크기다. `Ctrl+K`가 `⌘K`보다 넓어 줄이 좁은 사이드바에서 잘리는지 확인한다.

## 완료 기준

- `pnpm --filter @expresso/web test` 통과(새 단위 테스트 포함).
- `pnpm --filter @expresso/web typecheck` 통과.
- 개발 서버에서 사용자 에이전트를 윈도우로 바꾼 뒤 사이드바에 `Ctrl+K`가 보이고 줄이 잘리지 않는다.
