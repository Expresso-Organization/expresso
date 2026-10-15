---
title: 구조화 생성 내용 정리 단계의 재요청과 연락처 고정
slug: structured-content-retry
stage: spec
status: accepted
intent: .intent/intent_structured-content-retry.md
date: 2026-10-15
---

# 구조화 생성 내용 정리 단계의 재요청과 연락처 고정 — 명세

## 요구사항

- [ ] 내용 정리 호출의 모델 스키마는 `StructuredContentModelSchema`다. 저장 계약 `StructuredPortfolioContentSchema`에서 `contact`를 빼고, `profile.headline`의 한 문장 규칙(`superRefine`)을 뺀 모양이다. 공급자에게 넘기는 JSON Schema에 `contact`가 없다.
- [ ] 모델 출력은 `{ ...출력, contact: null }`로 만든 뒤 도메인 검사를 거친다.
  - 저장 계약 파싱(소개 한 문장 규칙 포함)
  - 이름 보존, 섹션 ID 집합 보존
  - 제공된 근거 ID만 사용, 제공되고 업로드된 이미지만 사용
- [ ] 도메인 검사에 실패하거나 어댑터가 `AI_INVALID_OUTPUT`을 던지면, 한 번 다시 요청한다. 다시 요청할 때는 직전 출력(있으면)과 검사 오류를 원래 입력 뒤에 붙인다. 그 밖의 오류(`AI_UNAVAILABLE`, `AI_TIMEOUT` 등)는 다시 요청하지 않고 그대로 던진다.
- [ ] 두 번째도 실패하면 `PageGenerationError("내용 정리 결과가 계약 검사를 통과하지 못했습니다: {마지막 오류}")`로 끝난다.
- [ ] 받은 호출의 사용량은 모두 `usages`에 넣어 생성 기록 사용량에 합산한다. `AI_INVALID_OUTPUT`으로 실패한 호출은 어댑터가 사용량을 돌려주지 않아 합산하지 못한다(한계로 기록).
- [ ] 시스템 지시문에서 `contact=null` 문장을 뺀다. `PAGE_PROMPT_VERSION`을 9로 올리고 이유를 주석에 적는다.
- [ ] Spec 단계, 렌더링, 저장 계약, 이미 내용이 있는 재생성 경로(`context.structuredContent`)는 그대로다.

## 설계

- **계약 분리.** `packages/contracts/src/structured-portfolio.ts`의 프로필을 둘로 나눈다.
  - `StructuredProfileSchema`: 규칙 없는 모양
  - 저장용: `StructuredProfileSchema.superRefine(한 문장 규칙)`
  - `StructuredPortfolioContentSchema`는 저장용 프로필을 쓴다. 지금과 같은 값을 받고 같은 오류를 낸다.
  - `StructuredContentModelSchema = StructuredPortfolioContentSchema.omit({ contact: true }).extend({ profile: StructuredProfileSchema })`
- **생성기.** `structured-generator.ts`의 내용 정리 부분을 함수 두 개로 나눈다.
  - `normalizedContent(data, input, context)`: 위 도메인 검사를 하고 저장 계약 값을 돌려준다. Zod 오류는 `경로: 메시지` 목록으로 바꿔 모델이 읽게 한다.
  - 재요청 고리: Spec 단계와 같은 형식(`직전 출력` · `검사 오류` · "수정한 전체 결과를 출력하세요")을 쓴다.
- **오류 구분.** `AiError`(`platform/ai/client.ts`)의 `code`로 `AI_INVALID_OUTPUT`만 재요청한다.

## 버린 대안

- **소개 문장을 코드로 잘라 규칙에 맞추기.** 모델이 쓴 문장을 임의로 자르면 뜻이 바뀔 수 있다(intent 범위 밖).
- **`contact`를 모델 스키마에 두고 `null`만 허용하기.** 키를 빠뜨리는 실패가 그대로 남는다. 값이 정해진 필드는 묻지 않는다.
- **어댑터에서 `AI_INVALID_OUTPUT`이 나도 출력을 돌려주게 바꾸기.** 모든 계약의 어댑터 동작이 바뀐다. 규칙을 모델 스키마에서 빼고 도메인 검사로 옮기면 이 단계에서는 출력을 잃지 않는다.

## 함정

- 기존 테스트 "내용 정리에서 이름과 선택한 섹션을 변경하면 중단한다"는 출력 하나로 즉시 실패를 기대한다. 이제 두 번 요청하므로 출력 두 개를 주고, 두 번째도 실패해야 중단되는지 확인하도록 바꾼다.
- `omit`과 `extend`는 객체 수준에 `refine`이 없어야 쓸 수 있다. 규칙은 프로필 필드에만 둔다.
- 체험 서버의 워커는 `pnpm test`가 `dist`를 다시 지으면 재시작한다. 2026-10-15에 graceful termination에서 멈춘 적이 있으니, 확인 전에 워커 상태를 본다.

## 완료 기준

- `pnpm typecheck`, `pnpm test`, `pnpm test:infra integration.test.ts --maxWorkers=2` 통과.
- 새 단위 테스트:
  - 공급자 스키마에 `contact` 없음
  - 소개 규칙 위반 → 두 번째 성공, 사용량 합산
  - `AI_INVALID_OUTPUT` → 재요청
  - `AI_UNAVAILABLE` → 재요청 없음
  - 두 번 실패 → `PageGenerationError`
- 체험 서버에서 디자인 선택 → 생성이 성공하고, 저장된 지면 CSS의 `--sp-bg` · `--sp-ink` · `--sp-accent`가 고른 디자인 시스템의 토큰과 같다.
