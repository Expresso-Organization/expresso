---
title: v2 속성 스키마가 없는 카테고리의 속성 저장 400 수정
slug: property-save-v1-schema
stage: plan
status: accepted
intent: .intent/intent_property-save-v1-schema.md
spec: .intent/spec_property-save-v1-schema.md
date: 2026-10-16
---

# v2 속성 스키마가 없는 카테고리의 속성 저장 400 수정 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/backend/src/modules/career/property-definitions.ts` (새 파일) | `stablePropertyId` · `careerPropertyDefinitions` · `careerCategoryDefinitions` |
| `services/backend/src/modules/career/service.ts` | 기록 생성 · 수정 검증에 유효 정의 전달 |
| `services/backend/src/modules/career/property-schema.ts` | `definitions()` · `stablePropertyId` 제거, 새 파일 사용 |
| `services/backend/src/modules/career/relations.ts` | `careerCategoryDefinitions` 제거, 새 파일 사용 |
| `services/backend/src/modules/career/view-query.ts` | 파생 부분 · `stablePropertyId` 제거, 새 파일 사용 |
| `services/backend/src/modules/career/category-move.ts` · `category-move.test.ts` | import 경로 |
| `services/backend/src/modules/career/career.test.ts` | 파생 정의 단위 테스트 |
| `services/backend/src/modules/career/career.integration.test.ts` | 기본 카테고리 v2 값 저장 통합 테스트 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 통합 테스트를 먼저 쓰고 `pnpm test:infra`(또는 해당 파일만)로 수정 전 400 실패를 본다.
2. `property-definitions.ts`를 만들고 세 곳의 파생 코드와 `stablePropertyId`를 옮긴다 — 백엔드 타입 검사 · 기존 테스트 통과(동작 변화 없음).
3. `service.ts` 검증 인자를 바꾼다 — 통합 테스트 통과.
4. 단위 테스트 추가 — `pnpm --filter @expresso/backend test`.
5. 화면 확인: 개발 서버(전용 DB · QUEUE_PREFIX, 백엔드 `CAREER_EDITOR_V2_ENABLED=true`)에서 경험 기록 상세의 '역할'을
   고치고 새로고침. 이 브랜치는 PR #83 수정이 없어 v2 꺼짐에서는 기록 상세가 로딩 문구에서 멈추므로 v2 켜짐으로 본다.
   웹 API 주소는 `localhost:4041`로 맞춘다(소켓 쿠키).

## 가장 위험한 단계

2단계. 파생 규칙을 옮기며 `view-query`의 삭제 필터나 `relations`의 반환 타입이 달라질 수 있다.
옮긴 코드는 고치지 않고, `views` · `relations` · `category-move` · `property-schema` 테스트(단위 · 통합)로 확인한다.
깨지면 2단계 커밋만 되돌리고 3단계(검증 인자 변경)는 `relations.ts`의 기존 `careerCategoryDefinitions`로 적용할 수 있다.

## 검증

```
pnpm --filter @expresso/backend typecheck
pnpm --filter @expresso/backend test
pnpm test:infra
node <노트 폴더>/career-detail-v2-off-property.mjs http://localhost:3141 <recordId>
```
