---
title: 에이전트 채팅 도구 호출 복구와 작업 흔적 표시
slug: agent-tool-trace
stage: spec
status: accepted
intent: .intent/intent_agent-tool-trace.md
date: 2026-11-10
---

# 에이전트 채팅 도구 호출 복구와 작업 흔적 표시 — 명세

## 원인

`createSdkMcpServer`(Agent SDK 0.3.261)는 SDK 번들 안의 zod 4.4.3으로 도구 입력 스키마를 JSON Schema로 바꾼다. 작업공간 zod는 4.6.5(2026-10-28 `7d720992`부터)다. 4.6.5의 `recordProcessor`는 변환 컨텍스트의 `ctx.deferred`에 쓰는데, 4.4.3이 만든 컨텍스트에는 이 필드가 없다. `z.record`가 든 `propose_record_edit`(`AiEditProposalSchema.propertyChanges`)에서 `tools/list`가 `Cannot read properties of undefined (reading 'push')`로 실패하고, SDK는 오류 없이 도구 목록 전체를 버린다(init 메시지 `tools: []`). 모델은 시스템 프롬프트에서 도구 이름만 보고 호출을 글로 쓴다. 로컬 재현: 도구 호출 0회, 본문 `{"name":"list_career_records","parameters":{}}`.

## 요구사항

- [ ] SDK init 메시지의 `tools`에 `mcp__expresso__*` 9개가 모두 있다.
- [ ] init 메시지에 허용 도구가 하나라도 빠지면 `run`이 오류를 던져 실행이 `failed`로 끝난다.
- [ ] 모든 도구가 같은 id로 `running` → `complete`/`failed` 이벤트를 보낸다.
- [ ] 회귀 테스트: 실제 MCP 서버에 `tools/list`를 보내 9개 이름과 각 `inputSchema`를 받는다(API 키 불필요).
- [ ] 모델이 도구 입력을 쓰는 동안 그 단계가 실행 중으로 보인다.
- [ ] 웹: 도구 호출이 세로선으로 이어진 단계 목록으로 그려지고, 상태(running · complete · failed)가 점과 이름의 모양으로 구분된다.
- [ ] `prefers-reduced-motion: reduce`에서 반복 애니메이션이 멈춘다(`tokens.css`의 전역 규칙).

## 설계

**백엔드** — `services/backend/src/platform/agent/runtime.ts`
- 도구 정의는 지금처럼 SDK `tool()`로 만든다(재사용). 서버는 작업공간 `@modelcontextprotocol/sdk`의 `McpServer`로 만들고 `registerTool(name, { description, inputSchema }, handler)`로 등록한 뒤 `{ type: "sdk", name: "expresso", instance }`로 넘긴다. 스키마와 변환기가 같은 zod를 쓴다. `@modelcontextprotocol/sdk`를 backend 직접 의존성으로 올린다(이미 lockfile의 1.32.1).
- 도구 이름 배열 하나(`TOOL_NAMES`)에서 `allowedTools`를 만들고, init 메시지 `tools`와 비교한다.
- 도구마다 반복되는 `running` → 결과 이벤트를 `step(tool, extra, work, failure)` 하나로 묶는다. `propose_record_edit`의 기존 실패 문구는 유지한다.
- `running`은 스트림의 `content_block_start`(`tool_use`) 시점에 먼저 보낸다. 요건 대조처럼 입력이 긴 도구는 처리기가 불리기까지 수십 초가 걸리고, 처리기는 순식간에 끝나 처리기에서만 보내면 화면에 실행 중이 보이지 않는다(실제 화면에서 확인). 블록과 처리기는 `tools/call`의 `_meta["claudecode/toolUseId"]`로 잇는다. 처리기까지 오지 못한 블록은 `tool_result`를 보고 실패로 닫고, 끝까지 열린 블록은 실행 끝에 닫는다.

**웹** — `services/web/src/features/agent-chat/`
- 새 `ToolStep.tsx` · `ToolStep.module.css`: 도메인을 모르는 단계 줄. 속성은 `status`, `icon`, `title`, `summary`, `children`(카드 · 승인 화면). 왼쪽 점 + 세로선, 오른쪽 이름 · 요약 · 본문.
- `AgentChat.tsx`의 `RecordTool`: 도구 이름 → 아이콘 대응(화면이 도메인을 UI 속성으로 바꾼다)과 카드 선택은 유지하고, 모든 결과를 `ToolStep`으로 감싼다. `ToolFallback.Root` 테두리 상자는 쓰지 않는다. `ExpandedTools`는 `ToolGroupContent`에 타임라인 클래스를 준다.
- 모션: 단계 등장과 선 이어짐 `--ex-motion-glide`, 체크 등장 `--ex-motion-spring`, 요약 펼침 `--ex-motion-panel`. 색은 `--ex-accent` · `--ex-accent-soft` · `--ex-accent-surface` · `--ex-status-danger-*` · `--ex-border`.

## 버린 대안

- Agent SDK 0.3.321로 올리기: 번들 zod가 4.6.2라 이번엔 통과하지만 번들 zod와 작업공간 zod가 갈리는 구조는 그대로다.
- 작업공간 zod를 4.4.x로 고정, 계약에서 `z.record` 제거: 원인과 무관한 곳을 바꾼다.
- `alwaysLoad: true`: 시험했고 고쳐지지 않았다(도구 지연 로딩은 원인이 아니다).

## 함정

- `runtime.test.ts`는 `createSdkMcpServer`를 모킹해 `options.mcpServers.expresso.tools`에서 처리기를 꺼낸다. 새 구조에 맞게 처리기를 꺼내는 길을 바꾼다.
- `McpServer.registerTool`은 zod raw shape를 받는다. `{}`(list_career_records)도 허용된다.
- 웹 `convertMessage`는 `running`이면 `result`를 비워 assistant-ui가 `status.type === "running"`을 준다. 이 값을 그대로 쓴다.

## 완료 기준

```
pnpm --filter @expresso/backend test -- runtime     # 9개 도구 tools/list 통과
pnpm typecheck && pnpm test
```
실제 API(`AI_PROVIDER` 없이)로 공고 채팅에 "응. 내 기록이랑 대조해서 정리 좀 해줘" → 작업 흔적에 기록 목록 확인 · 기록 읽기 · 요건 대조, 본문에 JSON 없음.
