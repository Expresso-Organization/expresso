---
title: Worker Mongo 복구 불가 오류 종료 처리
slug: worker-mongo-exit
stage: spec
status: draft
intent: .intent/intent_worker-mongo-exit.md
date: 2026-11-06
---

# Worker Mongo 복구 불가 오류 종료 처리 — 명세

## 요구사항

- [ ] Worker는 BullMQ `Worker`를 만들기 전에 `client.connect()`를 호출하고, 실패하면 `worker.fatal`을 기록하고 종료 코드 1로 끝난다.
- [ ] 폴링 루프는 `MongoTopologyClosedError` · `MongoNotConnectedError` · `MongoClientClosedError`에서 멈추고 Worker는 종료 코드 1로 끝난다.
- [ ] 폴링 루프는 `MongoServerSelectionError` 같은 일시적 오류에서는 멈추지 않는다.
- [ ] 처리기가 Mongo 도달 불가 오류를 던지면 잡은 `attemptsMade`를 늘리지 않고 delayed로 옮겨지며 dead-letter 큐에 들어가지 않는다.
- [ ] 처리기에서 닫힌 클라이언트 오류를 만나면 폴링 루프와 같은 종료 경로를 탄다.
- [ ] 종료 중 `close()`가 멈춰도 프로세스는 정해진 시간 안에 끝난다.

## 설계

재사용: `safeErrorSummary`, `createMongoResource`, BullMQ `job.moveToDelayed` + `DelayedError`(BullMQ 6 `moveToDelayed`는 `skipAttempt: true`로 시도 횟수를 쓰지 않는다).

- `platform/mongodb.ts`: `MONGO_SERVER_SELECTION_TIMEOUT_MS`, `isMongoClientClosedError(error)`, `isMongoUnavailableError(error)`를 둔다. 두 판별 함수는 `cause`를 따라 올라간다.
- `worker/poll-loop.ts`(새 파일): `runPollLoop`가 `main.ts`의 while 문을 대신한다. 닫힌 클라이언트 오류면 `onFatal`을 부르고 끝난다. 그 밖의 오류는 `onError`로 넘기고 계속 돈다.
- `worker/create-queue-worker.ts`: 처리기 포장에서 도달 불가 오류를 잡아 `moveToDelayed` 후 `DelayedError`를 던진다. 닫힌 클라이언트면 `onFatalError`를 먼저 부른다. 미루는 시간은 `MONGO_SERVER_SELECTION_TIMEOUT_MS`다. 한 번의 시도가 이미 그만큼 기다렸으므로 같은 주기로 다시 묻는다.
- `worker/main.ts`: 시작 연결을 넣고, `stopOnFatal`이 로그 · `process.exitCode = 1` · 강제 종료 타이머 · abort를 맡는다. 종료 시 fatal이면 `worker.close(true)`로 처리 중인 잡을 기다리지 않는다. 잡 잠금이 만료되면 BullMQ의 stalled 처리가 다시 배달한다.

일시적 오류의 정책은 "횟수 제한 없이 재시도"다. 시작 연결이 성공한 topology는 드라이버의 모니터가 Mongo 복귀 시 스스로 복구하므로 재시작해도 얻는 것이 없다.

## 버린 대안

- 연속 실패 N회 후 종료: 복구되는 상태를 재시작 루프로 바꿀 뿐이고 N의 근거가 없다.
- 프로세스 안에서 `client.connect()`로 다시 열기: 약 20개 서비스가 같은 클라이언트를 공유한다. 종료 후 재시작이 상태를 가장 단순하게 초기화한다.
- 닫힌 클라이언트 오류만 미루기: 연결된 topology의 장애에서도 잡이 약 30초 만에 시도 횟수를 다 쓴다.

## 함정

- 드라이버는 첫 연결 실패 시 topology를 닫고 `client.topology`를 비우지 않아 `autoConnect`가 닫힌 topology를 계속 돌려준다. 실측: op1 `MongoServerSelectionError`, op2부터 `MongoTopologyClosedError`.
- systemd 기본 `StartLimit`은 10초에 5회다. 종료 주기가 서버 선택 3초 + `RestartSec` 3초라 걸리지 않는다.
- `generation.ts`는 오류를 잡아 `failFreeHtml`을 부른다. Mongo가 계속 내려가 있으면 이 호출도 같은 오류를 던져 포장까지 올라온다.
- 로컬 공용 Mongo(`expresso-local-mongodb-1`)는 다른 워크트리의 Worker가 쓰고 있다. 재시작 확인은 전용 컨테이너로 한다.

## 완료 기준

- `pnpm typecheck`, `pnpm test`, `pnpm test:infra` 통과.
- 전용 Mongo 컨테이너와 재시작 셸 루프로 intent의 개발 목표 세 장면을 확인한다.
