---
title: AI 출력 거절 · 재작성 제거
slug: ai-output-no-rewrite
stage: spec
status: accepted
intent: .intent/intent_ai-output-no-rewrite.md
date: 2026-10-27
---

# AI 출력 거절 · 재작성 제거 — 명세

## 요구사항

- [ ] **공급자 형식은 모양만**: `toToolSchema`가 `minLength` · `maxLength` · `minItems` · `maxItems` · `pattern` · `minimum` · `maximum` · `exclusiveMinimum` · `exclusiveMaximum` · `multipleOf` · `format`을 떼고, 그 값을 `description`에 "80자 이하"처럼 적는다. 선택 속성을 필수 + null로 바꾸는 strict 변환(codex용)을 없앤다.
- [ ] **받은 뒤 검사와 고치기**: `ClaudeCodeAiClient.complete`가 호출마다 `--session-id`를 정한다. 출력이 Zod 계약이나 호출의 `check`(업무 규칙)에 걸리면, 같은 세션을 `--resume`해서 걸린 칸 목록(JSON 포인터 경로 · 무엇을 어겼는지 · 지금 값)을 보내고 `{fixes:[{path, value}]}`만 받는다. 경로는 걸린 칸의 열거형이다. 받은 값을 그 경로에 넣고 다시 검사한다. 고치기는 2번까지다.
- [ ] **2번 뒤에도 남으면**: `check` 위반만 남았으면 그 출력을 그대로 돌려주고 `ai.violations_kept` 경고를 남긴다. Zod 계약 위반이 남았으면(저장할 수 없는 모양) 지금처럼 `AI_INVALID_OUTPUT`이다.
- [ ] **바로 보여 주기 · 고친 내용 알림**: `AiCallOptions.onDraft(data)`는 Zod를 통과한 첫 출력을 고치기 전에 준다. `onRevision(fixes)`는 고친 칸이 올 때마다 준다. 사용량은 첫 호출과 고치기 호출을 합친다.
- [ ] **호출 쪽 재요청 루프 제거**: 19개 호출 지점의 "오류를 붙여 전체 다시 요청" 루프를 없애고, 업무 규칙은 `check`로 옮긴다. 출력 형식 안의 지면 예산(설계의 글자 수 · 개수)은 Zod에서 빼고 `check`로 둔다.
- [ ] **지면 화면**: 채우기의 고친 칸은 `fill` 사건에 `revised: true`로 간다. `LivePreview`는 그 칸의 글을 흐렸다가 새 글로 바꾸고 잠깐 강조한다(움직임 줄이기 설정이면 바로 바꾼다).
- [ ] **큐 재실행 중지**: 작업 처리기가 던진 `AI_INVALID_OUTPUT`은 `UnrecoverableError`로 바꿔 BullMQ가 다시 돌리지 않는다(bullmq 6.0.9 제공).
- [ ] **모순 정리**: 질문 생성의 최소 개수 · 프롬프트, 자유 HTML 지면의 빈 CSS, 채우기 headline 길이 단위를 서로 맞춘다.
- [ ] **규칙**: `AGENTS.md` 「지키는 선」에 원칙을 적고, 실제 계약 스키마들을 `toToolSchema`에 넣어 금지 키워드가 하나도 없음을 확인하는 테스트를 둔다.

## 설계

- 검사 · 고치기는 공급자 어댑터 안(`claude-code.ts`)에 둔다. 세션 이어 쓰기가 어댑터의 능력이기 때문이다. 녹화 · 재생(`fixture.ts`)은 최종 결과만 녹화하므로 그대로 둔다.
- 고치기 프롬프트는 짧은 고정 문장 + 위반 목록이다. 출력 스키마는 `z.object({ fixes: z.array(z.object({ path: z.enum(paths), value: z.unknown() })) })`.
- Zod 이슈 경로를 JSON 포인터로 바꾼다. 배열 길이 위반은 배열 경로 하나로 보고, 값 전체(새 배열)를 받는다.
- 구성 Spec의 구조 검사(`validateStructuredPortfolio`)는 오류에 경로가 없어 `/elements` 하나로 보고한다.
- 지면 채우기의 고친 칸 경로는 기존 `contentPath`로 지면 경로로 바꿔 `sink.fill`에 보낸다.

## 버린 대안

- 코드가 자르고 버려서 맞추기: 사용자가 쓴 에이전트가 고치는 방식을 골랐다(2026-10-27).
- 새 호출에 직전 출력을 붙여 고치기: 입력 자료를 다시 보내야 하고 맥락이 끊긴다. 세션 이어 쓰기를 실측으로 확인했다(haiku, 한 문장 고치기 8.2초).

## 함정

- `--resume`은 같은 cwd에서 찾는다. 어댑터 인스턴스의 cwd는 고정이다.
- 고치기 호출에도 `--model` · `--append-system-prompt` · `--setting-sources` · `--effort`를 같게 준다.
- 모델이 경로를 다르게 적으면 열거형이 막는다. 값의 모양은 다시 검사로 본다.

## 완료 기준

- 체험 서버 지면 생성 워커 로그에 `ai.structured_output_rejected`가 없다.
- 각 호출 지점 테스트: 위반 출력 → 고치기 요청 1회 → 결과. 남은 `check` 위반은 그대로 돌려준다.
- `pnpm typecheck` · `REQUIRE_BROWSER=1 pnpm test` · `pnpm test:infra`.
