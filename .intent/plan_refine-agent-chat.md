---
title: 다듬기 채팅을 공통 에이전트 채팅으로 교체
slug: refine-agent-chat
stage: plan
status: accepted
intent: .intent/intent_refine-agent-chat.md
spec: .intent/spec_refine-agent-chat.md
date: 2026-11-10
---

# 다듬기 채팅을 공통 에이전트 채팅으로 교체 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/contracts/src/agent-chat.ts` | `AgentPageSelection` · `AgentPageEdit` · 도구 입력 스키마, `SendAgentMessage` · `AgentMessage` · `AgentToolResult` 확장 |
| `packages/contracts/src/page.ts` · `structured-portfolio.ts` | `InstructStructuredElementSchema`와 응답 스키마 삭제 |
| `packages/contracts/src/agent-chat.test.ts` | 새 스키마 검사 |
| `packages/portfolio-renderer/src/editing.ts` (+ test) | `elementTitle` 추가 |
| `services/backend/src/modules/page/element-edit.ts` (+ test) | `instruct` 삭제, `elementGuide` · `elementEditIssues` 추가 |
| `services/backend/src/modules/page/service.ts` · `index.ts` · `public.ts` | `instructElement` 삭제, `elementGuide` · `editElementByAgent` · `PageElementIssues` 추가 |
| `services/backend/src/modules/page/routes.ts` (+ test) | 요소 지시 라우트 삭제 |
| `services/backend/src/modules/page/structured.mongo.integration.test.ts` | 요소 지시 테스트를 `editElementByAgent`로 교체 |
| `services/backend/src/platform/agent/runtime.ts` (+ test) | 도구 둘 · `AgentInput.page` · 프롬프트 · `conversationForModel` selection |
| `services/backend/src/modules/agent-chat/service.ts` · `routes.ts` (+ 통합 테스트) | 문맥 outline, selection 저장, page 도구 연결, `undoPageEdit` · undo 라우트 |
| `services/backend/src/api/build-app.ts` · `main.ts` | `pageEditor` 연결 정리(쓰는 곳 확인) |
| `services/web/src/components/assistant-ui/elements/thread.aui.tsx` | `ComposerHeader` · `UserMessageHeader` 슬롯 |
| `services/web/src/features/agent-chat/AgentChat.tsx` · `useAgentConversation.ts` (+ test) | selection 전달 · 표시, 포트폴리오 시작 화면 · 하단 문구, 고침 뒤 새로고침 |
| `services/web/src/features/agent-chat/PageEditCard.tsx` · `.module.css` (+ test) | 바뀐 곳 카드와 되돌리기 |
| `services/web/src/app/(app)/edit/[portfolioId]/Editor.tsx` · `PageOutline.tsx` | 채팅 탭 교체, `elementTitle` 사용 |
| `services/web/src/app/(app)/edit/[portfolioId]/ElementChat.tsx` · `edit-actions.ts` | 삭제 · `instructElementAction` 삭제 |
| `services/web/src/lib/api/endpoints.ts` | `page.instructElement` 삭제 |

## 작업 순서

1. 계약 · 렌더러 — 스키마와 `elementTitle`. 확인: `pnpm --filter @expresso/contracts test`, 렌더러 테스트.
2. 페이지 모듈 — `elementGuide` · `elementEditIssues` · `editElementByAgent`, 옛 경로 삭제. 확인: `element-edit.test.ts` · 통합 테스트.
3. 에이전트 런타임 · 서비스 · 라우트 — 도구 · selection · outline · undo. 확인: `runtime.test.ts`(tools/list 포함) · `service.integration.test.ts`.
4. 웹 — Thread 슬롯, `AgentChat` · 훅, `PageEditCard`, Editor 교체 · 옛 파일 삭제. 확인: 웹 테스트 · 타입 검사.
5. 실제 화면 검증 — 체험 DB 복사본에 API · 워커 · 웹을 띄워 intent의 개발 목표 네 가지를 내장 브라우저로 확인.

## 가장 위험한 단계

3단계. 도구가 등록되지 않거나(init `tools` 누락) 모델이 도구를 부르지 않으면 채팅이 글로만 답한다. `runtime.test.ts`의 `tools/list` 검사와 5단계 실제 대화로 확인한다. 되돌리기는 브랜치를 버리면 되고, 데이터 변경(마이그레이션)은 없다.

## 검증

```
pnpm typecheck
pnpm test
pnpm test:infra
```

화면: 체험 DB 복사본 + `AGENT_CHAT_ENABLED=1` · `AGENT_CHAT_DEVELOPER_USER_IDS=<dev01 id>` · `AI_PROVIDER=off` 워커. `/edit/<포트폴리오>` → 「작업 목차」 고르기 → "이 문장 더 짧게" 보내기 → 카드 · 미리보기 · 이력 확인 → 「되돌리기」 → 새로고침 후 대화 유지 확인.
