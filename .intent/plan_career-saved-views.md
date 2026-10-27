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
| `services/backend/src/modules/career/{view-query,views.test}.ts` | 구현 중 추가: 값을 고르지 않은 필터 조건을 서버도 무시(화면과 같은 결과) |
| `services/web/src/app/api/career/view-configurations/[viewId]/route.ts` (+ test) | 구현 중 추가: 본문 없는 DELETE에 content-type을 붙여 400이 나던 결함 |
| `services/web/src/features/career-editor/views/{TableView,GalleryView,AnchoredMenu,CategoryMenu}.tsx` | 구현 중 추가: 빈 그룹 키 공유, 갤러리 기술 태그 옵션 이름, 탭 · 머리말 메뉴 |

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

구현 중 바뀐 결정:

- 타임라인 기본 시작 속성은 「첫 날짜 속성」이 아니라 「기록이 가장 많이 채운 날짜 속성」이다. 체험 DB의 학력 · 이력은 「기간」이 비어 있고 「시작 월」 · 「종료 월」에 값이 있어, 첫 속성을 고르면 다시 「날짜 없음」이 된다. 종료는 모든 기록에서 시작 이후인 다른 날짜 속성이다.
- 뷰 순서 변경은 한 번에 하나만 보내고, 보내는 동안 쌓인 순서는 마지막 것만 보낸다. 연속 이동이 카테고리 버전 412를 내던 경쟁을 없앤다.

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
