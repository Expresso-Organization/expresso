---
title: AI 출력 끝 닫는 괄호 누락 시 생성 실패 수정
slug: ai-output-closing-bracket
stage: plan
status: accepted
intent: .intent/intent_ai-output-closing-bracket.md
spec: .intent/spec_ai-output-closing-bracket.md
date: 2026-10-28
---

# AI 출력 끝 닫는 괄호 누락 시 생성 실패 수정 — 구현 계획

브랜치: `fix/ai-output-closing-bracket` (origin/main에서).

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/backend/src/platform/ai/fixes.ts` | `closeOpenBrackets` 추가, `read` 루프의 끝 막힘 분기에서 먼저 시도, 적용 0건 고침의 답 기록 |
| `services/backend/src/platform/ai/fixes.test.ts` | 끝 괄호 테스트를 괄호만 빠짐 · 문자열 안 끝남 · 쉼표 끝남으로 나눔 |

## 작업 순서

1. 테스트 먼저: 괄호만 빠진 답이 추가 호출 없이 읽히는 테스트를 씁니다. 실패하는지 확인합니다.
2. `closeOpenBrackets`와 `read` 분기를 구현합니다. 새 테스트와 기존 끝 막힘 · 이어 쓰기 테스트가 통과합니다.
3. 적용 0건 로그를 더합니다.
4. `pnpm typecheck` · `pnpm test`를 돌린 뒤 커밋 · 푸시 · PR을 엽니다.

## 가장 위험한 단계

2단계입니다. 모델이 일찍 멈춰 내용이 덜 온 답을 괄호만 닫아 받아들일 수 있습니다. 닫은 값은 계약과 `check`를 지나므로 빠진 필수 칸은 그 검사에 걸립니다. 그래도 문제가 되면 이 커밋 하나를 되돌리면 지금 동작으로 돌아갑니다.

## 검증

```bash
pnpm --filter @expresso/backend exec vitest run src/platform/ai/fixes.test.ts
pnpm typecheck
pnpm test
```
