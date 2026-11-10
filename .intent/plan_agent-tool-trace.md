---
title: 에이전트 채팅 도구 호출 복구와 작업 흔적 표시
slug: agent-tool-trace
stage: plan
status: accepted
intent: .intent/intent_agent-tool-trace.md
spec: .intent/spec_agent-tool-trace.md
date: 2026-11-10
---

# 에이전트 채팅 도구 호출 복구와 작업 흔적 표시 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/backend/package.json` · `pnpm-lock.yaml` | `@modelcontextprotocol/sdk` 직접 의존성 |
| `services/backend/src/platform/agent/runtime.ts` | `McpServer`로 서버 구성, init 도구 검사, 도구마다 running 이벤트 |
| `services/backend/src/platform/agent/runtime.test.ts` | 실제 MCP 클라이언트로 `tools/list` 9개 회귀 테스트, running → complete 순서, 거절 · 오류 시 실패 줄, init 누락 시 실패 |
| `services/web/src/features/agent-chat/ToolStep.tsx` · `.module.css` (새) | 단계 줄 UI |
| `services/web/src/features/agent-chat/ToolStep.test.tsx` (새) | 상태별 렌더 |
| `services/web/src/features/agent-chat/AgentChat.tsx` · `.module.css` | `RecordTool`을 `ToolStep`으로, 타임라인 클래스, 쓰지 않는 `.toolCard` 제거 |

## 작업 순서

1. 백엔드 서버 구성 교체 — 재현 스크립트에서 init `tools` 9개, `listed=1`.
2. init 도구 검사와 running 이벤트 — `runtime.test.ts` 통과.
3. `tools/list` 회귀 테스트(`runtime.test.ts`) — 변경 전 서버 구성(`createSdkMcpServer`)은 같은 요청에 `reading 'push'` 오류, 변경 후 통과.
4. 웹 `ToolStep`과 `RecordTool` 연결 — 웹 테스트 · 타입 검사 통과.
5. 실제 화면 검증 — 워크트리 포트의 API · 워커 · 웹으로 공고 채팅을 보내 스크린샷.

## 가장 위험한 단계

1단계. Agent SDK가 외부 `McpServer` 인스턴스를 받아 연결하지 못하면 채팅 전체가 멈춘다. 재현 스크립트로 9개 도구가 실리는 것을 이미 확인했다. 깨지면 `createSdkMcpServer`로 되돌리고 SDK 버전 상향을 다시 검토한다.

## 검증

```
pnpm --filter @expresso/backend test -- src/platform/agent
pnpm --filter @expresso/web test -- agent-chat
pnpm typecheck && pnpm test
```

화면: `<이름>.localhost` 웹 → 공고 상세 → 채팅 레일 → "이 공고 요건 좀 봐줘" 후 "응. 내 기록이랑 대조해서 정리 좀 해줘". 실행 중 점 회전, 완료 체크, 요약 펼침, 본문에 JSON 없음을 확인한다.
