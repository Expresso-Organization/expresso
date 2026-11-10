---
title: API Mongo 첫 연결 실패 뒤 영구 503 복구
slug: api-mongo-first-connect
stage: spec
status: draft
intent: .intent/intent_api-mongo-first-connect.md
date: 2026-11-07
---

# API Mongo 첫 연결 실패 뒤 영구 503 복구 — 명세

## 요구사항

- [ ] Mongo 없이 시작한 API는 `/health/ready` 503, `/health/live` 200으로 답한다.
- [ ] Mongo가 돌아오면 프로세스 재시작 없이 `/health/ready`가 200이 된다.
- [ ] 연결 성공 뒤의 장애에서도 같은 프로세스가 다시 200이 된다.
- [ ] 재시도 중 SIGTERM을 받으면 종료 코드 0으로 끝난다.
- [ ] 재시도 로그에 Mongo 접속 정보가 들어가지 않는다.

## 설계

재사용: `MONGO_SERVER_SELECTION_TIMEOUT_MS`, `safeErrorSummary`, 드라이버의 `client.connect()`. `_connect`는 닫힌 topology가 있어도 새 `Topology`를 만들어 `client.topology`를 바꾼다. 같은 클라이언트와 `db`를 잡고 있는 서비스는 바꿀 것이 없다.

- `platform/mongodb.ts`: `connectMongoUntilReady(client, { signal, onRetry })`를 둔다. 성공하거나 `signal`이 중단되면 끝나고 거부하지 않는다. 실패와 다음 시도 사이에 `MONGO_SERVER_SELECTION_TIMEOUT_MS`만큼 쉰다. 인증 실패처럼 바로 돌아오는 오류에서 재시도가 쉬지 않고 돌지 않게 하기 위해서다.
- `api/main.ts`: `app.listen` 전에 이 함수를 기다리지 않고 시작한다. `stop`과 시작 실패 경로에서 먼저 중단한다.
- 연결이 한 번 성공하면 드라이버 모니터가 복구하므로 재시도 함수는 끝난다.

## 버린 대안

- Worker처럼 종료 코드 1로 끝내기: README의 503 계약을 깨고, Mongo 장애 동안 `/health/live`와 API 응답 전체가 연결 거부가 된다.
- `/health/ready` 안에서 다시 연결하기: 준비 상태 검사를 부르는 쪽이 없으면 복구되지 않고, 검사가 상태를 바꾸게 된다.

## 함정

- 재시도 중 들어온 요청은 닫힌 topology로 바로 실패하거나 새 topology의 서버 선택을 기다린다. 어느 쪽이든 Mongo가 없는 동안의 기존 응답과 같다.
- `client.close()` 뒤 `connect()`를 부르면 클라이언트가 다시 열린다. `database.close()` 전에 반드시 재시도를 중단한다.

## 완료 기준

- `api-process.integration.test.ts` 통과. TCP 중계로 Mongo 장애를 만들어 실제 API 프로세스를 확인한다.
- `pnpm typecheck`, `pnpm test`, `pnpm test:infra` 통과.
- 전용 Mongo 컨테이너를 실제로 내렸다 올려 같은 장면을 확인한다.
