---
title: 커리어 기록 속성 편집 UX 결함 수정
slug: career-property-ux
stage: plan
status: accepted
intent: .intent/intent_career-property-ux.md
spec: .intent/spec_career-property-ux.md
date: 2026-10-28
---

# 커리어 기록 속성 편집 UX 결함 수정 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/features/career-editor/properties/formula-source.ts` | 새 파일. 저장 원문 ↔ 표시 원문 변환 · 위치 옮기기 · 이름 진단 |
| `services/web/src/features/career-editor/properties/formula-source.test.ts` | 새 파일. 왕복 · 따옴표 이름 · 문자열 안 `prop` · 없는 · 겹치는 이름 · 위치 |
| `services/web/src/features/career-editor/properties/FormulaEditor.tsx` | 표시 원문 편집 · 토큰 배경 층 · 진단 위치 옮기기 |
| `services/web/src/features/career-editor/properties/FormulaEditor.test.tsx` | 이름 삽입 · UUID 저장 · 클라이언트 진단 시험 |
| `services/web/src/features/career-editor/properties/computed-refresh.ts` | 새 파일. `useComputedRefresh` |
| `services/web/src/features/career-editor/properties/computed-refresh.test.tsx` | 새 파일. 버전 · 키 대기 · 자기 갱신 무시 · 마감 · 계산 작업 없는 저장 · 관계 저장 |
| `services/web/src/features/career-editor/properties/PropertyList.tsx` | 훅 호출 · `aria-busy` · 시각 · 수식 · 롤업 아이콘(속성 추가 목록과 같은 아이콘) |
| `services/web/src/features/career-editor/properties/PropertyValueEditor.tsx` | 계산값에 `computed` 표시 · 시각 형식 함수 이동 · 값을 바꾸지 않고 칸을 떠나면 저장 생략 |
| `services/web/src/features/career-editor/properties/PropertyValueEditor.test.tsx` | 시각 형식 · 저장 생략 시험 |
| `services/web/src/features/career-editor/properties/property-editors.tsx` | `formatTimestamp` · `ReadOnlyValue`의 시각 형식 · `data-computed` |
| `services/web/src/features/career-editor/properties/PropertyCreatePopover.tsx` | 시각 유형 두 개 · 스크롤 조상 경계 배치 |
| `services/web/src/features/career-editor/properties/PropertyCreatePopover.test.tsx` | 시각 유형 생성 요청 시험 |
| `services/web/src/features/career-editor/properties/properties.module.css` | 토큰 배경 층 · 계산 중 깜빡임 |
| `services/backend/src/modules/career/property-schema.ts` | 시각 `system` 생성 · 변경 허용 |
| `services/backend/src/modules/career/property-schema.test.ts` 또는 통합 시험 | 허용 · 차단 경계 |
| `services/backend/src/modules/career-computation/service.ts` | `system` 시각 값 파생 |
| `services/backend/src/modules/career-computation/service.test.ts` 또는 통합 시험 | 생성 일시를 읽는 수식 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. `formula-source.ts`와 시험 — `pnpm --filter @expresso/web exec vitest run formula-source` 통과
2. `FormulaEditor` 연결 — 기존 · 새 `FormulaEditor.test.tsx` 통과
3. 백엔드 시각 속성 허용 · 계산 파생 — 백엔드 단위 · 통합 시험 통과
4. 속성 추가 목록 시각 유형 · 배치 — `PropertyCreatePopover.test.tsx` 통과
5. `useComputedRefresh` · `PropertyList` 연결 — 훅 시험 통과
6. 검증 서버(복사 DB · API · Worker · 웹)에서 개발 목표 다섯 장면 확인
7. `pnpm typecheck` · `pnpm test` · `pnpm test:infra` → 커밋 · PR · CI · 머지

## 가장 위험한 단계

5단계. 재조회가 자기 갱신으로 다시 돌면 9초마다 요청이 끝없이 이어진다. 훅 시험에 「적용한 버전으로 다시 그려도 요청하지 않는다」를 넣는다. 깨지면 `PropertyList`의 훅 호출 한 줄을 빼서 되돌린다.

## 검증

```
pnpm typecheck
pnpm test
pnpm test:infra
```

화면: 문서 패널 → 속성 추가 → 수식 → 「숫자」 단추 → 저장 → 값 갱신 확인. 표 머리글에서 「숫자」 이름 변경 → 계산값 유지. 속성 추가 → 생성 일시 → 읽기 전용 값. 패널을 맨 아래로 스크롤한 뒤 속성 추가 → 롤업까지 보이는지.
