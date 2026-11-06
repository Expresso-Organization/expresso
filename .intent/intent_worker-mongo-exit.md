---
title: Worker Mongo 복구 불가 오류 종료 처리
slug: worker-mongo-exit
stage: intent
status: draft
author: Claude
date: 2026-11-06
---

# Worker Mongo 복구 불가 오류 종료 처리

## 개발 목표와 의도

Mongo가 재시작될 때 Worker가 멈춘 채로 남지 않고 스스로 복구되게 한다. 2026-11-06 운영 점검에서 Worker가 2026-11-04 12:22 KST부터 멈춘 것을 확인했다. Mongo 컨테이너 재시작 중에 Worker가 다시 뜨면서 첫 연결에 실패했고, 그 뒤 매초 `MongoTopologyClosedError`만 기록했다. 프로세스가 살아 있어 systemd 상태는 active였고 `Restart=always`가 동작하지 않았다. 그동안 공고 분석, 인터뷰, 레시피, 생성, 공고 수집이 모두 멈췄다.

## 기능 목록

| 기능 | 설명 | 왜 필요한가 |
|---|---|---|
| 시작할 때 Mongo 연결 확인 | Mongo에 닿지 못하면 Worker가 잡을 받기 전에 종료 코드 1로 끝나고, systemd가 다시 띄운다. Mongo가 돌아오면 다음 시작에서 정상으로 돈다. | 이 확인이 없으면 첫 연결 실패가 클라이언트를 영구히 닫아 이번 장애가 다시 난다. |
| 닫힌 클라이언트 감지 시 종료 | 폴링 또는 잡 처리에서 닫힌 Mongo 클라이언트 오류가 나오면 Worker가 종료 코드 1로 끝난다. | 닫힌 클라이언트는 드라이버가 다시 열지 않아 재시도해도 소용이 없고, 프로세스가 살아 있으면 systemd가 다시 띄우지 않는다. |
| Mongo 장애 중 잡 대기 | Mongo에 닿지 못해 실패한 잡은 시도 횟수를 쓰지 않고 잠시 뒤로 미룬다. Mongo가 돌아오면 그대로 처리된다. | 지금은 30초쯤 되는 장애에도 다섯 번의 시도를 다 써서 사용자의 잡이 dead-letter 큐로 넘어간다. |

## 개발 목표

- 첫 연결 실패 후 복구: Mongo를 내린 채 Worker를 띄우면 종료 코드 1로 끝나고, Mongo를 올리면 재시작된 Worker가 outbox 발행을 재개한다.
- 실행 중 재시작 복구: 실행 중인 Worker는 Mongo가 내려갔다 올라와도 프로세스를 유지하며 폴링을 재개한다.
- 잡 보존: Mongo가 내려간 동안 받은 잡의 `attemptsMade`가 0이고 dead-letter 큐가 비어 있다.
- 시험: `pnpm typecheck`, `pnpm test`, `pnpm test:infra`가 통과한다.

## 범위 밖과 제약

- 운영 서버는 건드리지 않는다. systemd 유닛도 바꾸지 않는다.
- API 프로세스도 같은 드라이버 동작에 노출되지만 이번 변경에 넣지 않는다. 별도 작업으로 제안한다.

## 열린 질문

없음
