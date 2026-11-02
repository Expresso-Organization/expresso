---
title: 커리어 보기의 선택 속성 이름 표시
slug: career-option-labels
stage: plan
status: accepted
intent: .intent/intent_career-option-labels.md
spec: .intent/spec_career-option-labels.md
date: 2026-11-02
---

# 커리어 보기의 선택 속성 이름 표시 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/features/career-editor/views/view-types.ts` | `propertyDefinition` · `propertyLabels` · `propertyText` 추가 |
| `services/web/src/features/career-editor/views/view-types.test.ts` | 새로 · 세 함수 단위 테스트 |
| `services/web/src/features/career-editor/views/GalleryView.tsx` | 기술 칩 · 일반 갤러리 미리보기 |
| `services/web/src/features/career-editor/views/ListView.tsx` | 속성 미리보기 |
| `services/web/src/features/career-editor/views/BoardView.tsx` | 열 이름(PR 141 뒤에는 그 PR의 이름 지도를 함수로 바꿈) |
| `services/web/src/features/career-editor/views/CareerTableCell.tsx` | `labels` 지도 대신 `propertyLabels` |
| 갤러리 렌더 테스트(기존 `CareerViewShell.test.tsx`에 추가) | 칩에 UUID 없음 |

## 작업 순서

1. PR 141 머지 여부를 받는다. 머지하면 `origin/main`을 받아 브랜치 `fix/career-option-labels`를 딴다.
2. 체험 DB 복사본에서 다중 선택 값이 모두 선택지 ID인지 센다 — 이름 문자열이 있으면 함정의 규칙을 적용한다.
3. `view-types.ts` 세 함수와 단위 테스트 — 테스트 통과.
4. 보기 네 곳과 표 셀을 바꾼다 — `grep -n "displayValue(rawValue" views/`가 정의를 모르는 표시 자리를 남기지 않는다.
5. 갤러리 렌더 테스트.
6. 로컬 서버에서 프로젝트 갤러리 · 스킬 보드 · 목록 보기를 연다.
7. 검증 · 커밋 · 푸시 · PR.

## 가장 위험한 단계

4단계. 표 셀이 지운 선택지 ID를 보이던 것을 버리게 바뀌면, 값이 있는데 칸이 빈 것처럼 보인다. 지운 선택지를 가리키는 값이 실제로 있는지 2단계에서 함께 세고, 있으면 표 셀은 이 변경에서 빼고 따로 다룬다. 되돌릴 때는 표 셀 변경만 되돌린다.

## 검증

```
pnpm --filter @expresso/web typecheck
pnpm --filter @expresso/web test
```

화면: 복사본 DB 로컬 서버에서 `/career/project`(갤러리) 카드에 기술 이름 칩이 보이고 UUID가 없다. `/career/skill_tool`(보드) 열 제목이 「분류」 선택지 이름이다. 목록 보기로 바꿔 다중 선택 속성을 표시하면 이름이 보인다.
