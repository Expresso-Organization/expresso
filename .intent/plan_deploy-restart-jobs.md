---
title: 배포 재시작 시 진행 중 AI 잡 고착 해소
slug: deploy-restart-jobs
stage: plan
status: accepted
intent: .intent/intent_deploy-restart-jobs.md
spec: .intent/spec_deploy-restart-jobs.md
date: 2026-11-10
---

# 배포 재시작 시 진행 중 AI 잡 고착 해소 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/backend/src/worker/shutdown.ts` | 새로 만듦. 큐 워커 먼저 · 자원 나중 종료 |
| `services/backend/src/worker/shutdown.test.ts` | 새로 만듦. 종료 순서 시험 |
| `services/backend/src/worker/main.ts` | 신호 즉시 워커 닫기 · `closeWorkerRuntime` 사용 · `stopping` 전달 |
| `services/backend/src/worker/create-queue-worker.ts` | `stopping` 옵션과 미루기 |
| `services/backend/src/platform/queue.integration.test.ts` | 멈추는 중 미루기 시험 |
| `services/backend/src/platform/ai/claude-code.ts` | 신호 종료를 재시도 가능 오류로 |
| `services/backend/src/platform/ai/ai.test.ts` 또는 claude-code 시험 | 신호 종료 시험 |
| `services/backend/src/worker/processors/generation.ts` | 멈추는 중 다시 던짐 |
| `services/backend/src/worker/processors/generation.test.ts` | 다시 던짐 시험 |
| `services/backend/src/api/build-app.ts` | `forceCloseConnections: true` |
| API 종료 시험(기존 build-app 시험 옆) | 열린 SSE가 있어도 `close()`가 끝나는지 |

## 작업 순서

1단계: `shutdown.ts`와 시험, `main.ts` 종료부 교체 — 시험에서 워커 close가 DB close보다 먼저 끝난다.
2단계: `create-queue-worker.ts` `stopping` 미루기와 통합 시험 — 지연 큐로 가고 `attemptsMade`가 0이다.
3단계: `claude-code.ts` 신호 종료 — 가짜 CLI가 `kill -TERM $$`로 끝나면 `retryable: true`.
4단계: `generation.ts` 다시 던짐 — `stopping` 중단 시 `failFreeHtml`을 부르지 않는다.
5단계: `build-app.ts` 연결 강제 종료 — 끝나지 않는 SSE를 연 채 `app.close()`가 1초 안에 끝난다.
6단계: 검증 명령 실행, PR 작성(머지하지 않음).

## 가장 위험한 단계

2단계. 멈추는 중의 모든 실패를 미루면 도메인 거절도 다시 돈다. `UnrecoverableError`를 제외해 막는다. 문제가 생기면 `stopping` 옵션 전달을 빼면 이전 동작으로 돌아간다.

## 검증

```
pnpm --filter @expresso/backend test
pnpm typecheck
pnpm infra:up && pnpm test:infra
```

운영 확인(배포 뒤, 사용자 승인): 질문 생성 시작 → `ssh Oracle-Server 'sudo systemctl restart expresso-worker'` → `brew_jobs`가 `succeeded`, `worker.log`에 `queue.job_deferred` `worker_stopping`.
