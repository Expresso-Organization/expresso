---
title: 보완점 정리 카드의 「다시 대조 필요」 표시와 PR 65 · 70 잔여 흡수
slug: gap-review-freshness
stage: plan
status: accepted
intent: .intent/intent_gap-review-freshness.md
spec: .intent/spec_gap-review-freshness.md
date: 2026-10-27
---

# 보완점 정리 카드의 「다시 대조 필요」 표시와 PR 65 · 70 잔여 흡수 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/contracts/src/agent-chat.ts` | `RecordSnapshotSchema` 추출, `GapReviewSchema.snapshot` 선택 필드 |
| `packages/contracts/src/agent-chat.test.ts` | `snapshot` 있는 · 없는 보완점 파싱 |
| `services/backend/src/modules/agent-chat/gap-review.ts` | `buildGapReview`가 `snapshot` 채움 |
| `services/backend/src/modules/agent-chat/gap-review.test.ts` | `snapshot` 단위 테스트 |
| `services/backend/src/modules/agent-chat/service.ts` | `freshness` 분기, `gapFreshness` |
| `services/backend/src/modules/agent-chat/service.integration.test.ts` | 보완점 최신성 통합 테스트 |
| `services/web/src/app/api/agent/[...path]/route.ts` | 주석 「요건 대조 · 보완점 최신성」 |
| `services/web/src/features/agent-chat/useToolFreshness.ts` (새 파일) | 최신성 조회 훅 |
| `services/web/src/features/agent-chat/RequirementReviewCard.tsx` | 훅 사용 |
| `services/web/src/features/agent-chat/GapReviewCard.tsx` | `conversationId` · `toolId`, 「다시 대조 필요」 |
| `services/web/src/features/agent-chat/GapReviewCard.test.tsx` | 표시 · 조회 경로 테스트 |
| `services/web/src/features/agent-chat/AgentChat.tsx` | 카드에 대화 id · 도구 id 전달 |
| `services/web/src/features/agent-chat/AgentChat.module.css` | `line-clamp: 2` |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 계약 — `pnpm --filter @expresso/contracts test` 통과.
2. `buildGapReview` 스냅샷 + 단위 테스트 — `gap-review.test.ts` 통과.
3. `freshness` 분기 + 통합 테스트. 보완점만 인용하는 두 번째 기록을 만들어 (b)를 따로 확인한다 —
   `pnpm test:infra`의 agent-chat 통합 테스트 통과.
4. 웹 훅 · 카드 · 분기 · CSS + 카드 테스트 — `pnpm --filter @expresso/web test` 통과.
5. 커밋 두 개로 나눈다: `feat: 보완점 정리 카드 근거 최신성 표시`(1~4의 기능),
   `fix: 자료 목록 제목 표준 line-clamp 속성 누락 수정`(CSS 한 줄).
6. 전체 검증 후 푸시, PR, CI 확인.

## 가장 위험한 단계

1단계의 계약 변경. `snapshot`을 실수로 필수로 두면 예전 보완점이 든 대화가 웹 프록시에서 502가 된다.
계약 테스트에 `snapshot` 없는 보완점 파싱을 넣어 막는다. 깨지면 그 필드를 `.optional()`로 되돌리면 된다.
데이터는 바꾸지 않으므로(마이그레이션 없음) 되돌릴 데이터가 없다.

## 검증

```
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm test:infra
```

UI 확인: 이 워크트리의 웹 · API를 띄우고(`AGENT_CHAT_ENABLED=1`, 로컬 Claude 로그인) dev01 계정으로
데이터 엔지니어 공고 상세 채팅에서 요건 대조 → 보완점 정리를 받는다. 보완점 근거 기록을 편집기에서 고친 뒤
공고 상세로 돌아와 보완점 카드 머리에 「다시 대조 필요」가 뜨는지 화면으로 확인한다. 에이전트 실행
환경이 없으면 이 확인을 하지 못한 것으로 보고한다.
