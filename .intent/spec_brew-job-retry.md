---
title: 실패한 레시피·질문 작업의 다시 시도
slug: brew-job-retry
stage: spec
status: accepted
intent: .intent/intent_brew-job-retry.md
date: 2026-10-25
---

# 실패한 레시피·질문 작업의 다시 시도 — 명세

## 요구사항

- [ ] 같은 키로 다시 제출된 작업이 `status: "failed"`이고 `failureRetryable: true`이면, 같은 작업 문서를 `queued`/`queued`로 되돌리고 `errorCode` · `failureRetryable`을 비운다. 응답은 `status: "queued"`, `failure: null`이다.
- [ ] 그때 아웃박스 이벤트를 새 키 `brew-job:{jobId}:{attempts}`로 하나 넣는다. 디스패처가 새 이벤트의 `_id`를 BullMQ `jobId`로 쓰므로 워커가 새 큐 작업을 받는다.
- [ ] 첫 제출의 아웃박스 키는 지금과 같은 `brew-job:{jobId}`다.
- [ ] 성공 작업, 재시도 불가 실패, 대기·실행 중인 작업을 다시 제출하면 상태를 바꾸지 않고 아웃박스 이벤트도 늘지 않는다.
- [ ] 동시에 두 번 다시 제출해도 아웃박스 이벤트는 한 건만 늘어난다.
- [ ] 다른 brew나 다른 종류에 같은 키를 쓰면 지금처럼 409다.

## 설계

`services/backend/src/modules/brew-jobs/service.ts`만 고친다. 웹(`brew-actions.ts`의 `recipe:{brewId}` · `interview:{brewId}`)과 계약은 그대로다.

- 순수 함수 `brewJobOutboxKey(job, inserted)`를 같은 파일에 두고 내보낸다. 새로 넣은 작업이면 `brew-job:{id}`, 재시도 가능한 실패면 `brew-job:{id}:{attempts}`, 나머지는 `null`(발행하지 않음).
- `submit`은 기존 409 검사 뒤 이 함수로 키를 정한다. 재시도 가능한 실패면 `{ _id, userId, status: "failed", failureRetryable: true, attempts }` 조건으로 `updateOne`해 `queued`로 되돌리고, 같은 트랜잭션에서 `addMongoOutboxEvent`를 부른다. 키가 `null`이면 발행하지 않는다.
- `attempts`는 `process`가 `running`으로 바꿀 때만 늘고 `failed`는 그 뒤에만 기록되므로, 다시 제출할 때마다 값이 다르다. 그래서 키가 겹치지 않는다. 같은 실패에 대한 두 제출은 같은 키를 만든다.
- 동시 제출은 `inTransaction`(snapshot + `withTransaction`)이 WriteConflict를 재시도해 처리한다. 두 번째 시도는 `queued`를 읽고 발행하지 않는다.
- 실행부(`runner.run`)의 키 `brew-job:{jobId}`는 그대로다. 실패 직전에 결과가 이미 만들어졌으면 다시 돌 때 그 결과를 재생한다.

## 버린 대안

- 재시도마다 새 작업 만들기: 웹이 누를 때마다 새 키를 만들어야 하고, 두 번 누르면 작업이 두 개 생긴다. "브루 하나에 작업 하나" 주석과도 어긋난다.
- 작업 문서에 제출 횟수 필드 추가: 0001 스키마에 없는 필드라 문서화가 필요하고, `attempts`로 같은 효과를 낸다.
- 구 MySQL 서비스 동시 수정: 운영 경로가 아니고 `test:infra`가 `TEST_DATABASE_URL`을 지워 검증할 수 없다.

## 함정

- BullMQ 자체 재시도(5회, 지수 backoff) 사이에도 문서는 `failed`다. 그때 다시 제출하면 큐 작업 두 개가 같은 문서를 돌릴 수 있다. 결과 기록은 `{ status: "running", attempts }` 조건이라 마지막 시도만 남고, 실행부는 키로 멱등이라 결과는 하나다. AI 호출이 한 번 더 쓰인다.
- 기존 `materials.integration.test.ts`는 첫 제출 후 아웃박스 수가 1이라고 본다. 첫 제출 키를 바꾸지 않아야 한다.

## 완료 기준

- `pnpm --filter @expresso/backend test` — 새 단위 테스트 `brew-jobs/service.test.ts` 통과
- `pnpm test:infra` — 새 `brew-jobs/brew-jobs.integration.test.ts`와 기존 `materials.integration.test.ts` 통과
- `pnpm typecheck` 통과
