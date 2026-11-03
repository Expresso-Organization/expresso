---
title: AI 출력 거절 · 재작성 제거
slug: ai-output-no-rewrite
stage: plan
status: accepted
intent: .intent/intent_ai-output-no-rewrite.md
spec: .intent/spec_ai-output-no-rewrite.md
date: 2026-10-27
---

# AI 출력 거절 · 재작성 제거 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/backend/src/platform/ai/client.ts` | `toToolSchema` 기준 떼기 · 설명 옮기기, `AiCallOptions`에 `check` · `onDraft` · `onRevision`, 위반 · 고치기 형식 |
| `services/backend/src/platform/ai/claude-code.ts` | 세션 ID, 검사 → `--resume` 고치기 루프(2회), 사용량 합산 |
| `services/backend/src/worker/create-queue-worker.ts` | `AI_INVALID_OUTPUT` → `UnrecoverableError` |
| `services/backend/src/modules/**` 호출 19곳 | 재요청 루프 제거, 업무 규칙 → `check` |
| `services/backend/src/modules/page/design-first.ts` · `structured-generator.ts` | 예산 → `check`, 고친 칸 → `sink.fill(revised)` |
| `packages/contracts/src/page-stream.ts` · `services/backend/src/modules/page/stream.ts` | `fill`에 `revised` |
| `services/web/.../design/LivePreview.tsx` | 고친 칸 애니메이션 |
| `packages/contracts` 질문 · 지면 스키마 | 모순 정리 |
| `AGENTS.md` | 원칙 |

## 작업 순서

1. 공급자 형식 · 검사 · 고치기 루프 · 큐 재실행 중지와 단위 테스트(가짜 CLI로 위반 → 고치기 → 결과).
2. 호출 지점별 루프 제거와 `check` 이전 — 지점마다 위반 출력 테스트.
3. 지면 채우기 고친 칸 스트림 · 화면 애니메이션.
4. 모순 정리 · AGENTS.md · 금지 키워드 테스트.
5. 전체 검증, 체험 서버 실제 생성 녹화(로그에 거절 없음 확인), 커밋 · 푸시 · PR(base `feat/portfolio-design-first`).

## 가장 위험한 단계

2번. 호출마다 업무 규칙의 모양이 달라 `check`로 옮길 때 경로를 잘못 짚으면 고치기가 엉뚱한 칸을 받는다. 지점마다 테스트로 경로를 확인한다.

## 검증

```
pnpm typecheck
REQUIRE_BROWSER=1 pnpm test
pnpm test:infra
```
