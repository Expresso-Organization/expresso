---
title: 구조화 Spec 생성의 재시도 대상 분리와 프롬프트 형식 설명 단일화
slug: spec-retry-prompt
stage: spec
status: accepted
intent: .intent/intent_spec-retry-prompt.md
date: 2026-10-13
---

# 구조화 Spec 생성의 재시도 대상 분리와 프롬프트 형식 설명 단일화 — 명세

## 요구사항

- [ ] Spec 검사(`validateStructuredPortfolio`, 수집 원본 역할 검사 `validateLibrarySelection`, 사용자 스타일 보존 검사)에 실패하면 오류를 붙여 한 번 다시 요청한다. 두 번 다 실패하면 지금과 같은 `구성 계약 검사를 통과하지 못했습니다: …`로 끝난다.
- [ ] 검사를 통과한 Spec의 렌더링에서 예외가 나면 모델을 다시 부르지 않는다. `PageRenderError`(`PageGenerationError`의 하위 클래스)로 끝나고, 메시지는 `지면 렌더링에 실패했습니다: …`로 시작한다.
- [ ] 렌더러는 렌더링 예외와 크기 초과를 `StructuredRenderError`(`code: "RENDER_FAILED" | "PAGE_TOO_LARGE"`)로 던진다. 기존 메시지 문구("저장 크기 제한")는 유지한다.
- [ ] 프롬프트의 요소 ID 목록과 요소별 `type`·`props`·`children` 형태 설명을 모델에 넘기는 출력 스키마 객체에서 생성한다. 같은 스키마 객체를 `ai.complete`에도 넘긴다.
- [ ] 컨테이너 자식 수·variant 규칙 문장을 `STRUCTURED_GROUP_CHILDREN`·`STRUCTURED_GROUP_VARIANTS`·`STRUCTURED_MAX_GROUPS`에서 생성한다.
- [ ] 테스트로 확인한다. 생성된 설명의 요소 ID 집합은 스키마의 `elements` 키 집합과 같아야 하고, 각 요소 설명에는 스키마의 props 키가 모두 있어야 한다.
- [ ] 스키마가 고정한 값과 어긋나는 손글씨 지시를 프롬프트에서 뺀다. 스키마는 `design.layout`을 항상 한 값(사용자 스타일 또는 `library`)으로 고정하는데, 프롬프트에는 editorial·gallery·dossier 선택 기준이 남아 있다.
- [ ] `PAGE_PROMPT_VERSION`을 9로 올리고 바뀐 이유를 주석에 적는다.
- [ ] 저장 Spec 형식, 렌더링 HTML, 편집 API, 재시도 횟수는 그대로다. 기존 렌더러·계약·통합 테스트가 수정 없이 통과한다.

## 설계

**재시도 분리.** `packages/portfolio-renderer/src/renderer.tsx`에 `validateRenderableSpec(spec, input)`을 두고, 지금 `renderStructuredPortfolio` 안에서 하는 두 검사(`validateStructuredPortfolio` + `validateLibrarySelection`)를 묶는다. `renderStructuredPortfolio`는 이 함수를 그대로 써서 Renderer 앞의 단일 검사 지점을 유지한다. `renderToStaticMarkup`의 예외와 크기 초과는 `StructuredRenderError`로 감싼다.

`structured-generator.ts`의 고리는 두 단계로 나눈다. `try` 안에서는 `validateRenderableSpec`와 스타일 보존 검사만 하고, 실패하면 다음 시도로 넘어간다. 통과하면 고리 밖에서 렌더링하고, 예외는 `PageRenderError`로 바꿔 던진다. 라우트(`routes.ts`의 `lift`)는 `PageGenerationError`를 502로 바꾸므로 하위 클래스도 같은 응답이 되고, HTTP 계약은 그대로다. 스트림의 `failed` 코드에는 `error.name`이 들어가므로 `PageRenderError`로 구분된다.

**프롬프트 생성.** 새 파일 `services/backend/src/modules/page/structured-spec-format.ts`를 만든다.
- `describeSpecSchema(schema, labels)`: `z.toJSONSchema`로 스키마를 바꾼 뒤 `elements`의 속성마다 `id: {type, props, children}` 한 줄을 만든다.
  - `const`는 값 그대로, `enum`은 `a|b|c`로 적는다.
  - 선택지 목록과 같은 값 집합의 enum은 `<intro 선택지 ID>` 같은 이름으로 줄인다. 32개짜리 ID 목록을 반복하지 않기 위해서다.
  - 길이 제한이 있는 배열에는 개수를 적는다.
  - 모양이 같은 선택 요소(`group-1`…`group-4`)는 한 줄로 묶는다.
- `describeGroupRules()`: 계약 상수에서 컨테이너 규칙 문장을 만든다.

`structuredSpecPrompt`는 스키마를 인자로 받는다. 생성기는 스키마를 한 번 만들어 프롬프트와 `ai.complete`에 같이 넘긴다.

**손글씨로 남기는 문장.** 스키마로 표현할 수 없는 규칙은 손으로 쓴 문장으로 남긴다.
- 트리 전체에서 한 번씩, 소개는 처음, 연락처는 마지막
- 이미지 없는 사례의 `CaseGallery` 금지, `CaseProcess`는 설명 2개 이상
- 원본 선택 기준, 팔레트 선택 기준, `motion: showcase` 지시
- 목차 배치 지시, 수정 요청과 직전 Spec

## 버린 대안

- **`catalog.prompt()` 사용.** JSONL 패치 출력과 "realistic sample data" 생성을 지시하므로 날조 금지 원칙과 맞지 않는다(2026-10-13 조사).
- **스키마 JSON Schema 전문을 프롬프트에 붙이기.** 공급자에 이미 `--json-schema`로 넘어가는 내용이다. 선택지 ID 목록이 섹션마다 반복되어 프롬프트가 길어진다.
- **요소 설명 표를 계약에 따로 두고 스키마와 프롬프트를 둘 다 거기서 만들기.** 기준을 하나 더 늘린다. 공급자가 실제로 받는 것이 스키마이므로 스키마를 출처로 둔다.
- **렌더러 예외를 `catch`에서 `instanceof`로 걸러 다시 던지기.** 검사 단계와 렌더링 단계가 같은 `try` 안에 남는다. 다음 수정에서 다시 섞이기 쉽다.

## 함정

- `toToolSchema`는 선택 필드를 nullable로 바꾸지만, 설명에는 원래 Zod의 선택 여부를 써야 한다. `z.toJSONSchema` 원본을 쓴다.
- `renderer.test.ts`가 "저장 크기 제한" 문구로 예외를 확인한다. 문구를 바꾸지 않는다.
- 렌더러 안의 검사가 다시 실패할 일은 없지만, 실패하면 `StructuredRenderError`가 아닌 일반 오류로 남겨 렌더링 결함과 섞이지 않게 한다.
- 스타일 값(`context.style`)을 파싱하다 실패해도 모델이 고칠 수 없는 오류다. 렌더링 단계 오류로 처리한다.
- 공급자 스키마 위반(`AI_INVALID_OUTPUT`)은 `ai.complete` 안에서 던져지므로 이 고리의 재시도 대상이 아니다. 이번에 바꾸지 않는다.

## 완료 기준

- `pnpm typecheck`, `pnpm test`가 통과한다.
- `structured-generator.test.ts`의 새 테스트 셋이 통과한다.
  - 렌더 예외: 모델 호출 1회, `PageRenderError`
  - Spec 검사 실패: 호출 2회
  - 프롬프트 요소 ID 집합 = 스키마 요소 ID 집합
- `pnpm test:infra integration.test.ts`가 통과한다(구조화 저장·편집 회귀).
- 고정 입력의 프롬프트 전문(변경 전·후)을 PR 본문에 첨부한다.
