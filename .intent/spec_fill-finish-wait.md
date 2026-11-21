---
title: 채우기 마무리 구간 단축 · 진행 문구
slug: fill-finish-wait
stage: spec
status: accepted
intent: .intent/intent_fill-finish-wait.md
date: 2026-11-10
---

# 채우기 마무리 구간 단축 · 진행 문구 — 명세

## 요구사항

- [ ] `sectionFillSchema()`의 `summary` · `body` · `details` · `metrics` · `quote` · `steps`가 빠져도 계약을 통과한다. `title`은 그대로 필수다.
- [ ] `fillViolations()`는 빠진 칸 가운데 예산(`budget.summary` · `body` · `details` · `metrics` · `quote ?? 0` · `steps ?? 0`)이 0보다 큰 칸만 위반으로 낸다. 다른 업무 규칙 위반과 같은 호출에서 낸다.
- [ ] `runWithFixes`가 끝난 뒤 빠진 칸을 `""` · `[]`로 채운 출력(`withEmptyFills`)을 아래 단계(섹션 조립 · `StructuredPortfolioContentSchema.parse`)가 쓴다.
- [ ] 예산 0 칸을 빼먹고 본문 예산을 넘긴 첫 출력에서 고치기 호출이 1번이다.
- [ ] `PAGE_STREAM_STAGES`에 `drafted`를 더한다. 채우기 출력이 처음 계약을 통과하면(`onDraft`) 서버가 `drafted` 단계를 보낸다.
- [ ] `LivePreview`의 `PHASE_LABELS`에 `drafted: "쓴 내용을 기준과 맞춰 보는 중"`을 더한다. 모든 단계에 문구가 있다(테스트).
- [ ] `LivePreview`는 고친 칸(`revised`)이 화면 밖이면 사람이 지면을 움직이지 않은 동안 그 자리로 옮긴다.
- [ ] `ai.fix_round` 로그에 `kind: "contract" | "check"`를 더한다.

## 설계

- 재사용: 단계 이벤트 통로(`PageStreamSink.stage` → `stream.stage` → SSE `stage` → `LivePreview`)를 그대로 쓴다. `designed`가 이미 이 길로 간다. 칸 옮기기는 `follow()`를 그대로 쓴다.
- `design-first.ts`: `DesignFirstHooks`에 `drafted?: () => void`, 채우기 `call()`의 `extra`에 `onDraft`를 받아 `AiCallOptions`로 넘긴다. `check`는 원래 출력(빠진 칸 그대로)을 보고, 빠진 칸 검사 뒤 `withEmptyFills`로 채운 값에 기존 검사를 돌린다.
- `structured-generator.ts`: `drafted: () => sink.stage?.("drafted")`.
- `LivePreview`의 `stage` 처리기는 `designed`가 아닌 모든 단계에서 남은 칸을 `done`으로 바꾼다. `drafted`에서도 그렇게 된다 — 이때 글은 다 흘렀으므로 맞는 동작이다.

## 버린 대안

- `z.string().default("")`: 빠진 칸과 일부러 비운 칸을 구별하지 못해 예산 있는 칸이 빠져도 묻지 못한다.
- 계약 위반이 있어도 업무 규칙 검사를 함께 돌리기(`fixes.ts` 공용 변경): 계약을 못 지난 값에 검사를 돌리는 길을 모든 AI 호출에 연다. 이번 원인은 빠진 칸 하나로 좁혀져 있다.
- 첫 호출이 끝나는 순간 단계 보내기: 공급자 어댑터에 새 갈고리가 필요하다. `onDraft`는 이미 있다.

## 함정

- 계약이 다른 이유(`title` 빈 글 등)로 걸리면 `onDraft`가 그 라운드 뒤에 불려 그동안 문구가 "채우는 중"에 머문다.
- 계약을 바꾸면 웹 · 백엔드가 `dist`를 다시 지어야 테스트가 새 값을 본다.
- 예전 웹(캐시된 화면)은 `drafted`를 모르는 단계로 보고 버린다(`safeParse` 실패 → 무시). 깨지지 않는다.

## 완료 기준

- `pnpm --filter @expresso/backend test`, `pnpm --filter @expresso/web exec vitest run`, `pnpm typecheck`, `pnpm test:infra` 통과.
