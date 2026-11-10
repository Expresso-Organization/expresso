---
title: 큐 통합 시험 Mongo 도달 불가 지연 확인의 간헐 실패 수정
slug: queue-mongo-down-flaky
stage: plan
status: draft
intent: .intent/intent_queue-mongo-down-flaky.md
spec: .intent/spec_queue-mongo-down-flaky.md
date: 2026-11-10
---

# 큐 통합 시험 Mongo 도달 불가 지연 확인의 간헐 실패 수정 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/backend/src/platform/queue.integration.test.ts` | 지연 · 완료 대기를 상태 → 잡 순서로 |

## 작업 순서

1. 수정 전 30회 반복 실행으로 실패 재현
2. 대기 순서 수정
3. 수정 후 30회 반복 실행, `pnpm test:infra`
4. 커밋 · PR(이슈 #189 닫기)

## 가장 위험한 단계

1단계. 경합 창이 좁아 30회 안에 재현되지 않을 수 있다. 그때는 원인 근거를 BullMQ 스크립트(`moveToFinished-14.lua`의 `HINCRBY atm`)와 CI 로그로 두고, 수정 후 반복 실행은 회귀 확인으로 쓴다.

## 검증

```
for i in $(seq 1 30); do npx vitest run src/platform/queue.integration.test.ts -t "Mongo 도달 불가"; done
pnpm test:infra
```
