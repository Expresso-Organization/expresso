---
title: v2 속성 스키마가 없는 카테고리의 속성 저장 400 수정
slug: property-save-v1-schema
stage: spec
status: accepted
intent: .intent/intent_property-save-v1-schema.md
date: 2026-10-16
---

# v2 속성 스키마가 없는 카테고리의 속성 저장 400 수정 — 명세

## 요구사항

- [ ] `MongoCareerService.updateRecord` · `createRecord`가 `propertySchemaV2` 없는 기본 카테고리(경험)에서
      `{ role: { type: "text", value } }`를 받아 저장하고, 다시 읽으면 같은 값이다. 수정 전에는 400.
- [ ] 같은 카테고리에서 v1 `date` 속성에 웹이 보내는 `{ type: "date", value: { start, end: null, timezone: null } }`를 저장한다.
- [ ] 타입이 다른 v2 값(`{ role: { type: "number", value: 1 } }`)과 없는 key는 지금처럼 400이다.
- [ ] v1 평문 값(`role: "문자열"`, `startMonth: "2026-08"`)은 지금처럼 저장된다.
- [ ] `propertySchemaV2`가 있는 카테고리의 검증 · 계산 이벤트는 바뀌지 않는다.
- [ ] `career` 모듈 안의 "v1에서 v2 정의 파생" 규칙과 `stablePropertyId`는 한 곳에만 있다.

## 설계

**파생 규칙 한 곳** — 새 파일 `services/backend/src/modules/career/property-definitions.ts`

- `stablePropertyId(categoryId, key)`: `property-schema.ts`에서 옮긴다(`view-query.ts`의 같은 함수는 지운다).
- `careerPropertyDefinitions(categoryId, propertySchema, propertySchemaV2?)`: `propertySchemaV2`가 있으면 그것을,
  없으면 v1에서 파생한 정의를 돌려준다. 파생 규칙은 지금 세 곳에 있는 코드 그대로다
  (`id ?? stablePropertyId`, `boolean → checkbox`, `tags → multi_select`, 나머지 같은 이름, `config: {}`, `version: 1`).
- `careerCategoryDefinitions(category: CareerCategoryDoc)`: 위 함수에 `_id`를 넘기는 얇은 함수.
  `relations.ts`가 내보내던 같은 이름 함수를 이것으로 바꾸고, `relations.ts` · `category-move.ts` · 테스트의 import를 옮긴다.
- `property-schema.ts`의 `definitions()`, `view-query.ts`의 `activeDefinitions()`의 파생 부분은 이 함수를 부른다
  (`view-query`는 계약 타입 `CareerCategory`라 `category.id`를 넘긴다. 삭제된 정의를 거르는 동작은 유지).

**저장 검증** — `service.ts`

- `createRecord` · `updateRecord`의 `validateCareerProperties(category.propertySchema, properties, category.propertySchemaV2)`에서
  세 번째 인자를 `careerCategoryDefinitions(category)`로 바꾼다. `validateCareerProperties` 자체는 바꾸지 않는다 —
  v1 평문 값은 v1 정의로, v2 값은 유효 v2 정의로 이미 나눠 검증한다.
- 계산 이벤트용 `computationDefinitions`(`category.propertySchemaV2 ?? []`)는 그대로 둔다.
  파생 정의에는 formula · rollup · title이 없어 바꿔도 결과가 같고, 새 outbox 이벤트만 생길 수 있다.

## 버린 대안

- 기본 카테고리에 `propertySchemaV2`를 채우는 마이그레이션 — `createCategory` · v1 스키마 변경 경로는 v1만 쓰므로
  새로 만든 카테고리가 다시 같은 상태가 된다. 세 경로를 모두 바꿔야 하고 공용 시드 행을 바꾼다.
- 웹이 파생 정의일 때 v1 평문 값을 보내기 — `PropertyValueEditor`는 v2 값으로만 만들어져 있고, 화면 · 백엔드의 다른
  코드는 이미 파생 정의를 쓴다. 어긋난 쪽은 저장 검증이다.
- `career-computation` · `career-editor/ai-proposals`의 같은 규칙까지 합치기 — 다른 모듈이라 `career` 진입점에서
  내보내야 한다. 이번 결함과 관계없어 범위를 넓히지 않는다.

## 함정

- 기본 카테고리의 v1 속성에는 `id`가 없다. 파생 id는 `stablePropertyId(category._id, key)`이고 웹 파생 id와 다르다. 검증은 key 기준이라 영향이 없다.
- v1 `date` 평문 값은 `YYYY-MM`만 통과한다. v2 date 값은 범위 객체다. 둘 다 통과해야 한다.
- `validateCareerProperties`의 필수 속성 검사는 v1 · v2 정의를 모두 돈다. 파생 정의는 v1 `required`를 그대로 가지므로 결과가 같다.
- `pnpm --filter @expresso/backend test`가 `dist`를 다시 지으며, 떠 있는 `tsx --watch` 서버를 재시작시킨다.

## 완료 기준

- `pnpm --filter @expresso/backend typecheck` · `pnpm --filter @expresso/backend test` 통과.
- `pnpm test:infra`에서 새 통합 테스트(기본 카테고리 v2 text · date 저장, 타입 불일치 400, v1 평문 저장)가 통과하고,
  수정 전 코드에서는 v2 text 저장이 400으로 실패한다.
- 화면: 개발 서버에서 경험 기록 상세의 '역할'을 고치고 새로고침하면 값이 남고 PATCH가 200이다.
