---
title: 공고 상세 우측 사이드바의 공고 전용 에이전트 채팅 — C. 대화로 새 기록 만들기
slug: job-chat-rail-c
stage: plan
status: accepted
intent: .intent/intent_job-chat-rail.md
spec: .intent/spec_job-chat-rail-c.md
date: 2026-10-15
---

# C. 대화로 새 기록 만들기 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/contracts/src/agent-chat.ts` · `agent-chat.test.ts` | 초안 입력 · 저장형 · 결정 스키마 |
| `services/backend/src/modules/agent-chat/record-draft.ts` · `.test.ts` | 출처 검증 · 저장형 조립 |
| `services/backend/src/modules/agent-chat/service.ts` | 초안 콜백, `decideRecordDraft`, 카테고리 포함 목록 |
| `services/backend/src/modules/agent-chat/routes.ts` | `POST …/:id/record-drafts/:draftId` |
| `services/backend/src/modules/agent-chat/service.integration.test.ts` | 승인 · 거절 · 멱등 |
| `services/backend/src/platform/agent/runtime.ts` · `runtime.test.ts` | 도구 · 프롬프트, 메시지 id |
| `services/web/src/app/api/agent/[...path]/route.ts` | `record-drafts` POST 허용 |
| `services/web/src/features/agent-chat/useAgentConversation.ts` | `decideDraft` |
| `services/web/src/features/agent-chat/RecordDraftCard.tsx` · `.module.css` · `.test.tsx` | 초안 카드 |
| `services/web/src/features/agent-chat/AgentChat.tsx` | 도구 분기 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 계약 + 테스트
2. `record-draft.ts` + 단위 테스트
3. 런타임 · 서비스 · 라우트 + 통합 테스트 — `pnpm test:infra agent-chat`
4. 웹 프록시 · 훅 · 카드 · 분기 + 카드 테스트
5. 전체 검사, 화면에서 실제 에이전트로 초안 → 승인

## 가장 위험한 단계

3의 승인 경로. `createRecord`가 카테고리 속성 검증으로 거절하면 초안 상태를 바꾸지 않고 오류를
돌려줘야 한다 — 상태 갱신을 기록 생성 뒤에 두고, 실패하면 갱신하지 않는다.

## 검증

```
pnpm typecheck
pnpm test
pnpm test:infra
```

화면: 공고 상세 대화 → 경험 이야기 → "이 내용으로 기록 만들어 줘" → 카드 → 승인 → 기록 열기.
