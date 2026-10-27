---
title: AI 출력 거절 · 재작성 경로 전면 제거
slug: ai-output-no-cli-rewrite
stage: plan
status: accepted
intent: .intent/intent_ai-output-no-cli-rewrite.md
spec: .intent/spec_ai-output-no-cli-rewrite.md
date: 2026-10-27
---

# AI 출력 거절 · 재작성 경로 전면 제거 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/backend/src/platform/ai/fixes.ts` | 글 읽기 · 문법 수정 · 이어 쓰기, 진전 기준 고치기 |
| `services/backend/src/platform/ai/claude-code.ts` | `--json-schema` 제거, `--tools ""`, 출력 형식 프롬프트, 멈춘 시간 상한, `text_delta` 부분 출력 |
| `services/backend/src/platform/ai/scripted-client.ts` | 고치기 요청 경로 파싱 갱신 |
| `services/backend/src/platform/ai/fixes.test.ts` | 가짜 CLI를 글 출력으로, 문법 수정 · 이어 쓰기 · 멈춘 시간 · `--json-schema` 없음 |
| `services/backend/src/modules/{interview,recipe,generation,page}/service.ts` · 각 `legacy-mysql-service.ts` · `analytics/legacy-mysql-service.ts` | AI 호출 시간 상한 제거 |
| `services/backend/src/modules/page/generator.ts` | `has-markup`을 `check`로 |
| `services/backend/src/modules/page/structured-generator.ts` | 옛 경로 대체 제거(실측에서 찾음) |
| 고치기 횟수에 기대던 테스트(`record-cleaner.test.ts` 등) | 진전 기준에 맞게 |
| `AGENTS.md` | 「지키는 선」 규칙 갱신 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. `fixes.ts` 읽기 · 수정 루프와 단위 테스트(가짜 CLI): 깨진 JSON이 한 번에 고쳐지는지, 끊긴 출력이 이어지는지, 진전이 없으면 멈추는지 본다.
2. `claude-code.ts` 인자 · 부분 출력 · 멈춘 시간 상한 — 가짜 CLI가 계속 출력하면 상한을 넘겨도 끝까지 받는지 본다. 출력이 멈추면 끊기는지 본다.
3. 서비스 시간 상한 제거와 HTML `check` — `pnpm --filter @expresso/backend typecheck`.
4. 백엔드 전체 테스트와 `pnpm test:infra`.
5. 체험 서버 워커를 다시 띄우고 구성 생성 · 지면 생성 한 번씩. 로그와 출력 토큰을 본다.
6. AGENTS.md · 메모리 규칙 갱신.

## 가장 위험한 단계

5번. `--json-schema`가 주던 모양 안내를 프롬프트 글로 옮기면 모델이 칸 이름 · 값 종류를 더 자주 틀릴 수 있다. 틀린 칸은 같은 세션에서 고친다. 그만큼 고치기 호출이 늘어난다. 실측에서 고치기 횟수와 시간을 이전 실측(구성 191초, 지면 설계 61초)과 비교한다. 크게 늘면 형식 절의 설명을 보강한다.

## 검증

```
pnpm typecheck
pnpm test
pnpm test:infra
```

체험 서버: 새 브루에서 구성 → 생성까지 한 번. 워커 로그에서 `structured_output_rejected` · `ai.fix_round` · `ai.syntax_fix`를 센다.
