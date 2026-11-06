---
title: AI 출력 끝 닫는 괄호 누락 시 생성 실패 수정
slug: ai-output-closing-bracket
stage: spec
status: accepted
intent: .intent/intent_ai-output-closing-bracket.md
date: 2026-10-28
---

# AI 출력 끝 닫는 괄호 누락 시 생성 실패 수정 — 명세

## 요구사항

- [ ] `closeOpenBrackets(text)`는 다음 조건을 모두 만족할 때만 빠진 닫는 괄호를 열린 순서의 반대로 붙인 글과 붙인 괄호(`{ text, added }`)를 돌려줍니다. 하나라도 어기면 null입니다.
  - JSON 시작(첫 `{` · `[`)부터 끝까지 읽었을 때 문자열 밖에서 끝납니다. 끝의 코드 블록 표시(```)는 빼고 봅니다.
  - 열린 괄호가 남아 있습니다.
  - 마지막 의미 있는 글자가 값의 끝(`}` · `]` · `"` · 숫자 · `true` · `false` · `null`의 끝 글자)입니다. `,` · `:`로 끝나면 뒤에 올 값이 빠진 것입니다.
- [ ] `runWithFixes`의 `read`에서 글 끝에서 막혔고(`truncated`) 종료 이유가 `max_tokens`가 아니면, 모델에게 묻기 전에 `closeOpenBrackets`를 시도합니다. 닫은 글이 읽히면 그 값을 쓰고 `ai.syntax_closed` 로그(붙인 글자 · 위치)를 남깁니다.
- [ ] 닫아도 읽히지 않으면 지금처럼 `syntaxFixPrompt`로 끝부분 조각을 고쳐 받습니다.
- [ ] 문법 고침이 하나도 적용되지 않으면(`applied: 0`) `ai.syntax_fix` 로그에 모델 답 앞부분(`reply`)을 남깁니다.
- [ ] `max_tokens`로 끊긴 답은 지금처럼 이어 쓰기(`continuePrompt`)를 받습니다.

## 설계

- `services/backend/src/platform/ai/fixes.ts`
  - `readJsonText` 옆에 `closeOpenBrackets`를 둡니다. 문자열 · 이스케이프 상태와 괄호 스택을 한 번 훑습니다.
  - `read` 루프의 `truncated` 분기에서 `max_tokens`가 아닐 때 먼저 부릅니다.
- 재사용: `readJsonText`(JSON 범위 · 오류 위치), `around` 로그 형식, 진전 기준(`lastAt`).
- 붙이는 괄호 개수에는 상한을 두지 않습니다. 닫은 값은 계약(Zod)과 `check`를 지나므로, 빠진 칸이 있으면 그 검사에 걸려 같은 대화에서 고쳐 받습니다.

## 버린 대안

- 끝부분 고침 요청의 문장을 바꿔 모델이 붙일 조각을 더 잘 쓰게 하기: 고침은 `find`가 원문에 한 번만 있어야 적용됩니다. 끝에 붙이는 일에는 맞지 않고, 모델 한 번을 더 부릅니다.
- `find`가 비어 있으면 끝에 붙이는 "덧붙이기" 고침 추가: 모델 응답에 기대는 점은 같습니다.

## 함정

- 최근 커밋(3f1bd5df)이 "다 썼는데 끝에서 막혔으면 끝부분 조각을 고쳐 받는다"로 정했습니다. 그 테스트(`fixes.test.ts`)는 닫는 괄호 하나 빠진 경우를 예로 듭니다. 이 경우는 이제 서버가 닫으므로 테스트를 둘로 나눕니다.
  - 괄호만 빠진 경우: 모델 호출 없이 읽힙니다.
  - 문자열 안에서 끝난 경우: 지금처럼 고쳐 받습니다.
- `readJsonText`는 마지막 `}` · `]`까지만 읽습니다. 닫은 글은 끝이 괄호라 그대로 맞습니다.

## 완료 기준

- `pnpm --filter @expresso/backend test`가 통과하고, 새 테스트 세 개가 들어 있습니다(괄호만 빠짐 · 문자열 안에서 끝남 · 쉼표로 끝남).
- `pnpm typecheck` · `pnpm test`가 통과합니다.
