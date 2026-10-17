---
title: 공고 상세 우측 사이드바의 공고 전용 에이전트 채팅 — D. 보완점 정리 · 준비 계획 · 진행 기록
slug: job-chat-rail-d
stage: plan
status: accepted
intent: .intent/intent_job-chat-rail.md
spec: .intent/spec_job-chat-rail-d.md
date: 2026-10-15
---

# D. 보완점 정리 · 준비 계획 · 진행 기록 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/contracts/src/agent-chat.ts` · `agent-chat.test.ts` | 보완점 · 계획 초안 · 계획 · 진행 · 재배치 스키마 |
| `packages/database/src/mongodb-migrations/0011/migration.ts` | `preparation_plans` 컬렉션 · 인덱스 |
| `packages/database/src/{mongo-migrations.ts,mongo-build.mjs,collections.ts,documents/*,schema.test.ts,migrations.test.ts}` | 등록 |
| `services/backend/src/modules/account-lifecycle/mongo-purge.ts` | 계정 삭제 대상 |
| `services/backend/src/modules/agent-chat/gap-review.ts` · `.test.ts` | 보완점 검증 · 조립 |
| `services/backend/src/modules/agent-chat/preparation-planner.ts` · `.test.ts` | 배치 · 재배치 |
| `services/backend/src/modules/agent-chat/plans.ts` | 계획 저장소(승인 · 조회 · 진행 · 재배치 적용) |
| `services/backend/src/modules/agent-chat/service.ts` · `routes.ts` · `service.integration.test.ts` | 콜백 · 결정 · 라우트 |
| `services/backend/src/platform/agent/runtime.ts` · `runtime.test.ts` | 도구 3개 · 프롬프트 · 모델용 대화 |
| `services/web/src/app/api/agent/[...path]/route.ts` · `plans/[...path]/route.ts` | 프록시 |
| `services/web/src/features/agent-chat/{GapReviewCard,PlanDraftCard,PlanCard,ReplanDraftCard}.*` | 카드 |
| `services/web/src/features/agent-chat/AgentChat.tsx` · `useAgentConversation.ts` | 분기 · 결정 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. D1: 계약 · `gap-review.ts` · 도구 · 카드 + 테스트 → 커밋 → 화면(보완점)
2. D2: 마이그레이션 0011 · 등록 · 배치 모듈 · 계획 제안 도구 · 초안 결정 · 초안 카드 + 테스트 → 커밋 →
   복제 DB에 `pnpm db:migrate` → 화면(계획 제안 · 승인)
3. D3: 계획 조회 · 진행 PATCH · 재배치 도구 · 재배치 결정 · 계획 카드 · 재배치 카드 + 테스트 → 커밋 →
   화면(진행 기록 · 재배치)
4. 전체 검사 · PR

## 가장 위험한 단계

3의 계획 카드. 작업이 많을 때 316px에서 읽히는지, 대화상자 편집이 진행 필드와 버전 충돌을 바르게
처리하는지. 화면에서 작업 12개 이상인 계획으로 확인한다.

## 검증

```
pnpm typecheck
pnpm test
pnpm test:infra
```

화면: 데이터 엔지니어 대화 → "보완점 정리해 줘" → "주 5시간, 4주, 다음 주 월요일부터 계획 세워 줘" →
초안 승인 → 작업 하나 완료 기록 → "주 3시간으로 다시 배치해 줘" → 재배치 승인.
