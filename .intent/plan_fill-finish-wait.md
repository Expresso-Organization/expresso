---
title: 채우기 마무리 구간 단축 · 진행 문구
slug: fill-finish-wait
stage: plan
status: accepted
intent: .intent/intent_fill-finish-wait.md
spec: .intent/spec_fill-finish-wait.md
date: 2026-11-10
---

# 채우기 마무리 구간 단축 · 진행 문구 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/backend/src/modules/page/design-first.ts` | 칸 선택화 · 빠진 칸 검사 · `withEmptyFills` · `drafted` 갈고리 |
| `services/backend/src/modules/page/design-first.test.ts` | 고치기 호출 수 · 빠진 칸 검사 테스트 |
| `services/backend/src/modules/page/structured-generator.ts` | `drafted` → `sink.stage("drafted")` |
| `services/backend/src/platform/ai/fixes.ts` | `ai.fix_round`에 `kind` |
| `packages/contracts/src/page-stream.ts` | `PAGE_STREAM_STAGES`에 `drafted` |
| `services/web/src/app/(app)/brew/[brewId]/design/LivePreview.tsx` | 문구 · 고친 칸 따라가기 |
| `services/web/src/app/(app)/brew/[brewId]/design/live-preview-phases.test.ts` (새 파일) | 모든 단계에 문구가 있는지 |

## 작업 순서

1. 계약에 `drafted` 추가, 계약 다시 짓기 — `pnpm --filter @expresso/contracts build`
2. `design-first.ts` 칸 선택화 · 검사 · 정규화 · 갈고리, 테스트 — `design-first.test.ts` 통과
3. `structured-generator.ts` · `fixes.ts` 로그 — 백엔드 테스트 통과
4. `LivePreview` 문구 · 따라가기, 테스트 — 웹 테스트 통과
5. 전체 검증 — 아래 명령

## 가장 위험한 단계

2단계. 빠진 칸을 채우는 자리를 놓치면 섹션 조립에서 `output.quote.trim()`이 `undefined`에서 터져 생성이 실패한다. `runWithFixes`가 돌려준 값을 받는 즉시 `withEmptyFills`를 거치게 하고, 빠진 칸 출력으로 생성 전체를 도는 테스트(`ScriptedAiClient`)를 둔다. 깨지면 이 커밋을 되돌린다.

## 검증

```
pnpm --filter @expresso/backend test
pnpm --filter @expresso/web exec vitest run
pnpm typecheck
pnpm test:infra
```

화면: 키 없이 실제 채우기를 돌릴 수 없어 문구는 단위 테스트와 스트림 이벤트 테스트로 확인한다.
