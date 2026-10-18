---
title: 공고 상세 채팅 레일 폭 채움 수정
slug: job-chat-rail-width
stage: spec
date: 2026-10-17
---

# Spec · 공고 상세 채팅 레일 폭 채움 수정

## 요구사항

1. 레일이 본문 옆에 설 때(≥1024px) 채팅 루트(`section.acf-scope`)의 폭 = `.railChat`의 폭.
   - 대화 없는 첫 화면, 메시지가 있는 대화 모두.
   - 레일 폭 316px · 최대 폭 모두.
2. 채팅 루트의 높이는 지금과 같이 레일 높이를 다 쓰고, 스크롤은 메시지 목록 안에서만 일어난다.
3. 1023px 이하에서 채팅 높이는 `min(720px, 85dvh)` 그대로다.
4. 접으면(`hidden`) 채팅이 보이지 않고 마운트는 유지된다.

## 설계

`.railChat`의 flex 방향을 세로(`flex-direction: column`)로 바꾼다. 자식인 채팅 루트가 교차축(가로)으로
늘어나(`align-items: stretch` 기본값) 폭을 다 쓰고, 높이는 지금처럼 `.rail`의 `height: 100%`로 정해진다.
#84 이전에 채팅 루트가 세로 방향 `aside`의 자식이던 관계와 같다.

버린 대안

- `AgentChat.module.css`의 `.rail`에 `width: 100%` 추가: 공용 부품을 레일 껍데기 사정으로 고치게 된다.
- `.railChat > *`에 `flex: 1`: 페이지 CSS가 다른 부품의 루트를 선택자로 잡는다.

## 검증

- 개발 서버에서 headless Chrome으로 채팅 루트 폭과 `.railChat` 폭을 잰다(첫 화면 · 대화, 316 · 560px,
  1000px 창).
- `pnpm --filter @expresso/web typecheck` · `test`.
