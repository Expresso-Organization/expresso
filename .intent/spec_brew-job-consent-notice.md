---
title: 질문·레시피 작업의 동의 실패 안내
slug: brew-job-consent-notice
stage: spec
status: accepted
intent: .intent/intent_brew-job-consent-notice.md
date: 2026-10-26
---

# 질문·레시피 작업의 동의 실패 안내 — 명세

## 요구사항

- [ ] 실행부가 `ConsentError`를 던지면 잡은 `failed`이고 `failure`는 `{ code: "CONSENT_REQUIRED", retryable: false, requiredConsent: <scope> }`다. BullMQ는 다시 돌리지 않는다(#102의 `UnrecoverableError` 경로).
- [ ] 동의가 아닌 실패의 `failure.requiredConsent`는 `null`이다.
- [ ] `GET /v1/brew-jobs/:id`와 브루 상태의 `latestJob`이 같은 `failure`를 돌려준다.
- [ ] 잡이 다시 `running`·`queued`가 되면 `requiredConsent`도 비운다.
- [ ] 01b · 02b의 `Waiting`은 `CONSENT_REQUIRED`일 때 동의 이름을 넣은 문구와 `/account#ai-consent` 링크를 보여 준다. 버튼은 그대로 있어 동의를 켜고 다시 누를 수 있다.
- [ ] 설정 화면의 AI 사용 동의 묶음에 `id="ai-consent"`가 있다.

## 설계

- **계약** `packages/contracts/src/jobs.ts`: `BrewJobStatusSchema.failure`에 `requiredConsent: ConsentScopeSchema.nullable()`. 응답 필드이므로 필수 · nullable로 둔다(`resultId`와 같은 관례).
- **문서** `packages/database/src/documents/brew.ts`: `BrewJobDoc.requiredConsent?: Contracts.ConsentScope | null`. 0001 validator에 `additionalProperties`가 없어 그대로 저장된다. 원격 브랜치들이 0013–0019를 이미 쓰고 있어 validator용 마이그레이션은 두지 않는다.
- **분류** `worker/processors/brew-jobs.ts`: `classifyBrewJobFailure`가 `ConsentError`를 맨 앞에서 `CONSENT_REQUIRED`로 분류하고 `requiredConsent: error.scope`를 함께 돌려준다. `FailureClassifier`의 반환에 `requiredConsent?: ConsentScope | null`을 더한다.
- **서비스** `brew-jobs/service.ts`: `process`의 실패 기록 · 시작 시 초기화 · `submit` 재큐잉에 `requiredConsent`를 함께 쓴다. 문서를 `BrewJobStatus`로 바꾸는 `brewJobStatus(doc)`를 내보내 `getStatus`와 `materials/service.ts`의 `latestJob`이 같은 함수를 쓴다(지금은 두 곳에 같은 식이 있다).
- **구 MySQL** `brew-jobs/legacy-mysql-service.ts` · `materials/legacy-mysql-service.ts`: 열이 없으므로 `requiredConsent: null`만 넣는다.
- **웹** `services/web/src/lib/consent-copy.ts`: `account/page.tsx`의 `CONSENT_COPY`를 옮겨 두 화면이 같이 쓴다. `Waiting.tsx`는 `CONSENT_COPY[scope].title`로 "{이름} 동의가 꺼져 있어 만들지 못했습니다."와 "설정에서 켜기" 링크를 그린다. 링크 색은 기존 `--ex-accent-text`를 쓴다.

## 버린 대안

- 잡 종류로 동의를 추정(`CONTRACT_CONSENT[question_draft]`): 실행부가 다른 계약을 부르게 되면 화면이 틀린 동의를 가리킨다. 오류가 가진 `scope`를 그대로 저장한다.
- `code`에 범위를 붙이기(`CONSENT_REQUIRED:career_records`): 문자열 파싱이 계약 밖으로 샌다.

## 함정

- `BrewJobStatusSchema`가 strict라 `requiredConsent`를 빠뜨린 생산자는 파싱에서 멈춘다. 생산자는 `brewJobStatus`, 구 MySQL 두 곳이다.
- `ConsentError`를 일반 오류보다 먼저 검사해야 한다 — 지금은 마지막 분기 `PROVIDER_FAILED`로 떨어진다.

## 완료 기준

- 단위: `worker/processors/brew-jobs.test.ts`에 동의 분류 · 1회 종료, 웹 `Waiting.test.tsx`에 동의 문구 · 링크
- 통합: `brew-jobs.integration.test.ts`에 동의 실패 → `getStatus` · `latestJob`의 `requiredConsent`, 새 키로 다시 눌러 성공
- `pnpm typecheck` · `pnpm test` · `pnpm test:infra`
