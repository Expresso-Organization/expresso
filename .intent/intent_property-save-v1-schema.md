---
title: v2 속성 스키마가 없는 카테고리의 속성 저장 400 수정
slug: property-save-v1-schema
stage: intent
status: accepted
author: Nedian0Brien
date: 2026-10-16
---

# v2 속성 스키마가 없는 카테고리의 속성 저장 400 수정

## 문제

웹 기록 상세 · 문서 패널의 속성 목록(`PropertyList`)에서 속성 값을 고치면,
카테고리에 `propertySchemaV2`가 없을 때 `PATCH /api/career/records/:id`가 400으로 실패한다.
값이 저장되지 않고 새로고침하면 사라진다. v2 플래그와 관계없다.

2026-10-16 재현(PR #85 확인 중): 새 DB에서 경험 카테고리 기록의 '역할'(text)을 고치면 PATCH 400 두 번, 서버 `properties`는 `{}` 그대로.

원인:

- `PropertyList`는 `{ type, value }` 형태의 v2 값을 보낸다.
- 백엔드 `validateCareerProperties`(`career/properties.ts`)는 v2 값이면 `propertySchemaV2`에서 같은 key의 정의를 찾고,
  없으면 `invalid value for category property: <key>`로 거절한다.
- 기록 생성 · 수정(`career/service.ts`의 `createRecord` · `updateRecord`)은 원본 `category.propertySchemaV2`를 그대로 넘긴다.
- 그런데 나머지 코드는 "`propertySchemaV2`가 없으면 v1 `propertySchema`에서 파생한다"는 규칙을 쓴다 —
  `career/property-schema.ts`, `career/relations.ts`, `career/view-query.ts`, `career-computation/service.ts`, 웹 `categoryDefinitions`.
  화면은 이 파생 정의로 그려지는데, 저장 검증만 이 규칙을 쓰지 않는다.

닿는 범위: 기본 카테고리 7개(공용 시드, `userId: null`)는 `propertySchemaV2`가 없고 웹이 스키마 변경을 막으므로 계속 이 상태다.
사용자가 만든 카테고리도 첫 속성 스키마 변경 전까지는 `propertySchemaV2`가 없다(`createCategory`는 v1만 쓴다).

## 원하는 결과

- `propertySchemaV2`가 없는 카테고리에서 v1 `text` · `date` 속성을 웹 속성 목록으로 고치면 PATCH가 200이고,
  새로고침 뒤에도 값이 남는다(기본 카테고리 경험의 '역할', 학력·이력의 '시작 월' 등).
- 기록 저장 검증이 화면과 같은 유효 정의(`propertySchemaV2 ?? v1에서 파생`)를 쓴다.
  `career` 모듈 안의 파생 규칙은 한 함수로 모인다.
- v1 평문 값(문자열 · `YYYY-MM` 등)으로 저장하는 기존 경로(레거시 API, `record-cleaner`)는 지금처럼 통과한다.
- `validateCareerProperties` 단위 테스트가 `propertySchemaV2` 없는 시드 모양 카테고리에서 v1 각 타입에 대해
  웹이 보내는 v2 값 모양으로 통과 · 거절을 확인한다. 수정 전 코드에서 실패한다.

## 영향 범위

- 백엔드 `career` 모듈: `properties.ts`, `service.ts`, 파생 규칙이 있는 `property-schema.ts` · `relations.ts` · `view-query.ts`
- 다른 모듈(`career-computation`, `career-editor/ai-proposals`)의 같은 파생 규칙: 진입점이 이미 내보내는 것만 쓰는 원칙에 따라 이번에는 건드리지 않는다.
- 웹: 변경 없음
- 결정: 사용자(Nedian0Brien)

## 제약

- 고친 뒤에는 이 카테고리들의 기록에 v2 형태 값(`{ type, value }`)이 기존 v1 평문 값과 섞여 저장된다.
  `propertySchemaV2`가 있는 카테고리는 이미 그렇다. 속성을 읽는 다른 모듈(`job-analysis`, `interview`, `jobs`)은
  `JSON.stringify`로 문자열에 넣어 쓰므로 동작이 깨지지 않는다. 다만 v2 꺼짐 화면(`LegacyCareerBrowser`)은
  문자열이 아닌 값을 JSON 문자열 그대로 보여 준다.
- 기간 정렬 · 표시는 속성이 아니라 `periodStart` · `periodEnd` 필드를 쓰므로 영향이 없다.
- 스키마 · 마이그레이션 변경 없음. 계약 변경 없음.

## 범위 밖

- v1 `tags` 속성(경험의 수치 · 성과 · 역량, 프로젝트의 기술). v2 `multi_select`로 파생되는데 값이 선택지 UUID여야 하고
  파생 정의에는 선택지가 없어, 웹이 기존 값을 그리지 못하고 고칠 수도 없다. 검증 정렬로 풀리지 않는 별도 문제다.
- 웹 `categoryDefinitions`가 만드는 파생 id(`00000000-0000-4000-8000-…`)가 백엔드 `stablePropertyId`와 다른 문제.
  저장은 key 기준이라 이번 수정에는 필요 없지만, id로 정의를 찾는 표 보기 · 관계 기능에 영향이 있을 수 있다.
- 기존 v1 평문 값을 v2 형태로 바꾸는 데이터 마이그레이션, 기본 카테고리에 `propertySchemaV2`를 채우는 마이그레이션.
- `LegacyCareerBrowser`의 v2 값 표시.

## 열린 질문

없음. 버린 대안은 spec에 적는다(데이터 마이그레이션만으로는 새로 만든 카테고리가 다시 같은 상태가 되고,
웹이 v1 값을 보내게 하면 v2 전용으로 만든 속성 편집기에 두 번째 값 형식이 생긴다).
