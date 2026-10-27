---
title: 커리어 카테고리 사용자 소유화와 레거시 태그 이관
slug: career-category-ownership
stage: spec
status: accepted
intent: .intent/intent_career-category-ownership.md
date: 2026-10-25
---

# 커리어 카테고리 사용자 소유화와 레거시 태그 이관 — 명세

## 요구사항

- [ ] 가입(`signup` · `signInWithGoogle` 신규)하면 같은 트랜잭션에서 그 사용자 소유 카테고리 7개가 생긴다. `career_categories`에 `userId: null` 문서가 없다.
- [ ] 기본 카테고리에서도 속성 추가 · 이름 · 타입 변경 · 삭제가 되고, 다른 사용자 카테고리에는 보이지 않는다.
- [ ] `select` · `multi_select` 속성에 문서 패널과 표 셀에서 새 옵션을 만들고 바로 고를 수 있다(`configure` 변경, 기존 옵션 ID는 지우지 못한다).
- [ ] 마이그레이션 0017 뒤 사용자별 기록 · 저장한 보기 · 관계 · 연결 수가 전과 같고, 모든 기록의 `categoryId`가 그 사용자 카테고리를 가리킨다.
- [ ] 모든 기록 속성 값이 `CareerPropertyValueV2Schema`를 통과한다. 옛 태그 값은 이름이 같은 옵션의 ID 배열이 된다.
- [ ] 새 사용자 기본 속성은 정의서 05–05e를 따르고, 기존 사용자의 값 있는 옛 속성(휴지통 기록 포함)은 그 사람 카테고리에 남는다.
- [ ] 공고 매칭 · 커버리지 · 자료 추천 · 인터뷰 질문 · 에이전트 요건 대조가 옵션 ID 대신 이름을 읽는다. 이관 전후 dev01 공고 매칭 점수가 같다.
- [ ] AI 기록 정리는 제목과 `competencies`만 쓴다. 속성 전체를 덮어쓰지 않고, STAR · metrics를 속성에 넣지 않는다. 역량 속성이 없으면 건너뛴다.
- [ ] 계약 · 스키마 · 코드에 `tags` 타입, `propertySchema`(v1), `isSystem`, v1→v2 변환이 없다. v1 전용 API(`PATCH /property-schema`, `/categories/:id/views`)가 없다.

## 설계

**기본 템플릿** — `packages/database/src/career-category-templates.ts`가 7종 정의와 `defaultCareerCategories(userId, now)`를 둔다. identity와 career가 서로를 가져오지 않게 database에 둔다. ID는 결정적이다: 카테고리 `uuidV5(userId:category:key)`, 속성 `uuidV5(categoryId:key)`(기존 `stablePropertyId`와 같은 식), 옵션 `uuidV5(propertyId:option:name)`. 관계 속성은 같은 사용자의 대상 카테고리 ID를 넣는다. 템플릿 속성은 모두 `system: false`다.

| 카테고리 | 속성 |
|---|---|
| 경험 | 역량 `competencies` 다중 선택 · 시기 `period` 날짜 |
| 프로젝트 | 역할 `role` · 기술 `technologies` 다중 선택 · 기간 `period` · 성과 `outcome` · 연결된 경험 관계 |
| 학력 · 이력 | 고용 형태 선택(정규직) · 기간 · 소속 · 연결된 프로젝트 · 연결된 경험 |
| 스킬 · 도구 | 분류 선택(언어 · 쿼리, 데이터 · 파이프라인, 인프라 · 운영) · 처음 사용 · 최근 사용 `lastUsedMonth` · 연결된 프로젝트 · 연결된 경험 |
| 학술 · 집필 | 유형 선택(기술 글, 논문) · 게재처 `publication` · 게재 월 `publishedMonth` · 원문 링크 `url` |
| 자격증 · 수상 · 활동 · 리더십 | 정의서가 없어 v1 정의를 그대로 옮긴다 |

선택지는 정의서 화면에 나온 값만 넣는다. 상태 · 출처 · 사용처 · 공고 수요는 기록 필드나 계산 값이라 속성으로 두지 않는다.

**마이그레이션 0017** (`career_category_ownership`, 템플릿은 `0017/templates.json` 고정본) — 단계: validator 완화 → 사용자별 이관 → 공용 문서 삭제 · `system_key_unique` 삭제 · `propertySchema` · `isSystem` 제거 → validator 강화(`userId` 문자열, `propertySchemaV2` 필수). 사용자별 이관은 `db.client` 트랜잭션 하나이고, 결정적 경험 카테고리 ID가 있으면 건너뛴다. 공용 카테고리에서 온 속성은 **기존 속성 ID를 유지**하고 카테고리 ID만 새로 준다. 그래서 보기 · 관계 · 계산 속성 설정 안의 속성 ID는 그대로이고, 카테고리 ID만 기록 · 보기(`categoryId` · `configuration.categoryId` · 제목 열 너비 키) · 사용자 정의 카테고리의 관계 대상에서 바꾼다. 템플릿과 키가 같은 옛 속성은 템플릿 타입으로 값을 바꿔 합친다. 사용자 정의 카테고리도 v1 정의를 v2로 바꾸고 원값을 변환한다. 바꿀 수 없는 원값은 `unmappedProperties`로 옮기고 개수를 로그에 남긴다. 사용자가 템플릿 키로 만든 카테고리는 키에 `_custom`을 붙인다.

**서버** — `definitions()` 계열 6곳은 `propertySchemaV2`만 읽는다. 카테고리 조회는 `userId`로만 거른다. `isSystem` 가드를 지우고 속성 보호는 정의의 `system`으로만 한다. `careerPropertyText(properties, definitions)`와 사용자 카테고리 정의를 한 번 읽는 `careerRecordTextReader`를 career 진입점에 두고 매칭 · 커버리지 · 자료 · 인터뷰 · 에이전트가 쓴다. `CareerApi`는 Mongo 서비스 기준으로 다시 정의하고 `legacy-mysql-service.ts`(career)를 지운다.

**웹** — v1 변환(`fallbackView`, `categoryDefinitions`, `view-types`, `asV2Value`)과 `isSystem` 잠금을 지운다. 옵션 추가는 `PropertyValueEditor`와 표 셀 다중 선택 팝업이 같은 함수(preview → apply `configure`)를 쓴다.

## 버린 대안

- 공용 카테고리에 사용자별 덮어쓰기 층을 두기: 조회마다 합쳐야 하고 v1이 남는다.
- 템플릿을 DB 컬렉션으로 두기: 검증기 · 시드 · 조회가 늘고, 코드 상수와 0017 고정본이면 충분하다.
- 속성 ID를 사용자마다 새로 발급: 보기 필터 트리 · 열 너비 · 관계 원장 안의 ID를 모두 다시 써야 한다.
- 이름을 `propertySchemaV2`에서 `propertySchema`로 바꾸기: 웹 · 서버 전반을 건드려 이번 범위를 넘는다(후속 작업).

## 함정

- 0001 파일은 적용 해시가 있어 고치지 않는다. 새 DB에서도 0001이 공용 7종을 심으므로 0017이 지운다.
- 실행 중인 다른 워크트리 서버가 체험 DB를 쓴다. 이관 확인은 사본 DB에서만 한다.
- 공고 매칭 글은 원래 `JSON.stringify(properties)`였다. 이름으로 푼 값을 같은 키로 직렬화해 문자열 포함 판정이 바뀌지 않게 한다.

## 완료 기준

- `git grep -nE "isSystem|\"tags\"|propertySchema\b" -- services/backend/src services/web/src packages/contracts/src`가 0001 고정 파일 밖에서 없다(디자인 시스템 `tags`는 별개).
- `pnpm typecheck` · `pnpm test` · `pnpm test:infra` · 웹 Playwright 통과.
- 체험 DB 사본에서 이관 전후 스냅샷(사용자별 기록 · 보기 · 관계 · 연결 수, dev01 매칭 점수)이 같다.
- 사본에 붙인 서버에서 dev01 "개인 가계부 PWA" 문서 패널에 기술 칩이 보이고 새 기술을 추가할 수 있다. 새 계정에서 프로젝트에 속성을 추가하면 dev01에는 보이지 않는다.
