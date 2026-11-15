---
title: 자유 생성 파이프라인 실험 — 정제된 컨텍스트와 디자인 스킬
slug: free-generation-lab
stage: spec
status: accepted
intent: .intent/intent_free-generation-lab.md
date: 2026-11-15
---

# 자유 생성 파이프라인 실험 — 명세

## 요구사항

- [ ] 새 생성기는 `PageGenerator`를 구현하고, 정제(`refine`)와 디자인 스킬(`designSkill`)을 따로 켜고 끌 수 있다. 지면 키트는 쓰지 않는다. 둘 다 끄면 키트를 끈 `AiPageGenerator`와 같은 시스템 프롬프트 · 같은 요청 프롬프트를 보낸다(테스트로 글자까지 비교).
- [ ] 정제 호출의 출력은 자료의 모든 섹션을 한 번씩 담고, 수치 · 이전 값 · 기간의 숫자가 출처에 있다. 어긴 칸은 같은 대화에서 그 칸만 고쳐 받는다(`AiCallOptions.check`). 호출하는 쪽에 재요청 루프를 두지 않는다.
- [ ] 스킬을 켠 호출은 스킬 본문 뒤에 지면 정책(`pagePolicyPrompt`)을 두고, 출력은 `plan`(색 · 서체 · 배치 · 한 가지 기억될 것)을 `html`보다 먼저 적는다.
- [ ] `AiPageGenerator` · `StructuredPageGenerator` · `FormatRoutingPageGenerator`의 동작은 바뀌지 않는다. `generator.ts`는 기존 함수를 내보내기만 한다.
- [ ] 실험 실행은 조건 · 입력 · 반복 번호마다 결과를 한 번만 만들고, 저장된 결과는 덮어쓰지 않는다. 요청 프롬프트 · 응답 · 사용량을 실행 폴더에 남긴다.
- [ ] 측정은 모든 지면을 390 · 1440px에서 열어 가로 넘침 · 깨진 이미지 · 이름 · 경력 조직 · 근거 제목 유무 · 소독기가 지운 것 · 출처에 없는 수치를 기록한다.
- [ ] 커밋하는 결과물에 서버 운영 계정 이메일 · 이름과 실제 사용자 기록이 없다.

## 설계

**재사용**

- `AiPageGenerator`의 요청 조립(`buildPrompt`) · 시스템 프롬프트(`SYSTEM`) · 마크업 검사(`markupProblem`) · 이메일 검사(`ungroundedEmails`) · QA(`pageQa`) · 소독(`sanitizePage`). 지금은 파일 안에만 있어 내보낸다.
- 수치 검사 `metricValueAllowed` · `metricBeforeGrounded` · `metricUnitsAgree`(`design-first.ts`)와 `ungroundedNumbers`(`platform/numbers.ts`).
- `ClaudeCodeAiClient`를 제품과 같은 옵션으로 쓴다(도구 끔 · 빈 작업 폴더 · `--setting-sources project`). 세션 저장을 끄지 않는다 — 고치기가 `--resume`을 쓴다.
- 입력은 `PageService.generate`에 문맥만 받아 두고 예외를 던지는 생성기를 넘겨 얻는다(`structured.mongo.integration.test.ts` 248–270행과 같은 방식). 지면은 저장되지 않는다.
- 구조화 기준 지면은 `StructuredPageGenerator`를 같은 문맥으로 부른다.

**새로 만드는 것**

- `page/page-brief.ts` — 정제. 계약은 `page_fill`(Sonnet)을 빌린다. 새 계약 이름을 넣으면 동의 · 사용량 · DB 제약 표까지 바뀌므로 실험에서는 넣지 않는다.
  - 출력: `role` · `headline` · `intro` · `focus[]` · `subject`(이 사람이 다루는 대상 · 도구 · 산출물) · `lead[]`(첫 화면에 세울 만한 것) · `sections[]{id, title, claim, body, period?, metrics[], steps[], quote?, details[], media[]}` · `career[]` · `evidence[]{id, title, kind, summary}`.
  - `briefPrompt(brief, context)`가 정리본을 읽는 글로 펴서 지면 호출의 요청에 넣는다. 원문 근거와 설계안 JSON은 넣지 않는다.
- `page/briefed-generator.ts` — `BriefedPageGenerator`. 옵션 `{ refine, designSkill, brief? }`. 이미 만든 정리본을 받으면 다시 정제하지 않는다(조건 ②와 ④가 같은 정리본을 쓴다).
  - 스킬을 켜면 시스템 = `SYSTEM` + 역할 구분 문단 + 스킬 본문 + 지면 정책. 역할 구분: 색 · 서체 · 밀도 · 골격은 스타일 문법이 정하고, 스킬은 첫 화면 · 배치 · 글자 다루기 · 구조 장치를 맡는다.
- `scripts/library/renderer/free-lab/` — `capture.ts`(입력 만들기) · `run.ts`(조건 실행) · `measure.mjs`(스크린샷 · 측정) · `sheet.mjs`(비교 화면).

**실험 구성**

- 입력: 가상 인물 세 명. 윤하린(프론트엔드, 기존 레시피) · 문가령(데이터 분석) · 배준호(ML 리서치). 뒤의 둘은 DB 복사본에서 자유 입력 브루와 `AiRecipePlanner` 레시피를 새로 만든다.
- 디자인 시스템은 Clarity 한 판으로 고정한다. 「둘 다」만 윤하린 입력으로 Linear Midnight · Editorial 판을 더 만든다.
- 조건: 기준(제품의 자유 생성 그대로 — 디자인 시스템을 고른 문맥은 `useKit: true`라 키트 부품으로 조판) · 키트 없이 자유 · 정제 · 스킬 · 둘 다. 뒤의 넷이 2×2이고 모두 키트를 쓰지 않는다. 반복: 윤하린의 「키트 없이 자유」와 「둘 다」를 한 번씩 더.
- 지면 문서는 키트로 조판한 조건(기준 · 구조화)에만 키트 CSS를 싣는다.
- 모델 등급: 지면 호출은 Sonnet(`modelTier: "sonnet"`, 제품과 같음).

## 버린 대안

- `StructuredPortfolioContent` 계약을 정리본으로 재사용 — 섹션을 제목 · 요약 · 본문 · 항목표로 미리 나누면 구조화 지면과 같은 문서 골격이 다시 나온다.
- 스킬을 CLI의 Skill 도구로 불러 쓰기 — 제품 호출은 도구를 모두 끄고 빈 폴더에서 돈다. 본문을 프롬프트에 넣는 쪽이 결과가 같고 호출이 한 번이다.
- 가상 프로필 `content.json` 세 개를 입력으로 — 이미 정리된 자료라 원문 대 정리본 비교가 성립하지 않고 수치가 없다.
- 생성 중 브라우저 측정 뒤 고치기 — 세 번째 변수라 이번 비교에서 뺐다.

## 함정

- CLI가 로그인 계정 이메일을 문맥에 싣는다. 결과물을 커밋하기 전에 운영 계정 이메일 · 이름을 찾는다.
- `frontend-design`의 "과감한 방향"은 "스타일 문법이 먼저다"와 부딪힌다. 역할 구분 문단이 없으면 사용자가 고른 색을 버릴 수 있다.
- 스킬은 모션 · 인터랙션을 권한다. 지면은 `<script>`를 실을 수 없다. 소독기는 허용하지 않는 태그를 지우면서 `removed`에 남기지 않으므로(속성 · 주소만 남김) 모델이 쓴 `script` · `iframe` · `form` 수를 `blockedTags`로 따로 세고, 0이 아니면 실패로 기록한다.
- `inspectRenderedPage`는 키트 선택자(`.xp-inner`)에 묶여 있어 자유 지면에는 가로 넘침 · 깨진 이미지 · 글자만 쓸 수 있다. 측정 스크립트는 따로 쓴다.
- 공유 체험 DB에 쓰지 않는다. `expresso_dummy_accounts_trial`을 `expresso_free_lab`으로 복사해 마이그레이션한 뒤 쓴다.
- 이 셸은 `AI_PROVIDER=claude-code`를 내보낸다. 실험 스크립트는 공급자를 코드에서 직접 만든다.

## 완료 기준

- `pnpm typecheck` · `pnpm test` 통과.
- `docs/library/previews/portfolio/runs/free-lab-2026-11-15/index.html`을 열면 인물 × 조건 격자에 스크린샷이 보이고 각 칸이 지면 HTML로 이어진다.
- `docs/architecture/portfolio-free-generation-lab.md`에 조건별 측정 표, 눈가림 평가 결과, 다음 결정이 있다.
