---
title: 기본 카테고리 tags 속성 표시 · 편집 수정
slug: career-tags-property
stage: plan
status: accepted
intent: .intent/intent_career-tags-property.md
spec: .intent/spec_career-tags-property.md
date: 2026-10-17
---

# 기본 카테고리 tags 속성 표시 · 편집 수정 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/backend/src/modules/career/property-definitions.ts` | 파생 `config`에 `legacyType: "tags"` |
| `services/backend/src/modules/career/career.test.ts` | 파생 정의 `legacyType` 단언 |
| `services/web/src/features/career-editor/editor/CareerDocumentEditor.tsx` | `categoryDefinitions` 파생 `config` |
| `services/web/src/features/career-editor/properties/property-editors.tsx` | `isLegacyTags` · `TagListEditor` |
| `services/web/src/features/career-editor/properties/PropertyValueEditor.tsx` | legacy tags 분기, `onCommit` 타입 |
| `services/web/src/features/career-editor/properties/PropertyList.tsx` | `saveProperty` 값 타입 |
| `services/web/src/features/career-editor/properties/properties.module.css` | `.tagList` · `.tagChip` |
| `services/web/src/features/career-editor/properties/PropertyValueEditor.test.tsx` | 자유 태그 · 다중 선택 테스트 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 백엔드 파생 규칙과 단위 테스트 — `vitest run src/modules/career` 통과.
2. 웹 테스트를 먼저 쓰고 실패를 본다(지금은 칩도 입력란도 없다).
3. `property-editors.tsx` · `PropertyValueEditor` · `PropertyList` · CSS · `categoryDefinitions` — 웹 테스트 통과.
4. 백엔드 · 웹 타입 검사와 전체 테스트, `pnpm test:infra`.
5. 화면 확인: 전용 DB 개발 서버(백엔드 `CAREER_EDITOR_V2_ENABLED=true`, 웹 API 주소 `localhost:4041`).
   API로 `metrics: ["일 1,200만 건"]`인 경험 기록을 만들고 상세에서 칩 표시 → 하나 더하기 → 하나 지우기 → 새로고침. 스크린샷.

## 가장 위험한 단계

3단계의 `onCommit` 타입 확장. `PropertyValueEditor`의 다른 분기가 `string[]`을 보내지 않는지 타입 검사로 확인하고,
`PropertyList`가 `string[]`을 그대로 `properties[key]`에 넣는지 테스트로 본다. 문제가 생기면 `TagListEditor`만
별도 `onCommitTags` 콜백으로 분리해 기존 `onCommit` 타입을 되돌린다.

## 검증

```
pnpm --filter @expresso/backend typecheck && pnpm --filter @expresso/backend test
pnpm --filter @expresso/web typecheck && pnpm --filter @expresso/web test
pnpm test:infra
```
