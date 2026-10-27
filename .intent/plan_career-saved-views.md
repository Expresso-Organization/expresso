---
title: 커리어 기록 저장된 뷰 완성
slug: career-saved-views
stage: plan
status: accepted
intent: .intent/intent_career-saved-views.md
spec: .intent/spec_career-saved-views.md
date: 2026-10-28
---

# 커리어 기록 저장된 뷰 완성 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/contracts/src/career.ts` | 휴지통 기록 · 목록 응답 스키마 (맡은 범위 밖, 계약 출처 규칙 때문에 확장) |
| `services/backend/src/modules/career/{mongo-links,service,index,routes}.ts` | 카테고리 휴지통 목록 |
| `services/backend/src/modules/career/career.integration.test.ts` | 휴지통 목록 · 복원 시험 |
| `services/web/src/app/api/career/records/route.ts` | 기록 목록 GET |
| `services/web/src/app/api/career/categories/[categoryId]/view-configurations/route.ts` | 뷰 목록 GET |
| `services/web/src/app/api/career/categories/[categoryId]/view-configurations/reorder/route.ts` | 새 파일, 순서 변경 |
| `services/web/src/app/api/career/categories/[categoryId]/trash/route.ts` | 새 파일, 휴지통 목록 |
| `services/web/src/app/api/career/records/[recordId]/restore/route.ts` | 새 파일, 복원 |
| `services/web/src/app/(app)/career/[categorySlug]/{page,CareerBrowser}.tsx` | 뷰 전체 · `?view` · 실제 page · 머리말 정리 |
| `services/web/src/app/(app)/career/[categorySlug]/DocumentPanel.tsx` | `onRecordChange` · `onCategoryChange` prop → context 제공 |
| `services/web/src/features/career-editor/properties/{record-sync.tsx,PropertyList.tsx,PropertyCreatePopover.tsx}` | 패널 결과 전달 |
| `services/web/src/features/career-editor/views/view-logic.ts` (+ test) | 필터 · 정렬 · 그룹 · 타임라인 · 기본 뷰 순수 함수 |
| `services/web/src/features/career-editor/views/{ViewTabs,FilterEditor,SortEditor,ReorderList,TrashDialog,CategoryMenu}.tsx` | 새 화면 부품 |
| `services/web/src/features/career-editor/views/{CareerViewShell,ViewToolbar,BoardView,TimelineView}.tsx` | 뷰 목록 · 검색 · 빈 화면 · 보드 · 타임라인 |
| `services/web/src/features/career-editor/views/views.module.css` | 새 부품 · 375px |
| `services/web/src/features/career-editor/views/*.test.tsx` | 탭 · 필터 · 보드 · 타임라인 · 검색 · 휴지통 시험 |

## 작업 순서

1. 계약 · 백엔드 휴지통 목록 — `pnpm --filter @expresso/backend test` 통과, 통합 시험에서 지운 기록이 목록에 나오고 복원 뒤 빠진다.
2. 웹 프록시 다섯 개 — typecheck 통과.
3. `view-logic.ts`와 단위 시험 — 연산자 표가 서버 `validateFilterOperator`와 같은 집합인지 표로 시험한다.
4. 뷰 탭 · 뷰 저장 큐 · `?view` 복원 · 기본 탭 저장 — 셸 시험.
5. 필터 · 정렬 · 그룹 편집기 — 셸 시험에서 저장 본문이 계약 스키마로 파싱된다.
6. 보드 · 타임라인 — 렌더러 시험.
7. 패널 반영 context — `DocumentPanel` 시험.
8. 검색 · 빈 화면 · 머리말 · 휴지통 대화상자 · 375px CSS.
9. `pnpm typecheck` · `pnpm test` · `pnpm test:infra`, 검증 서버 화면 확인, PR.

각 단계는 `feat:` · `fix:` 명사형 제목으로 따로 커밋한다.

## 가장 위험한 단계

4단계. 뷰 상태를 단일 뷰에서 뷰 목록으로 바꾸면 `TableView`의 열 너비 · 행 순서 저장(`onViewChange`)과 412 처리가 함께 움직인다. 기존 `CareerViewShell.test.tsx`를 먼저 통과시킨 채로 바꾸고, 깨지면 그 단계 커밋만 되돌린다.

## 검증

```bash
pnpm typecheck
pnpm test
pnpm test:infra
```

검증 서버(복사본 DB, `<이름>.localhost:<포트>`)에서 확인할 화면:

- 경험: 「＋ 뷰 추가 → 보드」 → 새 탭 → 새로고침 → 같은 탭. 탭 이름 변경 · 끌어 옮기기 · 삭제.
- 경험 표: 필터 묶음 · 다중 정렬 → 새로고침 복원.
- 경험 보드: 카드 끌기 초안 → 정리됨, 빈 열, 그룹 순서 끌기 · 숨기기.
- 학력 · 이력 타임라인: 시작 · 종료와 연도 눈금.
- 패널 제목 · 속성 수정과 새 속성 → 표 즉시 반영.
- 검색, 기록 0건 카테고리, 휴지통 복원, 375px 툴바.
