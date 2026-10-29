---
title: 공고 분석 실패 원인 구분
slug: analysis-failure-codes
stage: plan
status: accepted
intent: .intent/intent_analysis-failure-codes.md
spec: .intent/spec_analysis-failure-codes.md
date: 2026-10-29
---

# 공고 분석 실패 원인 구분 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/backend/src/modules/job-analysis/service.ts` | `failureOf`에 `AiError` 분기를 더하고 `export`한다 |
| `services/backend/src/modules/job-analysis/job-analysis.test.ts` | `failureOf` 단위 테스트(네 AI 코드, 증거 오류, 추출기 없음, 일반 예외) |
| `services/backend/src/modules/job-analysis/job-analysis.integration.test.ts` | `process`가 AI 오류로 실패할 때 저장된 `failure`를 검증한다 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 단위 테스트를 먼저 쓴다 — `AiError` 케이스가 현재 코드에서 실패하는 것을 확인한다.
2. `failureOf`를 고치고 `export`한다 — 단위 테스트가 통과한다.
3. 통합 테스트를 더한다 — `AI_UNAVAILABLE`을 던지는 추출기로 `process`를 돌리고 `getResult`의 `failure`를 확인한다.
4. 타입 검사와 전체 job-analysis 테스트를 돌린다.

## 가장 위험한 단계

3단계다. 통합 테스트는 실제 MongoDB와 Redis가 필요하다(`pnpm infra:up`). 인프라가 없으면 이 단계를 통과 못 하는 것이 아니라 건너뛴 것이므로 건너뛰었다고 보고한다. 코드 변경은 한 함수라 되돌리려면 커밋을 되돌리면 된다.

## 검증

```bash
pnpm --filter @expresso/contracts build && pnpm --filter @expresso/database build
pnpm --filter @expresso/backend typecheck
pnpm --filter @expresso/backend exec vitest run src/modules/job-analysis
pnpm test:infra
```
