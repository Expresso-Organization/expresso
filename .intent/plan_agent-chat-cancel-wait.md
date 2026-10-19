---
title: 에이전트 채팅 취소 전달 테스트 대기 시간 정합성
slug: agent-chat-cancel-wait
stage: plan
status: accepted
intent: .intent/intent_agent-chat-cancel-wait.md
spec: .intent/spec_agent-chat-cancel-wait.md
date: 2026-10-19
---

# 에이전트 채팅 취소 전달 테스트 대기 시간 정합성 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/backend/src/modules/agent-chat/service.ts` | `RUN_HEARTBEAT_MS` 상수와 `setInterval`에서의 사용 |
| `services/backend/src/modules/agent-chat/service.integration.test.ts` | 취소 전달 대기를 `RUN_HEARTBEAT_MS * 2`로 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 상수 추출 — `setInterval`의 숫자 리터럴이 사라지고 동작은 같다. typecheck로 확인.
2. 테스트 대기 변경 — 해당 테스트 단독 실행 통과.
3. 반복 검증 — 파일 20회, `test:infra` 1회.

## 가장 위험한 단계

없음에 가깝다. 제품 동작 값은 그대로다. 되돌리기는 커밋 하나를 revert한다.

## 검증

```
pnpm --filter @expresso/backend typecheck
for i in $(seq 1 20); do TEST_MONGODB_URL=... TEST_REDIS_URL=... npx vitest run src/modules/agent-chat/service.integration.test.ts; done
pnpm test:infra
```
