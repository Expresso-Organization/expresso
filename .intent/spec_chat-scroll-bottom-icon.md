---
title: 채팅 "최근 메시지로" 버튼 아이콘 표시
slug: chat-scroll-bottom-icon
stage: spec
status: accepted
intent: .intent/intent_chat-scroll-bottom-icon.md
date: 2026-10-17
---

# 채팅 "최근 메시지로" 버튼 아이콘 표시 — 명세

## 요구사항

- [ ] `/agent`, `/jobs/[jobId]` 채팅 레일, `/career/records/[recordId]` 기록 편집기 채팅에서
      `.aui-thread-scroll-to-bottom svg`의 크기가 16×16이다.
- [ ] 같은 버튼의 콘텐츠 폭 `clientWidth - paddingLeft - paddingRight`가 16px 이상이다.
- [ ] 버튼은 원형(`rounded-full`)이고 위치(`absolute -top-12 self-center`), 숨김 조건
      (`disabled:invisible`)은 그대로다.
- [ ] 다른 `TooltipIconButton` 사용처(컴포저 전송·첨부·받아쓰기 버튼)의 크기는 바뀌지 않는다.
- [ ] Playwright e2e에 이 버튼의 기하를 확인하는 회귀 테스트가 있다.

## 설계

- `services/web/src/components/assistant-ui/elements/thread.aui.tsx`의 `ThreadScrollToBottom`
  className에서 `p-4`를 `size-8`로 바꾼다. `cn`(tailwind-merge)이 `TooltipIconButton`의
  `size-6`을 `size-8`로 대체하고, 패딩은 `TooltipIconButton`의 `p-1`이 남는다.
  결과: 32px 상자, 테두리 1px, 패딩 4px → 콘텐츠 22px. svg는 `Button`의
  `[&_svg:not([class*='size-'])]:size-4`로 16×16이 된다.
- `size-8`은 `components/ui/button.tsx`의 `size: "icon"` 값이다. `TooltipIconButton`이 이미
  `size="icon"`을 넘기므로 새 값이 아니다. 컴포저 버튼들이 `size-7`을 얹는 것과 같은 방식이다.
- 파일 머리 `NOTE(agent-chat-framework)`에 원본과 다른 이유를 한 줄 덧붙인다.
  `tooltip-icon-button.tsx`가 원본 수정 사유를 같은 자리에 적는 관행을 따른다.
- 회귀 테스트는 `services/web/e2e/`에 새 spec으로 둔다. jsdom은 레이아웃을 계산하지 않으므로
  vitest로는 확인할 수 없다. 버튼은 스크롤이 맨 아래일 때 `disabled`라 `invisible`이지만
  레이아웃 상자는 남으므로 `boundingBox`로 크기를 잰다.

## 버린 대안

- 전역 `global.css`의 `svg { max-width: 100% }`를 채팅 범위에서 풀기: 증상은 사라지지만
  24px 상자에 32px 패딩이 들어가는 잘못된 기하가 남는다. 전역 규칙은 앱 전체 svg에 닿는다.
- `TooltipIconButton`의 기본 크기 변경: 컴포저 버튼 크기가 함께 바뀐다.
- `p-4`만 지우기: 버튼이 24px로 줄어든다. 원래 보이던 34px과 차이가 커지고, 다른 원형
  아이콘 버튼(28px)보다 작아진다.

## 함정

- 버튼의 외곽 크기가 34px에서 32px로 2px 줄어든다. 위치는 `-top-12` 기준이라 중심선은 그대로다.
- `NOTE` 주석은 `framework-manifest.json`의 `sourceSha256`(원본 해시)과 무관하다. 해시는
  원본 파일 기준이라 이 수정으로 갱신할 필요가 없다.
- e2e 서버 환경은 AI 키가 없다. `/agent`가 키 없이 스레드를 그리는지 확인하고, 안 되면 기록
  편집기 화면으로 잰다.

## 완료 기준

```
pnpm --filter @expresso/web typecheck      # 오류 없음
pnpm --filter @expresso/web test           # 전부 통과
pnpm --filter @expresso/web exec playwright test e2e/agent-chat-layout.spec.ts   # 통과
```

이 워크트리에서 띄운 개발 서버로 세 화면을 headless Chrome으로 재측정해 svg 16×16,
콘텐츠 폭 ≥ 16px을 확인한다.
