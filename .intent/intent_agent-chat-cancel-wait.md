---
title: 에이전트 채팅 취소 전달 테스트 대기 시간 정합성
slug: agent-chat-cancel-wait
stage: intent
status: accepted
author: minjaepark
date: 2026-10-19
---

# 에이전트 채팅 취소 전달 테스트 대기 시간 정합성

## 문제

`services/backend/src/modules/agent-chat/service.integration.test.ts`의 "동시 실행을 막고
다른 인스턴스의 취소를 실행 신호로 전달한다"가 CI에서 가끔 실패한다. 로그인 문구 한 줄만
바꾼 PR #95의 백엔드 CI가 이 테스트 하나로 실패했다(`Matcher did not succeed in time`,
1089ms). 같은 코드가 main 948438ba에서는 통과했고 로컬에서도 통과한다. 무관한 PR의
머지와 배포가 재실행을 기다리며 멈춘다.

측정한 원인: 다른 인스턴스가 낸 취소는 실행 중인 인스턴스가 1초마다 보내는 heartbeat
갱신(`service.ts`의 `setInterval(..., 1_000)`)이 문서가 `running`이 아님을 볼 때 전달된다.
테스트는 `expect.poll` 기본값 1초만 기다린다. 로컬에서 테스트 흐름 그대로 재면 취소 완료
→ 실행 중단이 993~995ms라 여유가 5ms 남짓이다. CI에서 타이머나 DB가 조금 늦으면 넘친다.

## 원하는 결과

- 이 테스트가 기다리는 시간이 "취소는 다음 heartbeat에서 전달된다"는 제품 동작에서
  나온 값이고, heartbeat 주기를 바꾸면 테스트의 대기도 함께 바뀐다.
- 로컬 `test:infra`로 이 파일을 20회 이상 반복해 모두 통과한다.
- 원래 검증하던 것(동시 실행 409, 남의 취소 404, 다른 인스턴스 취소가 실행 신호로
  전달되고 상태가 `cancelled`)은 그대로 검증한다.

## 영향 범위

- `services/backend/src/modules/agent-chat/service.integration.test.ts`
- `services/backend/src/modules/agent-chat/service.ts` — heartbeat 주기 상수를 이름으로 드러낼
  수 있다. 동작(1초 주기)은 바꾸지 않는다
- 결정 권한: minjaepark

## 제약

- 제품의 취소 전달 방식과 주기는 바꾸지 않는다.
- 원인을 설명할 수 없는 대기 시간 상수를 넣지 않는다.

## 범위 밖

- 인스턴스 간 취소를 1초보다 빠르게 전달하는 구조(Redis pub/sub, change stream 등)
- 같은 파일의 다른 테스트와 다른 모듈의 시간 의존 테스트 정리

## 열린 질문

- 다른 인스턴스에서 누른 "중지"가 최대 1초 늦게 실행에 닿는 지금 동작을 그대로 두고
  테스트만 맞추는가 — **답: 그대로 둔다(2026-10-19 수락).** 같은 인스턴스의 취소는 즉시 전달되고(`cancel`이
  `this.running`의 컨트롤러를 바로 abort), 1초 지연은 여러 서버 사이에서만 생긴다.
