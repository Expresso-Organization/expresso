---
title: 질문 생성 완료 즉시 알림 · 큐 발행 대기 제거
slug: brew-job-push
stage: plan
status: accepted
intent: .intent/intent_brew-job-push.md
spec: .intent/spec_brew-job-push.md
date: 2026-11-10
---

# 질문 생성 완료 즉시 알림 · 큐 발행 대기 제거 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/backend/src/worker/outbox-wake.ts` (새) | `Wake` · `watchOutboxInserts` |
| `services/backend/src/worker/poll-loop.ts` · `poll-loop.test.ts` | `wake` 옵션 · 테스트 |
| `services/backend/src/worker/main.ts` | 변경 흐름 시작 · 루프에 `wake` 연결 |
| `services/backend/src/worker/processors/brew-jobs.ts` | `brew_job.timing` 로그 |
| `services/backend/src/modules/brew-jobs/service.ts` · `index.ts` · `routes.ts` | `follow` · `BrewJobApi` · SSE 라우트 |
| `services/backend/src/modules/brew-jobs/brew-jobs.integration.test.ts` | `follow` 첫 상태 · 변경 · 남의 잡 404 |
| `services/backend/test/security/security-gate.test.ts` | 새 라우트 401 |
| `services/web/src/app/api/brew-jobs/[jobId]/events/route.ts` (새) | SSE 프록시 |
| `services/web/src/app/(app)/brew/[brewId]/use-refresh-on-job-change.ts` (새) · 테스트 | `EventSource` 훅 |
| `services/web/src/app/(app)/brew/[brewId]/Waiting.tsx` | 새 훅 사용 |

## 작업 순서

1. `Wake` · `runPollLoop` · 단위 테스트 → `vitest poll-loop` 통과.
2. 워커 `main.ts` 연결 · 타이밍 로그 → 백엔드 타입 검사.
3. `follow` · SSE 라우트 · 통합 테스트 → `pnpm test:infra brew-jobs` 통과.
4. 웹 프록시 · 훅 · `Waiting` → 웹 테스트.
5. 브라우저 · 로그로 확인.

## 가장 위험한 단계

2단계. 변경 흐름 오류가 폴링 루프까지 번지면 워커의 모든 비동기 작업이 멈춘다(2026-11-04 운영 정지와 같은 모양). 변경 흐름은 루프와 별도 작업으로 돌리고 오류는 기록 후 다시 열기만 한다. 문제가 생기면 `main.ts`에서 `wake`를 빼면 지금 동작(1초 폴링)으로 돌아간다.

## 검증

```
pnpm --filter @expresso/backend typecheck && pnpm --filter @expresso/web typecheck
pnpm --filter @expresso/backend test && pnpm --filter @expresso/web test
pnpm test:infra brew-jobs poll-loop security-gate
```

화면: 체험 DB 복사본에서 워커를 멈춘 채 재료 → 「AI와 대화 시작」 → 워커 켜기 → 질문 화면 전환 시점과 `brew_jobs.updatedAt` 비교. 워커 로그의 `brew_job.timing`, `outbox_events.publishedAt − createdAt`.
