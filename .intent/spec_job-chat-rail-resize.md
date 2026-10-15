---
title: 공고 상세 우측 채팅 사이드바 접기 · 펼치기와 너비 조절
slug: job-chat-rail-resize
stage: spec
status: accepted
intent: .intent/intent_job-chat-rail-resize.md
date: 2026-10-16
---

# 공고 채팅 사이드바 접기 · 너비 조절 — 명세

## 요구사항

- [ ] ≥1024px: 페이지 머리 오른쪽에 아이콘 버튼 세 개(관심 공고 · 공고 원문 링크(`sourceUrl`이 있을 때) ·
      채팅). 채팅 버튼(`aria-pressed`)이 "채팅 접기"/"채팅 펼치기"를 오간다. 접으면 레일 폭이 0이 되고
      `AgentChat`은 마운트된 채로 감춰진다. 접힌 채 응답 중이면 채팅 버튼에 점이 있다.
- [ ] ≥1024px: 레일 왼쪽 경계(`role="separator"`)를 끌거나 ←/→(24px)로 너비를 바꾼다.
      범위는 316px ~ (본문 폭 − 700px). 최대가 316보다 작으면 316. 창이 줄어 최대를 넘으면 최대로.
      `aria-valuenow/min/max`가 현재 값과 범위를 말한다.
- [ ] 접힘(`ex.jobChat.collapsed`)과 너비(`ex.jobChat.width`)를 `localStorage`에 기억하고, 하이드레이션 때
      레이아웃 효과로 적용한다. 전환 애니메이션은 그다음 프레임부터 켠다. 끄는 동안에는 전환을 끈다.
- [ ] ≤1023px: 버튼 · 핸들이 없고 저장값을 적용하지 않는다(A의 쌓인 배치 그대로).
- [ ] 06b 정의서 레일에 접기 버튼과 경계 핸들 표시.

## 설계

- `jobs/[jobId]/JobChatRail.tsx`(클라이언트): `JobChatRailProvider`가 머리와 레일을 함께 감싸 상태를
  든다(머리의 `JobChatToggle`과 본문의 `JobChatRail`이 같은 상태를 본다). `JobChatRail`은 `<aside>`와
  핸들을 그리고 `AgentChat`을 감싼다.
  너비는 CSS 변수 `--job-chat-width`로 넘겨 `page.module.css`의 `.rail`이 쓴다. 상태 로직은
  `useJobChatRail` 훅(같은 파일)에 두고, 끌기 · 키보드는 `DocumentPanel`과 같은 방식(포인터 캡처 대신
  window 이벤트, body 커서)으로 한다. 최대폭은 `aside.parentElement.clientWidth - 700`.
- `AgentChat`에 `onRunningChange?: (running: boolean) => void`(머리 채팅 버튼의 진행 표시)를 더한다.
  공고 페이지만 넘긴다.
- 접힌 동안 채팅은 `hidden` 속성으로 감춘다(마운트 유지).

## 버린 대안

- 서버 쿠키로 너비를 기억해 SSR에 반영: 화면 편의 값을 위해 요청마다 쿠키를 읽게 된다. 왼쪽
  사이드바와 같은 방식(브라우저 저장소 + 레이아웃 효과)을 따른다.
- 접을 때 채팅을 언마운트: 입력 중인 글과 응답 스트림이 끊긴다.

## 함정

- 끄는 중 `transition`이 켜져 있으면 너비가 늦게 따라온다 — 끄는 동안 `data-resizing`으로 끈다.
- 본문 폭은 왼쪽 앱 사이드바 접힘에 따라 바뀐다 — 창 `resize`뿐 아니라 `ResizeObserver`로 본문을 본다.

## 완료 기준

- `pnpm typecheck` · `pnpm --filter @expresso/web test` 통과. 훅 테스트: 기억 · 범위 고정 · 키보드 ·
  좁은 폭에서 무시. `AgentChat` 접기 버튼 표시 조건.
- 브라우저(1440): 끌기로 너비 변경 · 새로고침 후 유지 · 접기/펼치기 · 접은 채 대화 입력 유지,
  1000px에서 버튼 · 핸들 없음.
