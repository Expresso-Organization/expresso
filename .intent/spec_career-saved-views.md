---
title: 커리어 기록 저장된 뷰 완성
slug: career-saved-views
stage: spec
status: accepted
intent: .intent/intent_career-saved-views.md
date: 2026-10-28
---

# 커리어 기록 저장된 뷰 완성 — 명세

## 요구사항

- [ ] `page.tsx`가 카테고리의 저장 뷰 전체를 불러와 `CareerViewShell`에 넘기고, `?view=<id>`가 있으면 그 뷰로 연다.
- [ ] 저장 뷰가 0개이면 `OFFERED[category.key]` 종류마다 `local-<type>` 뷰를 탭으로 보인다. 그중 하나를 처음 바꿀 때 기본 탭 전부를 순서대로 POST하고 로컬 ID를 서버 ID로 바꾼다.
- [ ] 「＋ 뷰 추가」는 종류를 고르는 메뉴를 열고, 고른 종류의 새 뷰를 POST한 뒤 그 탭으로 간다. 복제는 탭 메뉴로 옮긴다.
- [ ] 탭 메뉴: 이름 변경 · 종류 변경 · 복제 · 삭제. 마지막 뷰는 삭제할 수 없다. 탭 끌어 옮기기와 `Alt+←/→`로 순서를 바꾸고 `reorder`를 호출한다. 응답의 뷰 전부로 교체하고 `category.version`을 1 올린다.
- [ ] 필터: 최상위 묶음(그리고/또는) 안에 조건 줄과 한 단계 하위 묶음. 연산자 집합과 operand 모양은 `view-query.ts`의 `validateFilterOperator` · `operandValue`와 같다. 빈 묶음은 저장 전에 지우고, 조건이 하나도 없으면 `filter: null`. 조건은 20개까지.
- [ ] 정렬: 여러 줄, 방향 · 빈 값 위치, 끌어 옮기기로 우선순위. 10개까지.
- [ ] 그룹: 그룹 속성(상태 · 선택 · 체크박스)을 고르면 그룹 값 목록이 나오고, 끌어서 `groupOrder`를, 보드에서는 눈 단추로 `board.hiddenGroupIds`를 바꾼다. 둘 다 원시 키(옵션 UUID · 상태 값 · `true`/`false`)를 담는다.
- [ ] 보드: 그룹 속성이 없으면 상태로 묶는다. 열은 정의의 모든 값 + 「없음」(선택만)을 `groupOrder` 순으로 보이고, 숨긴 열은 뺀다. 카드를 끌어 놓으면 그룹 값을 바꾸고 `board.cardOrder`에 위치를 남긴다. ← · →는 옆 열로 옮긴다.
- [ ] 타임라인: 뷰 종류가 `timeline`이 되는 모든 경로(생성 · 종류 변경 · 기본 탭)에서 `timeline.startPropertyId`를 첫 날짜 속성으로 채운다. 날짜 속성이 없으면 타임라인 종류를 고를 수 없다. 시작 속성 값의 `end`, 또는 `endPropertyId` 값의 `start`가 종료다. `axisStart` · `axisEnd` 밖의 기록은 숨긴다. 날짜 없는 기록은 축 아래 따로 둔다.
- [ ] 패널 반영: `PropertyList`의 저장 결과와 속성 · 옵션 생성 결과가 `CareerViewShell`의 `records` · `category`에 들어간다. 새 속성 ID는 지금 뷰의 `visiblePropertyIds` · `propertyOrder` 끝에 붙는다.
- [ ] 검색: 툴바 입력란, 제목과 `bodyMd` 글자에서 대소문자 무시 포함 검색. 주소 `?q=`와 맞춘다.
- [ ] 휴지통: `GET /career/categories/:categoryId/trash`가 이 카테고리의 지운 기록을 `deletedAt` 내림차순으로 돌려준다. 웹은 대화상자에서 남은 날을 보이고 `POST /career/records/:id/restore`로 복원한다.
- [ ] 머리말: 「공유」 · 시계 아이콘 제거, 「…」은 휴지통 메뉴.
- [ ] 빈 화면: 기록 0건이면 첫 기록 화면. 기록은 있는데 숨겨졌으면 검색 · 빠른 필터 · 뷰 필터 중 걸린 것마다 지우는 단추.
- [ ] 375px에서 툴바 단추가 `nowrap`이고 툴바 줄이 가로 스크롤된다.

## 설계

- **뷰 목록 상태**는 `CareerViewShell`이 가진다(`views`, `activeViewId`). 렌더러 props(`CareerViewRendererProps`)는 바꾸지 않고 활성 뷰만 넘긴다.
- **뷰 저장 큐**: 뷰마다 저장 중이면 다음 값을 대기열에 두고, 응답 버전으로 이어서 보낸다. 연속 입력이 412를 만들지 않게 한다. 카테고리 버전 412는 `/api/career/categories`로 버전을 다시 읽고 한 번 재시도한다.
- **필터 · 정렬 · 그룹 계산**은 `views/view-logic.ts` 순수 함수로 모은다: 연산자 표, operand 생성, 필터 평가, 정렬, 그룹 키 · 표시 이름, 타임라인 날짜 해석, 기본 뷰 생성. `CareerViewShell`의 `matchesSavedFilter` · `sortedRecords`는 이 모듈로 옮긴다.
- **끌어 옮기기**: `views/ReorderList.tsx`(도메인을 모르는 목록, 손잡이 끌기 + `Alt+↑/↓`)를 정렬 · 그룹 순서에 쓴다. 탭과 보드 카드는 HTML5 drag and drop을 직접 쓴다(`TableView`와 같은 방식).
- **패널 반영**: `PropertyList`는 `editor/CareerDocumentEditor.tsx`(수정 금지) 아래에 있어 prop을 내릴 수 없다. `properties/record-sync.tsx`에 `CareerRecordSyncContext { onRecordChange, onCategoryChange }`를 두고 `DocumentPanel`이 제공, `PropertyList`가 소비한다. `PropertyCreatePopover.onDefinitionsChange`에 두 번째 인자로 카테고리를 넘긴다. `PropertyList`는 `record.version`이 더 크면 받은 기록으로 맞춘다(표에서 고친 값이 패널에 보이게).
- **기록 원본**은 지금처럼 기록 목록 API다. 뷰 query는 표시 속성만 projection하므로 패널 속성이 빠진다. `page.tsx`가 실제 `page`를 넘기고 「더 보기」는 `GET /api/career/records?categoryId&cursor`로 100건씩 붙인다. `listItem()`은 목록 전용 칸을 덮지 않게 바꾼다.
- **휴지통 계약**: `packages/contracts`에 `CareerTrashedRecordSchema`(`CareerRecordSchema` + `deletedAt` · `purgeAfter`)와 목록 응답을 더한다. 백엔드는 `mongo-links.ts` 옆에 `listTrashedMongoRecords`, `service.ts` · `index.ts`(CareerApi) · `routes.ts`에 연결한다.
- **웹 프록시**: 뷰 목록 GET · reorder POST · 휴지통 GET · 복원 POST · 기록 목록 GET을 더한다.

## 버린 대안

- 뷰 목록 GET에서 기본 뷰를 서버가 만들어 두기: 읽기 요청이 쓰기를 하고, 이미 뷰 하나를 저장한 사용자와 규칙이 갈린다.
- 탭 전환 때 뷰 query로 기록 읽기: 서버 필터 · 정렬은 맞지만 projection이 표시 속성만 남겨 패널 속성이 빈다.
- 검색을 뷰 query `q`로: 위와 같은 이유로 기록 원본을 바꿔야 한다.
- 패널 반영을 `window` 이벤트로: 전역 이름 충돌과 해제 누락 위험. context는 패널 범위로 묶인다.

## 함정

- 서버 `compile`은 지운 속성 ID · 타입이 안 맞는 operand · 날짜 아닌 타임라인 속성을 400으로 거절한다. 저장 전에 같은 규칙으로 걸러야 한다.
- `reorder`는 모든 뷰 버전과 카테고리 버전을 올린다.
- 선택 값은 옵션 UUID다. `displayValue(rawValue)`로 그리면 UUID가 보인다.
- `created_time` · `updated_time`은 서버 필터에서 Date와 문자열을 비교하게 되어 필터 속성 목록에서 뺀다(정렬은 된다).
- 테스트 fetch 목은 모르는 URL에 뷰 객체를 돌려준다. 새 URL마다 분기를 둔다.

## 완료 기준

```bash
pnpm typecheck   # 오류 0
pnpm test        # 전부 통과
pnpm test:infra  # 전부 통과
```

검증 서버에서 intent의 「개발 목표」 여섯 장면을 화면으로 확인하고 스크린샷을 PR에 붙인다.
