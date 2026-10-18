---
title: 채팅 "최근 메시지로" 버튼 아이콘 표시
slug: chat-scroll-bottom-icon
stage: intent
status: accepted
author: Nedian0Brien
date: 2026-10-17
---

# 채팅 "최근 메시지로" 버튼 아이콘 표시

## 문제

에이전트 채팅에서 메시지 목록을 위로 올리면 나타나는 "최근 메시지로"(scroll to bottom)
버튼이 화살표 없이 빈 원으로 보인다. 사용자는 이 버튼이 무엇을 하는지 알 수 없다.

headless Chrome(1400×900)으로 job-chat-rail 개발 서버(3121)에서 잰 값이다. 세 화면 모두 같다.

| 화면 | 버튼 | 패딩 | 안의 `ArrowDownIcon` svg |
| --- | --- | --- | --- |
| `/agent` | 34×34 | 16px | 0×16 |
| `/jobs/[jobId]` 채팅 레일 | 34×34 | 16px | 0×16 |
| `/career/records/[recordId]` 기록 편집기 채팅 | 34×34 | 16px | 0×16 |

원인은 두 가지가 겹친 것이다.

1. `thread.aui.tsx`의 `ThreadScrollToBottom`이 `TooltipIconButton`(`size-6 p-1`)에
   `p-4`를 덧붙인다. tailwind-merge가 `p-1`을 `p-4`로 바꾸므로 24px 상자에 좌우 32px
   패딩과 1px 테두리가 들어가 콘텐츠 폭이 0px이 된다. 버튼은 패딩+테두리 합인 34px로 커진다.
   이 줄은 assistant-ui 레지스트리에서 가져올 때(17ee1e44) 들어왔다.
2. 앱 전역 `services/web/src/styles/global.css:77`의 `svg { max-width: 100% }`가 채팅
   범위에도 적용된다. svg는 `shrink-0`이라 줄어들지 않지만 `max-width: 100%`가 0px
   콘텐츠 폭에 묶여 폭이 0이 된다. 채팅 전용 preflight(`agent-chat-preflight.css`)는
   svg에 `max-width`를 주지 않는다.

## 원하는 결과

- 세 화면에서 버튼 안 svg가 16×16으로 그려진다.
- 버튼 콘텐츠 폭(`clientWidth - padding`)이 16px 이상이다.
- `pnpm --filter @expresso/web typecheck`와 웹 테스트가 통과한다.
- `main` 기준 브랜치로 PR이 열린다.

## 영향 범위

에이전트 채팅을 쓰는 세 화면(`/agent`, 공고 상세 채팅 레일, 기록 편집기 채팅)의 사용자.
코드는 `services/web/src/components/assistant-ui/elements/thread.aui.tsx` 한 파일.

## 제약

- `TooltipIconButton`은 고치지 않는다. 컴포저 버튼들이 그 위에 `size-7`을 얹어 쓰고 있어
  바꾸면 다른 버튼 크기가 함께 바뀐다.
- 새 크기 값을 만들지 않는다. 기존 `Button` 크기 단계 안에서 고른다.

## 범위 밖

- 전역 `global.css`의 `svg { max-width: 100% }` 규칙 변경. 앱 전체 svg에 영향을 주므로
  따로 다룬다.
- 버튼이 나타나는 조건, 위치(`-top-12`), 색 변경.

## 열린 질문

없음.
