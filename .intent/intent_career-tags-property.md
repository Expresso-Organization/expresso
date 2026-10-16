---
title: 기본 카테고리 tags 속성 표시 · 편집 수정
slug: career-tags-property
stage: intent
status: accepted
author: Nedian0Brien
date: 2026-10-16
---

# 기본 카테고리 tags 속성 표시 · 편집 수정

## 문제

기록 상세 · 문서 패널의 속성 목록에서 v1 `tags` 속성이 비어 보이고 고칠 수 없다.
해당 속성: 경험의 수치(`metrics`) · 성과(`achievements`) · 역량(`competencies`), 프로젝트의 기술(`technologies`),
그리고 `tags` 속성을 가진 사용자 카테고리 중 `propertySchemaV2`가 아직 없는 것.

원인:

- `propertySchemaV2`가 없는 카테고리는 v1 정의에서 v2 정의를 파생하고(`career/property-definitions.ts`, 웹 `categoryDefinitions`),
  이때 `tags`는 `multi_select`가 되며 `config`는 `{}`다.
- v2 다중 선택 값은 선택지 UUID 배열이고(설계 문서 「프로퍼티 모델」), 편집기(`PropertyValueEditor`)는 `config.options`의 선택지만 그린다.
  선택지가 없으니 아무것도 그리지 않고, 기존 값(`["일 1,200만 건", "장애 대응"]` 같은 문자열 배열)도 보이지 않는다.
- 이 값들은 인터뷰 정리(`record-cleaner.ts`)가 사용자 답변에서 뽑아 v1 문자열 배열로 쓴다. 사용자마다 다르고,
  기본 카테고리는 모든 사용자가 공유하는 행이라 카테고리 단위 선택지로 옮길 수 없다.
- 보기 쪽은 이미 문자열로 다룬다 — 표 셀은 배열을 그대로 칩으로 그리고, 프로젝트 갤러리는 `technologies` 문자열을 읽는다.
  어긋난 곳은 문서의 속성 편집기다.
- 설계 문서에는 v1 tags를 v2로 어떻게 옮길지 결정이 없다. `tags → multi_select` 대응은 코드(2026-09-01 커밋)에만 있다.

## 원하는 결과

- 기본 카테고리 기록 상세에서 tags 속성의 기존 값이 칩으로 보인다.
- 값을 더하고 지울 수 있고, 새로고침 뒤에도 남는다.
- 인터뷰 정리가 쓰는 값, 표 · 갤러리 보기가 읽는 값과 같은 형태로 저장되어, 한쪽에서 쓴 값이 다른 쪽에서 그대로 보인다.
- 선택지를 가진 진짜 다중 선택 속성(사용자가 만든 `multi_select`)의 동작은 바뀌지 않는다.

## 영향 범위

- 웹: `PropertyValueEditor` · `PropertyList` · `categoryDefinitions`
- 백엔드: `career/property-definitions.ts`의 파생 규칙(열린 질문의 답에 따라 계약 `packages/contracts`까지)
- 결정: 사용자(Nedian0Brien)

## 제약

- 이 브랜치는 PR #87(`fix/property-save-v1-schema`) 위에 쌓는다. base를 그 브랜치로 두고, #87이 머지되면 `main`으로 바꾼다.
- 공용 시드 카테고리 행에 사용자별 데이터를 넣지 않는다.

## 범위 밖

- 표 보기 셀 편집기(`CareerTableCell`)에서 tags 편집. 표 보기는 `propertySchemaV2`만 읽어 기본 카테고리에서는 정의를 찾지 못한다(웹 파생 id ≠ `stablePropertyId` 문제와 함께 별도).
- 기존 v1 tags 값을 다른 형태로 바꾸는 데이터 마이그레이션.

## 열린 질문

1. v1 tags를 v2에서 어떤 속성으로 다루는가.
   - (A) 자유 태그로 편집, 값은 v1 문자열 배열 그대로(권장): 파생 정의에 "v1 tags에서 왔다"는 표시를 두고
     (`multi_select` + `config.legacyType: "tags"` 같은 형태), 편집기가 이 정의를 만나면 문자열을 입력해 칩을 더하고 지우는
     편집기를 그리며 `string[]`을 저장한다. 백엔드 검증은 v1 정의로 이미 `string[]`을 받는다. 계약 · 데이터 변경이 없고,
     인터뷰 정리 · 보기와 같은 값을 쓴다. 대신 v2 타입 목록에 없는 "자유 태그"가 파생 정의의 표시로만 존재한다.
   - (B) 계약에 v2 `tags` 타입 추가: `CareerPropertyTypeV2Schema`에 `tags`, 값 `{ type: "tags", value: string[] }`를 더하고
     파생 규칙을 `tags → tags`로 바꾼다. 속성 만들기 팝오버 · 타입 변환 · 수식 타입 검사 · 필터 등 v2 타입을 나열하는 곳을 모두 맞춰야 하고,
     새로 저장되는 값은 `{ type: "tags", value }` 형태가 되어 v1 배열과 섞인다. 사용자가 새 카테고리에서도 자유 태그 속성을 만들 수 있게 된다.

   답(2026-10-17, 사용자): (A) 자유 태그 · v1 문자열 배열 유지로 진행한다.
