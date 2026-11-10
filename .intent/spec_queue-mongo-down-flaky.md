---
title: 큐 통합 시험 Mongo 도달 불가 지연 확인의 간헐 실패 수정
slug: queue-mongo-down-flaky
stage: spec
status: draft
intent: .intent/intent_queue-mongo-down-flaky.md
date: 2026-11-10
---

# 큐 통합 시험 Mongo 도달 불가 지연 확인의 간헐 실패 수정 — 명세

## 요구사항

- [ ] `queue.integration.test.ts`의 완료 대기는 `queue.getJobState(id)`가 `"completed"`일 때 끝나고, 그 뒤 `getJob`으로 새로 읽은 잡의 `attemptsMade`를 확인한다.
- [ ] 지연 확인(`delayed`)도 같은 순서로 바꾼다 — 상태가 `delayed`인 것을 먼저 보고 잡을 읽는다.

## 설계

BullMQ 6 `moveToFinished-14.lua`는 `HINCRBY atm`과 completed 집합 `ZADD`를 한 스크립트에서 처리한다. 따라서 상태가 completed로 보인 뒤 읽은 해시는 늘 최종 값이다. `moveToDelayed`도 지연 집합 추가와 해시 갱신이 한 스크립트다.

## 버린 대안

- 대기 시간 늘리기: 경합은 시간과 무관하게 두 읽기 사이에서 생긴다.
- 기대값 완화(`attemptsMade >= 0`): 시험이 지키려는 "성공한 한 번만 센다"를 놓친다.

## 함정

- 지연 단계에서 잡을 먼저 읽고 상태를 보면, 3초 뒤 다시 돌아 상태가 바뀐 경우를 놓칠 수 있다. 상태 → 잡 순서는 이 경우도 막는다.

## 완료 기준

- 수정 전후 각각 이 시험을 30회 돌려 실패 수를 비교한다.
- `pnpm --filter @expresso/backend test`와 `pnpm test:infra` 통과.
