---
title: 기본 카테고리 tags 속성 표시 · 편집 수정
slug: career-tags-property
stage: spec
status: accepted
intent: .intent/intent_career-tags-property.md
date: 2026-10-17
---

# 기본 카테고리 tags 속성 표시 · 편집 수정 — 명세

## 요구사항

- [ ] v1 `tags`에서 파생한 v2 정의는 `type: "multi_select"`, `config: { legacyType: "tags" }`다. 백엔드(`careerPropertyDefinitions`)와 웹(`categoryDefinitions`)이 같다.
- [ ] 속성 편집기는 이 정의를 만나면 기존 문자열 값을 칩으로 그린다.
- [ ] 입력란에 문자열을 넣고 Enter를 누르면 칩이 더해지고 `string[]`이 저장된다. 앞뒤 공백은 지우고, 빈 문자열과 이미 있는 값은 더하지 않는다.
- [ ] 칩의 지우기 버튼을 누르면 그 값이 빠진 `string[]`이 저장되고, 마지막 값을 지우면 속성이 지워진다(`null`).
- [ ] 저장 값은 v1 문자열 배열이라 백엔드 검증(v1 정의)을 통과하고, 표 · 갤러리 보기와 인터뷰 정리가 쓰는 형태와 같다.
- [ ] 선택지를 가진 다중 선택(`legacyType` 없음)은 지금처럼 체크박스로 그리고 선택지 UUID를 저장한다.
- [ ] 사용자 카테고리가 첫 스키마 변경을 거치면 파생 정의가 `propertySchemaV2`로 저장되며 `legacyType`도 함께 남는다.

## 설계

**백엔드** — `career/property-definitions.ts`의 파생 규칙에서 `config`를 `property.type === "tags" ? { legacyType: "tags" } : {}`로 만든다.
검증(`validateCareerProperties`)은 바꾸지 않는다. `string[]`은 v2 값이 아니므로 v1 정의(`tags`)로 검증된다.
`applyChange`는 파생 정의를 복사해 `propertySchemaV2`로 저장하므로 표시가 그대로 이어진다.

**웹**

- `CareerDocumentEditor.tsx`의 `categoryDefinitions` 파생에도 같은 `config`를 넣는다.
- `properties/property-editors.tsx`에 `isLegacyTags(definition)`과 `TagListEditor`를 둔다(속성 편집기 부품이 모인 파일).
  - 칩: 값 문자열과 지우기 버튼(`aria-label="<값> 지우기"`, `x` 아이콘).
  - 입력란: `aria-label="<속성 이름> 추가"`, Enter로 더하기(`commitOnEnter` 재사용).
- `PropertyValueEditor`: `multi_select` 분기 앞에서 `isLegacyTags`면 `TagListEditor`를 그린다. 현재 값은
  `PropertyList`의 `asV2Value`가 이미 `{ type: "multi_select", value: string[] }`로 바꿔 주므로 `value.value`를 읽는다.
- 저장 값 타입: `PropertyValueEditor`의 `onCommit`과 `PropertyList.saveProperty`가 `CareerPropertyValueV2 | string[] | null`을 받게 넓힌다.
  `string[]`은 legacy tags에서만 나온다.
- 스타일: `properties.module.css`에 `.tagList` · `.tagChip`. 칩 모양은 같은 파일 `.assetList button`의 값(둥근 999px, `--ex-bg-muted`, `--ex-border-soft`)을 쓴다. 새 토큰을 만들지 않는다.

## 버린 대안

- (B) 계약에 v2 `tags` 타입 추가 — intent에서 (A)로 정했다.
- 선택지가 없고 값이 문자열 배열이면 자유 태그로 보는 추정 — 사용자가 선택지를 모두 지운 진짜 다중 선택과 구분되지 않는다. 정의에 출처를 적는다.
- 웹이 `category.propertySchema[key].type`을 직접 보고 판단 — 편집기는 정의만 받고, `propertySchemaV2`가 저장된 뒤에는 v1 정의와 어긋날 수 있다.

## 함정

- 이 수정 전에 첫 스키마 변경을 거친 사용자 카테고리는 `propertySchemaV2`에 `legacyType` 없는 `multi_select`로 저장되어 있어 계속 체크박스(선택지 없음)로 보인다. 데이터 마이그레이션은 범위 밖이다.
- `PropertyList`는 저장 직후 서버 응답으로 `current`를 바꾸고, 편집기는 `value` 변경 때 입력 상태를 다시 맞춘다. 칩 입력란은 저장이 끝나면 비운다.
- 같은 값이 두 번 커밋되는 기존 동작(Enter + blur)이 있으므로, 칩 입력은 blur에서 저장하지 않고 Enter에서만 더한다.

## 완료 기준

- `pnpm --filter @expresso/backend typecheck` · `test`, `pnpm --filter @expresso/web typecheck` · `test` 통과.
  새 테스트: 파생 정의의 `legacyType`(백엔드 단위), `TagListEditor` 표시 · 더하기 · 지우기 · 중복 무시(웹), 선택지 있는 다중 선택은 체크박스 유지(웹).
- 화면: 개발 서버(백엔드 v2 켜짐)에서 경험 기록 상세의 '수치'에 값 두 개를 더하고 하나를 지운 뒤 새로고침하면 남은 값이 칩으로 보이고, 서버 값이 문자열 배열이다.
  인터뷰 정리처럼 API로 넣은 기존 tags 값이 칩으로 보인다.
