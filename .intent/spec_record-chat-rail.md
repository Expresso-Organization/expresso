---
title: 커리어 기록 화면 채팅 우측 레일 배치
slug: record-chat-rail
stage: spec
status: accepted
intent: .intent/intent_record-chat-rail.md
date: 2026-11-21
---

# 커리어 기록 화면 채팅 우측 레일 배치 — 명세

## 요구사항

- [ ] 기록 페이지가 `.body` 가로 flex(본문 스크롤 + 레일)로 그려지고, 레일 안에 `AgentChat context={record}`가 있다.
- [ ] 머리 `DocumentHeader` actions에 채팅 접기 · 펼치기 버튼이 `RecordPageMenu` 앞에 선다(≥1024px만).
- [ ] 기록 레일의 저장 키는 `ex.recordChat.*`, 공고 레일은 기존 `ex.jobChat.*`를 유지한다.
- [ ] <1024px에서 레일은 본문 아래로 쌓이고 본문 스크롤 영역이 풀린다.
- [ ] `CareerDocumentEditor`는 채팅을 그리지 않는다. 문서 패널(peek)은 `DocumentPanel`이 편집기 아래에 채팅을 그대로 그린다.
- [ ] 공고 상세의 레일 테스트가 경로만 바뀐 채 통과한다.

## 설계

- `jobs/[jobId]/JobChatRail.tsx`의 훅 · 프로바이더 · 토글 · 레일을 `features/agent-chat/ChatRail.tsx`로 옮긴다.
  `ChatRailProvider({ storageKey, children })`, `ChatRailToggle({ className, labelClassName })`, `ChatRail({ job } | { context, contextLabel })`.
  레일이 `AgentChat`을 직접 그린다 — 두 페이지가 서버 컴포넌트라 응답 진행 콜백을 넘기는 렌더 함수를 줄 수 없다. 공고는 `job`, 기록은 `context`를 넘긴다.
- 레일 CSS(`.rail`, `.railChat`, `.railHandle`, `.chatRunning`, 1023px 토글 숨김 · 쌓기)를 공고 `page.module.css`에서 `ChatRail.module.css`로 옮긴다.
  `.body`의 세로 전환과 왼쪽 열 스크롤 해제는 화면마다 자기 CSS에 둔다.
- 기록 페이지 토글은 기존 `viewStyles.headerMenuButton` 모양에 레이블은 `ex-sr-only`로 둔다.

## 버린 대안

- 편집기 안에서 CSS로 채팅을 오른쪽에 띄우기: 편집기는 peek 서랍에서도 쓰여 레일을 둘 수 없고, 공고 레일과 코드가 두 벌이 된다.

## 함정

- 레일 최대 폭은 `aside.parentElement` 폭 − 700px다. 기록 페이지의 부모도 레일과 본문을 담은 `.body`여야 한다.
- 셸 `.frame`은 `overflow: hidden`이라 본문 스크롤 영역(`.scroll`)을 화면이 직접 둔다.

## 완료 기준

`pnpm --filter @expresso/web typecheck`, `pnpm --filter @expresso/web test` 통과. 개발 서버에서 기록 페이지와 공고 상세를 1280px · 900px로 열어 레일 · 쌓임 확인.
