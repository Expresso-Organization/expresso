---
title: API Mongo 첫 연결 실패 뒤 영구 503 복구
slug: api-mongo-first-connect
stage: intent
status: draft
author: Claude
date: 2026-11-07
---

# API Mongo 첫 연결 실패 뒤 영구 503 복구

## 개발 목표와 의도

Mongo가 내려간 동안 시작한 API가 Mongo 복귀 뒤 재시작 없이 정상으로 돌아오게 한다. 지금은 첫 연결이 실패하면 드라이버가 Mongo 클라이언트를 닫힌 채로 남긴다. 재현 시험에서 Mongo가 돌아오고 20초가 지나도 `/health/ready`가 `{"status":503,"mongodb":"down"}`이었고 로그에는 아무것도 없었다. 프로세스가 살아 있어 systemd도 다시 띄우지 않는다. Worker에서 난 장애(PR #170)와 원인이 같다.

## 기능 목록

| 기능 | 설명 | 왜 필요한가 |
|---|---|---|
| Mongo 연결 재시도 | API가 뜨자마자 Mongo 연결을 시도하고, 성공할 때까지 3초 간격으로 다시 시도한다. 그동안 `/health/ready`는 503, `/health/live`는 200으로 답한다. | 이 재시도가 없으면 Mongo가 돌아와도 API를 손으로 재시작하기 전까지 모든 Mongo 요청이 실패한다. |
| 재시도 경고 로그 | 연결 시도가 실패할 때마다 오류 이름만 경고로 남긴다. | 지금은 이 상태가 로그에 나타나지 않아 왜 503인지 알 수 없다. |

## 개발 목표

- Mongo 없이 시작한 API: `/health/ready`가 503이고, Mongo를 올리면 재시작 없이 200이 된다.
- 연결 뒤 장애: Mongo가 내려갔다 올라와도 같은 프로세스가 다시 200이 된다.
- 기다리는 중 종료: Mongo를 기다리는 API에 SIGTERM을 보내면 종료 코드 0으로 끝난다.
- 시험: `pnpm typecheck`, `pnpm test`, `pnpm test:infra`가 통과한다.

## 범위 밖과 제약

- API를 종료 코드 1로 끝내지 않는다. README가 "인프라가 없어도 API는 시작하고 준비 상태 검사가 503을 반환한다"고 정해 두었다.
- 운영 서버와 Worker 동작은 바꾸지 않는다.
- PR #170의 코드 위에 쌓는다.

## 열린 질문

없음
