---
title: 커리어 보기의 선택 속성 이름 표시
slug: career-option-labels
stage: spec
status: accepted
intent: .intent/intent_career-option-labels.md
date: 2026-11-02
---

# 커리어 보기의 선택 속성 이름 표시 — 명세

## 요구사항

- [ ] `features/career-editor/views/view-types.ts`에 `propertyLabels(definition, value): string[]`와 `propertyText(definition, value): string`이 있다.
  - `select` · `multi_select`이면 값(선택지 ID)을 `propertyOptions(definition)`의 `name`으로 바꾼다. 선택지에 없는 ID는 버린다.
  - 그 밖의 타입은 지금 `displayValue`와 같은 규칙이다(관계는 `title`, 날짜는 `start – end`).
  - `propertyText`는 이름들을 `", "`로 잇고, 비면 `"—"`다.
- [ ] `ProjectGallery`의 기술 칩, `GenericGallery`의 속성 미리보기, `ListView`의 속성 미리보기, `BoardView`의 열 이름이 이 함수를 쓴다. 속성 정의는 `category.propertySchemaV2`에서 ID나 key로 찾는다.
- [ ] `CareerTableCell`의 `CellDisplay`가 따로 만든 `labels` 지도 대신 `propertyLabels`를 쓴다. 지운 선택지 ID는 버린다(지금은 ID를 보인다).
- [ ] 단위 테스트: 다중 선택 ID → 이름, 지운 선택지 ID 버림, 관계 값 → 제목, 빈 값 → `"—"`. 갤러리 렌더 테스트에서 칩에 UUID가 없고 이름이 있다.

## 설계

**재사용.** `propertyOptions`(`features/career-editor/properties/property-editors.tsx`)가 정의의 `config.options`에서 `{ id, name }`을 읽는다. 표 셀과 PR 141이 이미 이 함수로 이름을 찾는다. 새 함수는 이것을 감싸 보기 전체의 단일 출처가 된다.

**바꾸는 것.** 보기들이 `displayValue(rawValue(record, key))`를 부르던 자리를 `propertyText(definition, rawValue(record, key))`로 바꾼다. 그러려면 key 대신 정의를 찾아야 하므로 `propertyDefinition(category, propertyId)`를 둔다(`propertyKey`와 같은 조회).

**PR 141과의 관계(열린 질문의 권장안 기준).** PR 141을 머지한 main 위에서 작업한다. PR 141이 `GalleryView`의 `projectTags`와 보드 묶음에서 만든 `new Map(propertyOptions(...))`를 새 함수로 바꾼다. PR 141을 머지하지 않으면 지금 main의 네 보기에 같은 바꾸기를 하고, 보드 열 이름은 `BoardView.tsx`의 묶음 키를 고친다.

## 버린 대안

- `displayValue`에 정의를 선택 인자로 붙이는 것. 정의 없이 부르는 자리가 남아 같은 결함이 다시 생긴다. 이름을 바꿔 정의를 필수로 받는다.
- 서버 목록 응답에 선택지 이름을 함께 내리는 것. 카테고리 응답에 정의와 선택지가 이미 있어 계약을 늘릴 이유가 없다.

## 함정

- 다중 선택 값은 계약상 UUID 배열(`career-properties.ts`)이지만 오래된 기록에는 문자열 이름이 들어 있을 수 있다. 선택지에 없는 값을 버리면 그런 값도 사라진다. 지금 데이터(체험 DB 복사본)에서 기술 값이 모두 선택지 ID인지 확인하고, 이름 문자열이 남아 있으면 버리지 않고 그대로 보인다(UUID 형식인 값만 버린다).
- `GenericGallery`와 `ListView`는 한 줄로 압축된 JSX다. 고치는 김에 읽히게 풀지 않는다(PR 141과의 차이를 줄인다).

## 완료 기준

```
pnpm --filter @expresso/web typecheck
pnpm --filter @expresso/web test
```

둘 다 종료 코드 0. 화면 확인은 plan의 「검증」에 적는다.
