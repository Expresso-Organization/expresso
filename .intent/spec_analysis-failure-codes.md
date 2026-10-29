---
title: 공고 분석 실패 원인 구분
slug: analysis-failure-codes
stage: spec
status: accepted
intent: .intent/intent_analysis-failure-codes.md
date: 2026-10-29
---

# 공고 분석 실패 원인 구분 — 명세

## 요구사항

- [ ] `failureOf(new AiError(code, ...))`는 `{ code: error.code, retryable: error.retryable }`를 돌려준다. `AiErrorCode` 네 값 모두에 해당한다.
- [ ] `AnalysisEvidenceError`는 `INVALID_SOURCE_SPAN`/`false`, `RequirementExtractorUnavailableError`는 `EXTRACTOR_UNAVAILABLE`/`false`를 유지한다.
- [ ] 그 외 예외는 `EXTRACTION_FAILED`/`true`를 유지한다.
- [ ] `JobAnalysisService.process`가 AI 오류로 실패하면 `getResult().analysis.failure`가 위 값과 같다.
- [ ] 계약(`JobAnalysisStatusSchema.failure.code`는 `string` 1–100자)은 바꾸지 않는다. 새 코드는 계약을 통과한다.

## 설계

- `services/backend/src/modules/job-analysis/service.ts`의 `failureOf`에 `AiError` 분기를 더한다. 값은 `platform/ai/client.ts`의 `AiError.code`와 `retryable`이 유일한 출처다.
- 선례: `worker/processors/brew-jobs.ts`가 `if (error instanceof AiError) return { code: error.code, retryable: error.retryable }`로 같은 일을 한다. 같은 기준을 쓴다.
- 분기 순서는 `AnalysisEvidenceError` → `RequirementExtractorUnavailableError` → `AiError` → 기본값이다. `AiRequirementExtractor`는 증거 부족을 `AnalysisEvidenceError`로 던지므로 `AiError`와 겹치지 않는다.
- `failureOf`를 `export`해 단위 테스트가 DB 없이 분기를 검증한다.
- 모듈 경계: `modules/job-analysis`가 `platform/ai/client.js`를 가져오는 것은 플랫폼 의존이라 허용된다(`ai-extractor.ts`가 이미 가져온다).

## 버린 대안

- 코드를 `EXTRACTION_FAILED` 하나로 두고 메시지를 따로 저장: 저장 필드를 새로 만들어야 하고, 이미 있는 `failureCode`가 같은 역할이다.
- 실패 화면에서 코드를 한국어로 풀어 쓰기: 요청 범위 밖이다. 코드가 먼저 정확해야 한다.
- `retryable: false`인 AI 오류를 `UnrecoverableError`로 바꿔 큐 재시도를 막기: 서버 설정 오류에서 호출 5번을 아끼지만 큐 동작 변경이라 별도 변경으로 둔다.

## 함정

- `AiError.retryable`의 기본값은 `code === "AI_TIMEOUT"`이다. 어댑터마다 명시적으로 넘기므로 이 값을 그대로 믿는다.
- 실패 기록은 `retry` 때마다 덮어쓴다. 마지막 시도의 코드가 남는다.
- 기존 통합 테스트(MySQL 시절)가 `EXTRACTION_FAILED`를 기대하는 자리는 일반 `Error`를 던지는 경우라 그대로 맞는다.

## 완료 기준

```bash
pnpm --filter @expresso/backend typecheck
pnpm --filter @expresso/backend exec vitest run src/modules/job-analysis/job-analysis.test.ts
pnpm test:infra   # job-analysis 통합 테스트 포함
```

세 명령이 통과하고, 새 테스트가 `AiError` 네 코드와 일반 예외를 검증한다.
