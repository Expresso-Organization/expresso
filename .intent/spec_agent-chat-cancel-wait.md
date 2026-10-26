---
title: 에이전트 채팅 취소 전달 테스트 대기 시간 정합성
slug: agent-chat-cancel-wait
stage: spec
status: accepted
intent: .intent/intent_agent-chat-cancel-wait.md
date: 2026-10-19
---

# 에이전트 채팅 취소 전달 테스트 대기 시간 정합성 — 명세

## 요구사항

- [ ] heartbeat 주기가 `service.ts`에 이름 있는 상수 하나로 있고, 실행 루프의 `setInterval`이 그 상수를 쓴다. 값은 지금과 같은 1000ms다.
- [ ] 테스트의 취소 전달 대기가 그 상수에서 계산된다. 상수를 바꾸면 테스트 대기도 따라 바뀐다.
- [ ] 테스트가 검증하는 항목(409 · 404 · `stopped` · `cancelled`)은 그대로다.
- [ ] 이 테스트 파일을 실제 인프라로 20회 반복 실행해 모두 통과한다.

## 설계

- `service.ts`에 `export const RUN_HEARTBEAT_MS = 1_000;`를 두고 `execute()`의 heartbeat `setInterval`에 쓴다. 주석에 "다른 인스턴스의 취소가 실행에 닿는 최대 지연"이라는 뜻을 적는다. 같은 모듈의 테스트가 가져오므로 모듈 경계 규칙에 걸리지 않는다.
- 테스트는 `expect.poll(() => stopped, { timeout: RUN_HEARTBEAT_MS * 2 })`로 기다린다. 전달은 다음 heartbeat 한 번과 그 갱신의 DB 왕복으로 끝난다. 그 한 주기에 타이머 지연과 DB 지연을 받을 여유 한 주기를 더한다.
- vitest 4.1.10의 `expect.poll` 기본값은 `interval` 50ms · `timeout` 1000ms다(설치본 CLI 설명). 지금 실패는 이 1000ms가 heartbeat 1000ms와 같아서 생긴다.

## 버린 대안

- 테스트에 `timeout: 5_000` 같은 숫자만 넣기 — 제품의 주기와 연결이 없어 주기를 바꾸면 다시 깨진다.
- 전역 `expect.poll.timeout` 설정 올리기 — 다른 테스트의 대기까지 늘어나 실패가 늦게 드러난다.
- 인스턴스 간 취소를 Redis pub/sub로 즉시 전달 — intent에서 범위 밖으로 정했다.

## 함정

- 같은 인스턴스의 취소는 `this.running`의 컨트롤러를 바로 abort하므로 즉시 전달된다. 이 테스트는 `make(null)`인 다른 인스턴스로 취소해서 heartbeat 경로를 탄다. 그 구분을 바꾸지 않는다.
- `service.ts:33`의 60초 정체 판단(`heartbeatAt < now - 60_000`)은 다른 값이다. 이번 상수와 묶지 않는다.

## 완료 기준

- `pnpm --filter @expresso/backend typecheck` 통과.
- 실제 인프라로 `src/modules/agent-chat/service.integration.test.ts` 20회 반복, 전부 `17 passed`.
- `pnpm test:infra` 통과.
