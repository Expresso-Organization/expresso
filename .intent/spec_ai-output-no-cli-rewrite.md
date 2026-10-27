---
title: AI 출력 거절 · 재작성 경로 전면 제거
slug: ai-output-no-cli-rewrite
stage: spec
status: accepted
intent: .intent/intent_ai-output-no-cli-rewrite.md
date: 2026-10-27
---

# AI 출력 거절 · 재작성 경로 전면 제거 — 명세

## 전수 조사 결과

| 경로 | 자리 | 처리 |
|---|---|---|
| CLI `StructuredOutput` 검증(문법 · 모양) | `ClaudeCodeAiClient.#call`의 `--json-schema` | 없앤다 |
| 고치기 호출의 CLI 검증 | 같은 자리(`toToolSchema(fixes)`) | 없앤다 |
| CLI 전체 시간 상한 | `#run`의 `setTimeout(this.#timeoutMs)` → `AI_TIMEOUT`(retryable) → 큐 재시도 | 멈춘 시간 기준으로 바꾼다 |
| 서비스 시간 상한 | `withTimeout(…, 420_000 · 900_000)` — interview · recipe · generation · page와 각 legacy | AI 호출에서 걷어낸다 |
| 고치기 두 번 상한 | `fixes.ts`의 `AI_FIX_ROUNDS` | 줄어드는 동안 계속한다 |
| 자유 HTML `has-markup` | `page/generator.ts`의 `pageQa` → `failed_qa` → 생성 실패 | 호출의 `check`로 옮긴다 |
| 설계가 먼저 오는 생성의 옛 경로 대체(구현 뒤 실측에서 찾음) | `structured-generator.ts`의 `design_first_failed` → 내용 정리 → 구성 | 대체를 없앤다 |

거절 · 재작성이 아닌 것: 디자인 토큰 QA(`designQa`, 모델 출력을 보지 않음), 다듬기의 판 비교(제품 선택), 사용자의 다시 뽑기, DB 중복 키 재시도, 근거 없는 수치 칸 빼기(다시 쓰지 않음). 내용 기반 모델 대체는 `-p` 모드에서 거절로 끝난다. 가용성 대체는 `--fallback-model` 없이는 일어나지 않는다(code.claude.com model-config).

## 요구사항

- [ ] 어댑터는 `--json-schema`를 넘기지 않는다. `--tools ""`로 내장 도구를 모두 끈다(`claude --help` 2.1.274). 모델은 마지막 글에 JSON 하나를 쓴다.
- [ ] 출력 모양은 프롬프트 끝의 "출력 형식" 절에 JSON Schema로 싣는다(`toToolSchema` 그대로, 설명 문장 포함).
- [ ] 받은 글에서 첫 `{` 또는 `[`부터 짝이 맞는 끝까지를 JSON으로 읽는다. 코드 블록 표시와 앞뒤 설명 글은 읽지 않는다.
- [ ] JSON 문법이 깨지면 같은 세션(`--resume`)에 깨진 위치와 앞뒤 글을 보내고, `{"edits":[{"find","replace"}]}`로 그 조각만 고쳐 받는다. `find`가 원문에 정확히 한 번 있을 때만 바꾼다.
- [ ] 글이 중간에 끊겼으면(문법 오류 위치가 글 끝) 같은 세션에 "끊긴 곳 다음부터 끝까지"를 요청하고 받은 글을 그대로 잇는다.
- [ ] 문법 수정은 오류 위치가 앞으로 가는 동안 계속한다.
- [ ] 칸 고치기는 걸린 경로 수가 줄면 계속한다. 줄지 않아도 직전 고치기가 출력을 바꿨으면, 고치기에 쓴 시간의 합이 첫 호출 시간보다 짧은 동안 계속한다. 그보다 오래 고치면 처음부터 다시 쓰는 것보다 비싸다.
- [ ] 설계가 먼저 오는 생성이 실패해도 옛 경로로 넘어가지 않는다.
- [ ] 멈춘 뒤 계약 위반이 남으면 지금처럼 `AI_INVALID_OUTPUT`(retryable false)이다.
- [ ] 멈춘 뒤 `check` 위반만 남으면 출력을 그대로 돌려준다.
- [ ] CLI 시간 상한은 마지막 출력 뒤 `AI_TIMEOUT_MS` 동안 아무 출력이 없을 때만 끊는다. 이를 위해 `--include-partial-messages`를 늘 켠다.
- [ ] AI 호출을 감싼 서비스 시간 상한을 걷어낸다. 브라우저 렌더처럼 AI가 아닌 단계에 걸린 상한은 그 단계에만 남긴다.
- [ ] 부분 출력(`onPartial`)은 `text_delta`에서 받는다. 첫 `{` · `[` 앞 글은 흘리지 않는다.
- [ ] 자유 HTML 생성은 태그가 없는 지면을 `check` 위반(`/html`)으로 같은 세션에서 고쳐 받는다.

## 설계

- `fixes.ts`의 `runWithFixes`가 `first` · `fix`에서 `{ text, usage }` 또는 `{ output, usage }`를 받는다. `text`면 `readJson(text, repair)`로 읽는다. `ScriptedAiClient`는 지금처럼 `output`을 준다.
- `readJson`과 프롬프트 조립(`outputFormatPrompt`, `syntaxFixPrompt`, `continuePrompt`)은 `fixes.ts`에 둔다. 고치기 응답(`fixes` · `edits`)도 같은 `readJson`으로 읽는다.
- `claude-code.ts`: `#call`이 `result` 글을 돌려준다. `rejectedStructuredOutputs`와 `StructuredOutput` 블록 처리는 지운다. `partialSink`는 `text` 블록의 `text_delta`를 읽는다.
- AGENTS.md 「지키는 선」의 규칙을 "CLI에 출력 검증을 맡기지 않는다"로 고친다. `fixes.test.ts`가 가짜 CLI 인자에 `--json-schema`가 없음을 확인한다.

## 버린 대안

- `--json-schema`를 두고 CLI 재시도를 끄는 방법: 끄는 옵션이 문서에 없다.
- 거절 신호를 보면 CLI를 끊고 받은 조각을 고치는 방법: 끊기 전에 이미 재작성이 시작된다. 고치기 호출에도 같은 검증이 다시 걸린다.
- 깨진 JSON을 코드가 고치는 방법(jsonrepair 등): 쓴 에이전트가 고친다는 결정(2026-10-27)과 어긋난다.

## 함정

- 도구가 없어도 모델이 JSON 앞에 설명 글을 붙일 수 있다. 읽는 쪽이 첫 `{`부터 읽는다.
- `--resume`한 세션은 직전 글을 기억하므로, 고치기 프롬프트에 전체 출력을 다시 싣지 않는다.
- 멈춘 시간 상한은 생각 단계에도 신호가 와야 한다. `thinking` 이벤트와 `thinking_delta`가 오는지 실측으로 확인한다.

## 완료 기준

- `pnpm typecheck`, `pnpm test`, `pnpm test:infra` 통과.
- 체험 서버에서 구성 생성 · 지면 생성을 한 번씩 돌린다. 워커 로그에 `structured_output_rejected`가 없는지 본다. 구성 출력 토큰이 한 번 쓴 분량인지 본다.
