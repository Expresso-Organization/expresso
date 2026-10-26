---
title: 준비 계획 카드 테스트의 오늘 날짜 고정
slug: plan-card-test-clock
stage: spec
status: accepted
intent: .intent/intent_plan-card-test-clock.md
date: 2026-10-26
---

# 준비 계획 카드 테스트의 오늘 날짜 고정 — 명세

## 요구사항

- [ ] `PlanCards.test.tsx`의 모든 테스트가 도는 동안 `new Date()`가 2026-10-21을 돌려준다.
- [ ] `setTimeout` 등 타이머는 실제 시간으로 돈다(`findBy*` · `waitFor`가 그대로 동작).
- [ ] 각 테스트가 끝나면 `Date`가 실제 시계로 돌아간다.
- [ ] 제품 코드(`PlanCard.tsx`)는 바뀌지 않는다.

## 설계

- 파일 상단의 `afterEach` 옆에 `beforeEach(() => { vi.setSystemTime("2026-10-21T12:00:00Z"); })`를 둔다.
- 기존 `afterEach`에 `vi.useRealTimers()`를 더한다.
- vitest 4.1.10 `vi.setSystemTime` 타입 주석: 가짜 타이머가 꺼져 있으면 `Date.*`와 `new Date()`만 고정한다. `vi.useRealTimers()`는 고정한 날짜가 있으면 `resetDate()`로 되돌린다(`vitest/dist/chunks/test.*.js`).
- 2026-10-21 12:00 UTC는 UTC−12 ~ UTC+14 어느 시간대에서도 기기 날짜가 10-21이다. `currentWeek`는 기기 시간대 날짜(`toLocaleDateString("sv-SE")`)를 쓰므로 자정 근처를 피한다.
- 날짜 고정은 파일 전체에 건다. 네 테스트가 같은 10-19 · 10-26 자료를 쓰므로 파일 안에서 오늘이 하나로 정해져야 읽기 쉽다.

## 버린 대안

- `PlanCard`에 기준 날짜 속성(`today`) 주입: 테스트 하나를 위해 화면 API를 늘린다. 제품에서 이 값을 다르게 줄 곳이 없다.
- `vi.useFakeTimers()`: 타이머까지 멈춰 `findBy*` · `waitFor`가 진행하지 않는다.
- 자료 날짜를 먼 미래로 옮기기: 그 날짜가 지나면 같은 문제가 다시 난다.

## 함정

- `currentWeek`는 오늘을 기기 시간대로, 주의 끝을 UTC로 계산한다. 이번 범위 밖이지만 고정 시각을 자정에 두면 시간대에 따라 날짜가 달라진다.
- vitest가 `@expresso/contracts` · `@expresso/editor`의 `dist`를 읽으므로 둘을 먼저 빌드해야 테스트가 모듈을 찾는다.

## 완료 기준

- `pnpm --filter @expresso/web exec vitest run src/features/agent-chat/PlanCards.test.tsx` → `Tests  4 passed (4)`.
- 고정 날짜를 잠시 2026-10-28로 바꾸면 같은 테스트가 실패한다(고정이 결과를 정한다는 확인). 확인 후 되돌린다.
- `pnpm typecheck`, 웹 패키지 `pnpm test` 통과.
