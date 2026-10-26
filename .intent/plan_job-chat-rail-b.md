---
title: 공고 상세 우측 사이드바의 공고 전용 에이전트 채팅 — B. 요건 대조 · 보완 인터뷰
slug: job-chat-rail-b
stage: plan
status: accepted
intent: .intent/intent_job-chat-rail.md
spec: .intent/spec_job-chat-rail-b.md
date: 2026-10-15
---

# B. 요건 대조 · 보완 인터뷰 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/contracts/src/agent-chat.ts` | 대조 초안 · 저장형 · 최신성 스키마, 도구 결과 `review` |
| `packages/contracts/src/agent-chat.test.ts` | 판정 · 근거 규칙 |
| `services/backend/src/modules/agent-chat/requirement-review.ts` | 정규화 · 기록 텍스트 · 검증 · 해시 |
| `services/backend/src/modules/agent-chat/requirement-review.test.ts` | 검증 단위 테스트 |
| `services/backend/src/modules/agent-chat/service.ts` | 실행 콜백(기록 목록 · 읽기 · 대조), `freshness` |
| `services/backend/src/modules/agent-chat/routes.ts` | `GET …/:id/reviews/:toolId` |
| `services/backend/src/modules/agent-chat/service.integration.test.ts` | 대조 저장 · 실패 · 최신성 |
| `services/backend/src/platform/agent/runtime.ts` | 도구 3개, 도구 결과 포함 대화, 프롬프트 규칙 |
| `services/backend/src/api/main.ts` | 서비스 의존성 연결(필요하면) |
| `services/web/src/app/api/agent/[...path]/route.ts` | `reviews` 경로 허용 |
| `services/web/src/features/agent-chat/AgentChat.tsx` | 도구 결과 분기 |
| `services/web/src/features/agent-chat/RequirementReviewCard.tsx` · `.module.css` | 대조 카드 |
| `services/web/src/features/agent-chat/RequirementReviewCard.test.tsx` | 카드 표시 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 계약 + 계약 테스트 — `pnpm --filter @expresso/contracts test`
2. `requirement-review.ts` + 단위 테스트
3. 런타임 도구 · 프롬프트, 서비스 콜백 · `freshness` · 라우트 + 통합 테스트 — `pnpm test:infra agent-chat`
4. 웹 프록시 · 카드 · 분기 + 카드 테스트 — `pnpm --filter @expresso/web test`
5. 전체 `pnpm typecheck` · `pnpm test` · `pnpm test:infra`
6. 화면: 공고 상세에서 실제 에이전트로 대조 · 보완 질문, 기록 수정 후 최신성

## 가장 위험한 단계

3의 실제 에이전트 실행. 모델이 인용을 원문과 다르게 옮기면 검증에서 계속 거절되어 왕복을
다 쓸 수 있다. 오류 메시지에 어긋난 인용과 해당 원문 앞뒤 일부를 함께 돌려줘 한 번에 고치게
한다. 그래도 반복되면 화면 확인 결과와 함께 보고하고 인용 규칙(정규화 범위)을 조정한다.

## 검증

```
pnpm typecheck
pnpm test
pnpm test:infra
```

화면: `/jobs/<id>` → "요건과 내 기록 비교" → 기록 읽기 줄 · 대조 카드 → 요건 펼치기 →
기록 하나 수정 → 공고로 돌아와 "다시 대조 필요" → "부족한 요건 보완 질문".
