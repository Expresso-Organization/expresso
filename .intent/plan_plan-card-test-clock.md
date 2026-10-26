---
title: 준비 계획 카드 테스트의 오늘 날짜 고정
slug: plan-card-test-clock
stage: plan
status: accepted
intent: .intent/intent_plan-card-test-clock.md
spec: .intent/spec_plan-card-test-clock.md
date: 2026-10-26
---

# 준비 계획 카드 테스트의 오늘 날짜 고정 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/features/agent-chat/PlanCards.test.tsx` | `beforeEach`에서 `vi.setSystemTime`, `afterEach`에서 `vi.useRealTimers()` |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 고치기 전 실패 기록 — 2026-10-26에 `1 failed | 3 passed (4)` (확인함).
2. 테스트 파일 수정 — 같은 명령이 `4 passed (4)`.
3. 고정 날짜를 2026-10-28로 잠시 바꿔 실패를 확인하고 되돌린다.
4. `pnpm typecheck`와 웹 패키지 전체 테스트.

## 가장 위험한 단계

2단계. 고정한 날짜가 풀리지 않으면 같은 워커에서 도는 다른 테스트가 고정 날짜를 본다. `afterEach`의 `vi.useRealTimers()`로 막고, 웹 전체 테스트로 확인한다. 깨지면 이 커밋 하나를 되돌린다.

## 검증

```
pnpm --filter @expresso/contracts build
pnpm --filter @expresso/editor build
pnpm --filter @expresso/web exec vitest run src/features/agent-chat/PlanCards.test.tsx
pnpm --filter @expresso/web test
pnpm typecheck
```

화면 변경은 없다.
