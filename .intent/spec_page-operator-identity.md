---
title: 포트폴리오 지면 서버 운영 계정 정보 노출 차단
slug: page-operator-identity
stage: spec
status: draft
intent: .intent/intent_page-operator-identity.md
date: 2026-11-14
---

# 포트폴리오 지면 서버 운영 계정 정보 노출 차단 — 명세

## 요구사항

- [ ] `buildPrompt`(자유 지면)가 `context.author.name`을 작성자 이름으로 싣고, 연락처를 받지 않았으니 이메일 · 전화 · 개인 링크 줄을 두지 않는다고 적는다.
- [ ] `AiPageGenerator.generate`의 `check`가 화면 글자와 `mailto:`의 이메일 가운데 근거(`evidence` 원문)에 없는 것을 `/html` 위반으로 낸다. 문제 문장은 주소를 들고 "그 이메일이 든 줄(이름표와 값)을 지운다"를 담는다.
- [ ] `ClaudeCodeClient` spawn 환경에 `CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS=1`을 둔다.
- [ ] 에이전트 런타임(`platform/agent/runtime.ts`)의 구독 경로(API 키 없음)도 같은 환경 변수를 받는다. `SYSTEM_PROMPT`에 컨텍스트의 이메일은 서버 운영 계정이라는 한 줄을 둔다.

## 설계

- 재사용: 기존 `check` → `runWithFixes`(같은 대화, 걸린 경로만) 경로. `markupProblem`과 같은 자리에서 위반을 합친다.
- 이메일 추출은 `platform/numbers.ts`의 `IDENTIFIERS`와 같은 모양의 정규식을 쓴다. 그 파일은 숫자 검사에서 이메일을 빼는 용도라 그대로 두고, `generator.ts`에 `ungroundedEmails(html, source)`를 둔다. 대소문자는 무시하고 비교한다.
- 근거 집합은 `context.evidence`의 원문이다. 작성자 이름은 이메일이 아니므로 근거에 넣지 않는다.
- 프롬프트는 「## 누구의 지면」 절을 「어디에 내는가」 앞에 둔다. 이름이 없으면 절을 빼지 않고 "이름을 받지 않았다 — 이름 줄을 두지 않는다"로 적는다.
- `PAGE_PROMPT_VERSION`을 올린다(15 → 16). 프롬프트가 바뀌었다.

## 버린 대안

- 서버에서 그 줄을 정규식으로 지우기: AI 출력을 서버가 고쳐 쓰면 지면 구조가 깨질 수 있다. 같은 대화에서 고쳐 받는 기존 방식을 따른다.
- `--system-prompt` 교체: 이메일 줄이 남는다(실측). 캐시도 깬다.
- 이름 불일치 검사: 지면에는 회사 · 팀 · 동료 이름이 정당하게 나온다. git 이름은 환경 변수로 원천에서 빠진다.

## 함정

- `check`의 `/html` 위반은 지면 전체를 다시 내게 한다. 프롬프트 수정으로 드물게만 걸려야 한다.
- 근거 기록에 사용자가 직접 적은 이메일은 정당하다. 근거에 있으면 통과시킨다.
- spawn env는 `process.env`를 펼친 뒤 덮어야 한다. 순서가 바뀌면 운영 `.env`가 값을 덮는다.

## 완료 기준

- `pnpm --filter @expresso/backend test` 통과. 새 테스트: 프롬프트의 작성자 절, 남의 이메일 위반, 근거에 있는 이메일 통과, spawn env.
- `pnpm typecheck` 통과.
- 서버에서 `CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS=1`로 물으면 「Git user」가 없다(실측 완료, 2.1.272).
