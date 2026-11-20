---
title: 앱 전반의 화면 바뀜 모션
slug: app-motion
stage: spec
status: accepted
date: 2026-11-20
---

# 앱 전반의 화면 바뀜 모션 — 명세

## 요구사항

1. **R1 스켈레톤 → 내용**: `loading.tsx` · `<Suspense fallback>`이 내용으로 바뀌면 스켈레톤은 160ms(`--ex-motion-quick`)에 옅어지고, 내용은 같은 때 220ms(`--ex-motion-glide`)에 떠오른다. 이전 화면 → 스켈레톤은 움직이지 않는다. 공고 상세 · 구직 목표의 내용이 보이는 시각이 고치기 전(survey-5의 99ms · 58ms)보다 늦어지지 않는다.
2. **R2 짧은 대기**: 스켈레톤 막대(`Skel` · `SkelCard`)는 150ms 동안 투명하다가 200ms에 나타난다. 대기가 150ms 안에 끝나면 막대가 보이지 않는다.
3. **R3 지난 대화**: 주소에 `?chat=`이 있으면 `AgentChat`의 첫 렌더부터 그 대화를 불러오는 상태다. 시작 화면(`Welcome`)을 그리지 않는다. 기록이 도착하면 메시지 묶음이 떠오른다.
4. **R4 새 대화**: 대화 화면의 「새 대화」는 `AGENT_CHAT_CLOSE` 타입으로 `/home`에 간다. 대화 화면이 빠지고, 입력창이 아래에서 가운데로 옮겨 가며, 홈이 들어온다.
5. **R5 제안 카드**: 카드마다 `<ViewTransition key>`를 두고 피드 갱신을 Transition 안에서 한다. 빠지는 카드는 옅어지고, 남은 카드는 280ms에 자리를 옮기며, 새 카드는 떠오른다.
6. **R6 기록 보기**: 보기를 고르는 갱신을 Transition 안에서 하고, 보기 렌더러를 `key={view.id}`인 `<ViewTransition>`으로 감싸 교차한다.
7. **R7 라이브러리**: 오른쪽 지면 칸을 `<Suspense key={선택}>`으로 감싸 왼쪽 목록이 먼저 선다. `loading.tsx`는 두지 않는다 — `?s=`로 칸을 바꿀 때 목록까지 스켈레톤으로 바뀐다. 지면 미리보기 `iframe`은 `load` 뒤에 160ms에 나타난다.
8. **R8 승인 카드**: 상태 문구는 마운트 뒤 값이 바뀌었을 때만 떠오른다. 처음 그려질 때는 움직이지 않는다.
9. **R9 온보딩**: 단계 본문(`panel`)이 같은 이름을 나눠 옛 본문이 옅어지고 새 본문이 떠오르며 크기를 맞춘다. 머리줄 · 아래 바는 바로 바뀐다.
10. **R10 움직임 줄이기**: `prefers-reduced-motion: reduce`이면 위 모션이 돌지 않는다. 기존 전역 규칙(`tokens.css` §12 · `global.css` 뷰 전환 규칙)이 덮는지 확인하고 빠진 자리만 더한다.
11. **R11 회귀 없음**: #251의 홈 → 대화 전환(입력창 짝 · 말풍선)이 그대로 돈다.

## 설계

- **`components/motion/Reveal.tsx`**: 두 갈래. `RevealPending`은 `exit="reveal-out"`만, `RevealContent`는 `enter="reveal-in"`만 가진다(`default="none"`). 이전 화면 → 스켈레톤은 어느 쪽도 돌지 않고, 스켈레톤 → 내용만 돈다. 둘 다 돌면 전환이 둘이 되고, React는 도는 전환이 끝난 뒤 다음 전환을 시작하므로 내용이 늦어진다(react.dev 「ViewTransition」). React는 삽입 · 삭제된 트리에서 DOM보다 바깥에 있는 경계에만 enter · exit을 걸므로 감쌀 자리는 화면의 맨 바깥이다.
  - `AppBody`가 자기 DOM을 감싼다. `loading.tsx`는 `<AppBody pending>`을 쓴다. 머리줄은 감싸지 않는다. 같은 화면 안의 갱신(검색 조건 · `router.refresh`)은 부품이 남아 있어 돌지 않는다.
  - 셸을 쓰지 않는 편집 화면은 `edit/[portfolioId]/loading.tsx`와 `page.tsx`가 직접 감싼다. 홈의 제안 · 위젯 `Suspense`는 fallback과 내용을 각각 감싼다.
  - 먼저 공고 상세 · 구직 목표로 시각과 막대 프레임을 재고, 늦어지면 설계를 다시 본다.
- **R2**: `global.css`에 `.ex-anim-skeleton`(shimmer + `ex-appear` 200ms ease 150ms both)과 `.ex-anim-appear`를 둔다. 150ms · 200ms는 대화 기록 스켈레톤(`ThreadHistorySkeleton`)이 이미 쓰는 값이다. `Skel`은 `ex-anim-shimmer` 대신 `ex-anim-skeleton`을 쓴다.
- **R3**: `useAgentConversation`이 `initialId`를 받아 `useState(initialId)`로 시작한다. 기록을 기다리는 동안은 입력이 막혀(`isDisabled`) 기록 스켈레톤도 그리지 않는 빈 스레드다 — 이것을 그대로 두고 기록이 오면 떠오르게 한다. 홈 `page.tsx`가 `chat`을 `AgentChat`의 `chatId`로 넘긴다. `AgentChat` 루트에 `data-restore="pending|done"`(기록을 기다렸던 대화만)을 두고, `done`이 되면 메시지 묶음에 `ex-vt-fade-in`과 같은 값의 애니메이션을 건다. 보낸 말 말풍선(`arrival`)이 있으면 두지 않는다.
- **R4**: `agent-handoff.ts`에 `AGENT_CHAT_CLOSE`. 홈 `page.tsx`의 두 경계에 `exit {CLOSE: "chat-leave"}` · `enter {CLOSE: "home-arrive"}`, 두 입력창 `share`에 `{CLOSE: "composer-return"}`을 더한다.
- **R5**: `ProposalFeed`의 `apply`를 `startTransition` 안에서 부른다(React 19는 `await` 뒤의 갱신을 Transition으로 보지 않는다). 카드 경계: `enter="reveal-in" exit="reveal-out" update="proposal-move" default="none"`. 경계는 목록 항목의 맨 바깥이고 서로 바로 옆이어야 한다(그 위에 `li` · `div`가 있으면 빠짐 · 자리 옮김이 돌지 않는다).
- **R6**: `CareerViewShell`의 보기 선택을 `startTransition`으로 감싼다. 경계: `key={view.id} enter="reveal-in" exit="reveal-out" default="none"`.
- **R7**: `library/page.tsx`의 지면 칸을 `Suspense`(fallback은 `RevealPending`, 내용은 `RevealContent`)로 감싼다. `PortfolioGrid`의 `iframe`을 클라이언트 부품 `PreviewFrame`으로 옮긴다. `onLoad`와, 하이드레이션 전에 끝난 경우 `contentDocument.readyState === "complete"` 확인으로 `data-loaded`를 단다.
- **R8**: `components/motion/Swap.tsx` — `value`가 처음 값과 달라지면 `key={value}`로 다시 그리고 `data-changed`를 달아 떠오르게 한다. 도메인을 모른다. 승인 카드들의 상태 문구가 쓴다.
- **R9**: `OnboardingShell`의 `panel`을 `<ViewTransition name="onboarding-panel" share="onboarding-step" default="none">`으로 감싼다.
- 길이와 곡선은 모션 토큰의 값이다. `::view-transition-*`에는 숫자로 적고 어느 토큰인지 옆에 둔다(#251과 같다).

## 열린 질문

없음.
