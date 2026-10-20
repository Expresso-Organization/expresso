---
title: 공고 상세 우측 사이드바의 공고 전용 에이전트 채팅 — A. 사이드바 · 공고별 대화 · 다시 보내기
slug: job-chat-rail-a
stage: plan
status: accepted
intent: .intent/intent_job-chat-rail.md
spec: .intent/spec_job-chat-rail-a.md
date: 2026-10-15
---

# A. 사이드바 · 공고별 대화 · 다시 보내기 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/backend/src/modules/agent-chat/service.ts` | `prepare` 분리, `retry` 추가 |
| `services/backend/src/modules/agent-chat/routes.ts` | `POST …/:id/retry` |
| `services/backend/src/modules/agent-chat/service.integration.test.ts` | 다시 보내기 2건 |
| `services/web/src/app/api/agent/[...path]/route.ts` | 프록시 허용 목록에 `retry` |
| `services/web/src/features/agent-chat/useAgentConversation.ts` | `pick` 옵션, `resolving`, `retry()` |
| `services/web/src/features/agent-chat/useAgentConversation.test.tsx` | 공고별 선택 2건 |
| `services/web/src/features/agent-chat/AgentChat.tsx` | `job` 속성, 공고 모드 첫 화면, 다시 보내기 버튼 |
| `services/web/src/features/agent-chat/AgentChat.module.css` | `.rail` 모드, 공고 첫 화면, 다시 보내기 |
| `services/web/src/app/(app)/jobs/[jobId]/page.tsx` | 레일을 채팅 하나로, 회사 톤 절 이동, 폼 제거 |
| `services/web/src/app/(app)/jobs/[jobId]/page.module.css` | 레일 여백 제거, 쓰지 않는 클래스 삭제 |
| `docs/Expresso Screens.dc.html` | 06b 우측 레일 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 백엔드 `retry` + 라우트 + 통합 테스트 — `pnpm test:infra` 중 agent-chat 통과
2. 웹 프록시 · 훅(`pick`, `resolving`, `retry`) + 훅 테스트 — `pnpm --filter @expresso/web test` 통과
3. `AgentChat` 공고 모드(첫 화면 · 레일 CSS · 다시 보내기 버튼)
4. 공고 페이지 레일 교체 · 회사 톤 절 · CSS 정리 — `pnpm typecheck`
5. 정의서 06b 수정
6. 이 워크트리 전용 DB · 포트로 API · 웹을 띄우고 화면 확인(데스크톱 · 1023px · 375px,
   공고 이동, 다시 보내기)

## 가장 위험한 단계

3~4의 레일 높이. `.body`(overflow:auto)와 `.left`(overflow:auto) 사이에서 레일이 본문 높이만큼
늘어나면 채팅이 화면 밖으로 길어진다. 브라우저에서 레일 `offsetHeight`가 `.body`
`clientHeight`와 같은지 `javascript_tool`로 확인한다. 틀어지면 `.body`에 `min-height:0`과
레일 `align-self:stretch`를 맞추는 쪽으로 고친다.

## 검증

```
pnpm typecheck
pnpm test
pnpm test:infra
```

화면: `/jobs/<id>` 데스크톱 폭에서 레일 = 채팅, 메시지 스크롤은 채팅 안에서만. 1023px · 375px에서
채팅이 본문 아래에 정해진 높이로. 다른 공고로 이동 시 대화가 바뀜. 실패 · 중지 후 "다시 보내기".
