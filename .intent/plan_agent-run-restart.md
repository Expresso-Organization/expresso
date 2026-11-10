---
title: 배포 재시작에 끊긴 에이전트 답변의 중단 표시
slug: agent-run-restart
stage: plan
status: accepted     # draft | accepted | rejected
intent: .intent/intent_agent-run-restart.md
spec: .intent/spec_agent-run-restart.md
date: 2026-11-10
---

# 배포 재시작에 끊긴 에이전트 답변의 중단 표시 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/backend/src/modules/agent-chat/service.ts` | `RUN_INTERRUPTED_ERROR` 상수, `closing` 표시, `catch` 판정, `setRunFailureListener` |
| `services/backend/src/modules/agent-chat/routes.ts` | `onClose` → `preClose`, 실패 수신자를 `app.log.error`로 등록 |
| `services/backend/src/modules/agent-chat/service.integration.test.ts` | 종료 중 실패 → interrupted, 일반 실패 → failed + 수신자 호출 |
| `infra/systemd/expresso-api.service` | `KillMode=mixed`와 이유 주석 |

## 작업 순서

1. `service.ts` 수정 — `pnpm --filter @expresso/backend typecheck` 통과
2. `routes.ts` 수정 — 같은 타입 검사 통과, `routes.test.ts` 통과
3. 통합 테스트 두 사례 추가 — `pnpm test:infra`에서 새 사례 통과
4. 유닛 파일 수정 — `systemd-analyze verify`는 로컬(macOS)에 없으므로 운영 반영 때 `systemctl show`로 확인
5. 전체 검증 후 커밋 · 푸시 · PR

## 가장 위험한 단계

2단계 `preClose` 이동. `preClose`에서 실행을 끊으면 SSE가 마지막 상태를 보내고 닫힌다. 훅이 실패하면 `app.close()`가 멈출 수 있으므로 `close()`는 `Promise.allSettled`로 작업을 기다리는 지금 구조를 유지한다. 문제가 생기면 훅 이름만 `onClose`로 되돌리면 이전 동작이다.

운영 유닛 반영은 `sudo cp` + `daemon-reload`이며 다음 재시작부터 적용된다. 되돌리기는 이전 유닛 파일을 다시 복사하는 것이다.

## 검증

```
pnpm typecheck
pnpm test
pnpm test:infra
```
