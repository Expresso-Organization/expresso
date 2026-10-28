---
title: 지면 생성의 AI 출력 고치기 실패로 생성이 멈추는 문제
slug: page-ai-output-recovery
stage: plan
status: accepted
intent: .intent/intent_page-ai-output-recovery.md
spec: .intent/spec_page-ai-output-recovery.md
date: 2026-10-28
---

# 지면 생성의 AI 출력 고치기 실패로 생성이 멈추는 문제 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/backend/src/platform/ai/fixes.ts` | 칸 고치기 회차의 답 읽기 실패를 회차 넘김으로, 적용 안 된 문법 고치기 기록 |
| `services/backend/src/platform/ai/fixes.test.ts` | 읽을 수 없는 고친 답 테스트 |
| `services/backend/src/modules/page/design-first.ts` | `checkSpec` 인자, `resolvePlan` 추출, 설계 `check`에 구조 위반 |
| `services/backend/src/modules/page/structured-generator.ts` | `#designFirstPage`가 `checkSpec` 전달 |
| `services/backend/src/modules/page/design-first.test.ts` | 연결이 끊긴 설계 Spec 테스트 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. `fixes.ts` · `fixes.test.ts` — 가짜 CLI로 "업무 규칙 위반 → 고친 답 `{"fixes":[...]`(닫는 괄호 빠짐) → 문법 고치기 적용 안 됨" 순서를 재현. 오류 없이 첫 출력이 돌아오는지 확인.
2. `design-first.ts` — `resolvePlan`을 빼고 `checkSpec`을 설계 `check`에 잇기. 기존 `design-first.test.ts` 통과 확인.
3. `structured-generator.ts` — `checkSpec` 전달. 새 테스트: 설계 Spec에서 경력 · 근거를 트리에 잇지 않고, 고치기에서 이어 주면 생성이 끝나는지.
4. 전체 검사 — `pnpm typecheck` · `pnpm test` · `pnpm test:infra`.
5. 체험 서버 실제 생성 한 번 — 워커(`AI_PROVIDER=claude-code`)로 생성하고 로그의 `ai.*` 이벤트와 결과를 보고.
6. 커밋 · 푸시 · PR.

## 가장 위험한 단계

2–3단계입니다. 설계 `check`가 늘어 정상 설계에도 구조 위반이 걸리면 고치기 회차와 비용이 늘어납니다. 청사진이 이미 같은 조합으로 그려지고 있으므로, 기존 설계 먼저 테스트 전부가 고치기 없이 통과하는지(`page_design` 고치기 요청 0건)로 확인합니다. 깨지면 `checkSpec` 전달 한 줄을 되돌리면 이전 동작입니다.

## 검증

```
pnpm --filter @expresso/backend exec vitest run src/platform/ai/fixes.test.ts src/modules/page
pnpm typecheck
pnpm test
pnpm test:infra
```
