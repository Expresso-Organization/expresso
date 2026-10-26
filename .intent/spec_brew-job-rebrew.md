---
title: 거절·성공한 레시피·질문 작업의 다시 만들기
slug: brew-job-rebrew
stage: spec
status: accepted
intent: .intent/intent_brew-job-rebrew.md
date: 2026-10-25
---

# 거절·성공한 레시피·질문 작업의 다시 만들기 — 명세

## 요구사항

- [ ] 웹이 보내는 키는 `brew.latestJob`이 없으면 `{type}:{brewId}`(지금과 같음), 있으면 `{type}:{brewId}:{latestJob.jobId}`다. `latestJob`은 종류를 가리지 않는다.
- [ ] 세 폼(질문 Waiting · 레시피 Waiting · "구성 다시 만들기")이 숨은 값 `basisJobId`를 보내고, 액션은 UUID가 아니면 기준 없이 첫 키를 쓴다.
- [ ] 처리기는 재시도 불가로 분류된 실패를 `UnrecoverableError`로 바꿔 던진다(`code`에 분류 코드, `cause`에 원래 오류). 재시도 가능한 실패는 원래 오류를 그대로 던진다.
- [ ] 재시도 가능한 실패이고 BullMQ가 다시 돌릴 예정이면 문서를 `failed`가 아니라 `queued`/`queued`로 남긴다(`errorCode` · `failureRetryable`은 `null`). 마지막 시도이거나 재시도 불가면 지금처럼 `failed`다.
- [ ] `process`의 새 인자 `{ finalAttempt }`의 기본값은 `true`다. 직접 부르는 기존 호출의 동작은 그대로다.

## 설계

- 웹: `services/web/src/app/(app)/brew/[brewId]/brew-job-key.ts`에 `brewJobKey(type, brewId, basisJobId)`를 둔다(`"use server"` 파일은 async 함수만 내보낼 수 있어 따로 둔다). `brew-actions.ts`의 두 액션이 폼의 `basisJobId`로 이 함수를 부른다. `Waiting`은 `basisJobId` 속성을 받아 숨은 입력으로 넣고, `counter/page.tsx` · `outline/page.tsx`는 `brew.latestJob?.jobId`를 넘긴다. 길이는 최대 `interview:`+36+`:`+36 = 83자이고 `IdempotencyKeySchema`(16~128자, `[A-Za-z0-9._~:+\-/]`)를 만족한다.
- 같은 렌더에서 두 번 누르면 키가 같아 서버의 같은 키 재생으로 하나로 모인다. 작업이 생기면 그 작업이 `latestJob`이 되므로 다음 누름은 새 키다.
- 처리기: `services/backend/src/worker/processors/brew-jobs.ts`의 `createBrewJobProcessor`가 `finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1)`을 넘긴다. BullMQ 6.0.9에서 `attemptsMade`는 시도가 끝날 때 늘어나며(`moveToFinished`/`retryJob` lua의 `HINCRBY atm`), `Job.shouldRetryJob`도 같은 식을 쓴다. 실패를 받으면 `classifyBrewJobFailure`로 다시 분류해, 재시도 불가면 `UnrecoverableError`를 던진다. BullMQ는 `err.name == 'UnrecoverableError'`이면 남은 횟수와 상관없이 멈춘다(`job.js` `shouldRetryJob`).
- 서비스: `BrewJobService.process`의 실패 기록에서 `retryable && !finalAttempt`면 `queued`로 기록한다. `BrewJobApi`가 `Pick<Legacy…>`이므로 `legacy-mysql-service.ts`의 `process`에도 같은 선택 인자를 추가하고 같은 규칙을 적용한다.
- `classifyBrewJobFailure`의 주석을 실제 동작에 맞춘다.

## 버린 대안

- 서버가 끝난 작업이면 새로 돌리기: 네트워크 재전송에도 레시피가 하나 더 생긴다.
- 재시도 전용 API(`POST /brew-jobs/:id/retry`): 계약과 라우트가 늘어나고, 거절·성공 경로는 여전히 새 키가 필요하다.
- 큐 재시도 중 단계 이름 `retrying` 신설: `Waiting`은 `stage === "queued"`일 때만 "차례를 기다리는 중"을 보여 주므로 기존 값을 쓴다.

## 함정

- 재시도 불가 실패는 이제 DLQ에 들어가지 않는다(`create-queue-worker.ts`는 `attemptsMade < maxAttempts`면 DLQ를 건너뛴다). 실패 기록은 brew 잡 문서와 `queue.job_failed` 로그에 남는다.
- 재시도 불가 `AiError`(`AI_UNAVAILABLE` 등)도 한 번에 멈춘다.
- `latestJob`이 다른 종류의 작업이어도 그 id는 이 종류의 키로 쓰인 적이 없으므로 새 작업이 된다.

## 완료 기준

- 웹 `brew-job-key.test.ts`, 백엔드 `worker/processors/brew-jobs.test.ts` 통과
- `pnpm test:infra` — `brew-jobs.integration.test.ts`의 새 경우와 기존 경우 통과
- Mongo e2e `test/e2e/brewing-flow.test.ts` 통과
- `pnpm typecheck` · 백엔드 `test` · 웹 `test`(기존 `browserRuntime.test.ts` 2건 제외) 통과
