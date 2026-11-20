---
title: 커리어 기록 편집기 디자인 시스템 정합
slug: career-editor-design-polish
stage: spec
status: accepted
intent: .intent/intent_career-editor-design-polish.md
date: 2026-11-20
---

# 커리어 기록 편집기 디자인 시스템 정합 — 명세

## 요구사항

- [ ] `PropertyValueEditor`의 `multi_select` · `date`가 `input[type=checkbox]` · `input[type=date]`를 그리지 않는다.
- [ ] 두 값은 트리거 단추 하나로 보인다. 다중 선택은 칩, 날짜는 `YYYY.MM – YYYY.MM`, 비었으면 「비어 있음」이다. 누르면 표와 같은 `OptionPopout` · `DatePopout`이 단추에 붙어 열린다.
- [ ] 팝업에서 고른 값은 기존 `onCommit`으로 저장되고, 옵션 만들기는 기존 `onCreateOption`을 쓴다.
- [ ] 문서(`CareerDocumentEditor`)는 peek · page 모두 제목 · 속성 · BlockNote 본문을 한 열(`.content`)에 둔다. 본문 첫 글자 x가 제목 x와 같다(±1px).
- [ ] peek에서 「이력」은 패널 머리말(`DocumentPanel` `.headRight`)에 있고, 본문 위 별도 줄은 없다.
- [ ] `BoardView` · `TimelineView` 카드의 선택 상자는 표의 `.rowCheckbox` 모양이다. 고르지 않은 카드에서는 호버 · 포커스 때만 보인다.
- [ ] 보드 카드의 이동 단추는 카드 흐름에서 빠져(겹쳐 놓임) 빈 줄을 만들지 않는다.
- [ ] 표 날짜 칸과 갤러리가 같은 기간 포맷 함수를 쓴다.
- [ ] `.categoryIntro h1`이 `--ex-text-3xl`이다.
- [ ] 767px 이하에서 행 조작 칸이 36px이고 추가 · 끌기 단추는 숨는다. 고정 제목 열의 `left`가 같은 값을 따른다.
- [ ] 새 색 · 크기 리터럴을 만들지 않는다(`tokens.test.ts` 통과).

## 설계

재사용을 먼저 한다.

- **팝업 분리(재사용)**: `CareerTableCell.tsx`의 `usePopoverPosition` · `usePopupKeyboard` · `movePopupFocus` · `OptionPopout` · `DatePopout`을 `views/ValuePopouts.tsx`로 옮겨 내보낸다. 표는 그대로 가져다 쓴다. 스타일은 `views.module.css`의 `.cellPopout` 계열을 그대로 쓴다. 팝업 props는 `onCommit(value: CareerPropertyValueV2 | null)`이라 두 곳에 같은 모양이다.
- **속성 트리거(바뀜)**: `PropertyValueEditor`에 `multi_select` · `date` 분기를 `ValueTrigger`(단추 + 열림 상태 + 앵커 ref)로 바꾼다. 칩은 `properties.module.css`에 표의 `.tableTags small`과 같은 값으로 둔다. 다중 선택 팝업은 고를 때마다 커밋하므로 `commit()`의 검증 · 오류 표시를 그대로 탄다.
- **기간 포맷(바뀜)**: `view-logic.ts`에 `formatPeriodRange(start, end)`를 두고 `GalleryView`의 지역 `format` · `CareerTableCell`의 `CellDisplay` 날짜 · 새 트리거가 쓴다. 타임라인 축은 일 단위가 필요해 그대로 둔다.
- **한 열 문서(바뀜)**: `CareerDocumentEditor`에서 `PropertyList`를 `.content` 안으로 옮긴다. `.bn-editor`의 기본 `padding-inline: 54px`를 0으로 하고, 블록 단추(side menu)가 들어갈 자리는 `.content`의 좌우 48px(간격 척도 값)로 준다. peek에서는 `DocumentPanel .body`의 좌우 여백을 0으로 해 여백을 `.content` 한 곳에서만 준다. page의 `topRow`는 `.content` 안 맨 위로 옮긴다.
- **이력 위치(바뀜)**: `CareerDocumentEditor`는 peek에서 `topRow`를 그리지 않고, `DocumentPanel` 머리말이 `RevisionHistory`를 저장 상태 옆에 그린다.
- **선택 상자(재사용)**: `views/RecordSelectBox.tsx`가 표 행의 `label.rowCheckbox` 마크업을 그린다. 표 · 보드 · 타임라인이 같이 쓴다. 보이기 규칙은 각 카드 선택자(`.board article:hover` 등)가 정한다.
- **좁은 화면 표(바뀜)**: `TableView`의 grid template 첫 칸을 `var(--table-controls, 96px)`로 쓰고, 고정 제목 열 `left`도 같은 변수를 쓴다. 767px 미디어 쿼리에서 변수를 36px로 바꾸고 `.rowAddButton` · `.rowDragHandle`을 숨긴다.

## 버린 대안

- 패널용 날짜 · 옵션 편집기를 새로 만든다: 표와 패널이 다른 컨트롤을 갖게 되는 지금 문제를 다시 만든다.
- 본문을 제목에 맞추려고 제목 · 속성에 54px를 더한다: 여백이 두 군데서 계산되어 page에서 또 어긋난다. 여백은 `.content` 한 곳에서 준다.
- 표 날짜를 일 단위(`2025.03.01`)로 쓴다: 갤러리 · 정의서가 월 단위이고 칸 폭에서 다시 잘린다.

## 함정

- BlockNote side menu는 `.bn-editor` 왼쪽 바깥에 뜬다. peek의 스크롤 컨테이너(`DocumentPanel .body`)가 가로를 자르므로 48px 안에 단추가 들어가는지 화면에서 확인한다.
- `PropertyValueEditor`의 `useEffect`가 값이 바뀌면 초안을 되돌린다. 트리거 방식은 초안이 없어 영향이 없지만, 팝업이 열린 채 값이 갱신되어도 닫히지 않아야 한다.
- 팝업은 `document.body` 포털이다. 패널의 `pointerdown` 바깥 닫기와 겹치지 않는지 본다.
- 기존 테스트가 `input[type=date]` · 체크박스 role을 찾을 수 있다. 바뀐 마크업에 맞게 고친다.

## 완료 기준

- `pnpm typecheck`와 `pnpm test`가 통과한다.
- 로컬(1440×940 밝은 · 어두운, 390×844)에서 패널 · 전체 페이지 · 보드 · 타임라인 · 표를 전후로 캡처해 위 요구사항을 하나씩 확인한다.
- 패널에서 역량 추가 · 시기 변경이 새로고침 뒤에도 남는다.
