---
title: 커리어 기록 편집기 디자인 시스템 정합
slug: career-editor-design-polish
stage: plan
status: accepted
intent: .intent/intent_career-editor-design-polish.md
spec: .intent/spec_career-editor-design-polish.md
date: 2026-11-20
---

# 커리어 기록 편집기 디자인 시스템 정합 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/features/career-editor/views/ValuePopouts.tsx` (새) | 표 셀에서 옮긴 옵션 · 날짜 팝업과 위치 · 키보드 훅. 달력은 폭 286px · 높이 어림 380px로 고정(넓은 앵커에서 날짜 칸이 팝업 밖으로 넘치던 문제) |
| `services/web/src/features/career-editor/views/RecordSelectBox.tsx` (새) | 표 · 보드 · 타임라인 공용 선택 상자 |
| `services/web/src/features/career-editor/views/CareerTableCell.tsx` | 팝업을 `ValuePopouts`에서 가져오기, 날짜 칸을 `formatPeriodRange`로 |
| `services/web/src/features/career-editor/views/view-logic.ts` | `formatPeriodRange` 추가 |
| `services/web/src/features/career-editor/views/GalleryView.tsx` | 지역 기간 포맷을 `formatPeriodRange`로 |
| `services/web/src/features/career-editor/views/TableView.tsx` | 선택 상자를 `RecordSelectBox`로, 첫 칸 폭을 CSS 변수로 |
| `services/web/src/features/career-editor/views/BoardView.tsx` · `TimelineView.tsx` | 선택 상자를 `RecordSelectBox`로 |
| `services/web/src/features/career-editor/views/views.module.css` | 화면 제목 크기, 보드 이동 단추 겹치기, 카드 선택 상자 보이기, 좁은 화면 행 조작 칸 |
| `services/web/src/features/career-editor/properties/PropertyValueEditor.tsx` | 다중 선택 · 날짜를 트리거 + 팝업으로 |
| `services/web/src/features/career-editor/properties/properties.module.css` | 트리거 · 칩 스타일, 옛 체크박스 · 날짜 입력 스타일 정리 |
| `services/web/src/features/career-editor/editor/CareerDocumentEditor.tsx` · `.module.css` | 속성을 `.content` 안으로, side menu 여백, peek에서 `topRow` 제거 |
| `services/web/src/app/(app)/career/[categorySlug]/DocumentPanel.tsx` · `.module.css` | 머리말에 「이력」, 본문 좌우 여백 0 |
| 관련 `*.test.tsx` | 바뀐 마크업에 맞춘 조회 수정 |

## 작업 순서

1. 팝업을 `ValuePopouts.tsx`로 옮기고 표가 가져다 쓴다 — `TableView.test.tsx`가 그대로 통과한다.
2. `formatPeriodRange`를 만들고 표 · 갤러리에 적용한다 — `view-logic.test.ts`에 경우를 더한다.
3. `PropertyValueEditor`의 다중 선택 · 날짜를 트리거 + 팝업으로 바꾼다 — 패널에서 역량 추가 · 시기 변경 후 새로고침해 값이 남는지 본다.
4. 문서 한 열 정렬과 「이력」 이동 — 패널 · 전체 페이지에서 제목 · 본문 x 좌표를 JS로 잰다.
5. `RecordSelectBox`로 표 · 보드 · 타임라인 선택 상자를 바꾸고 보드 이동 단추를 겹친다 — 보드 · 타임라인 캡처.
6. 화면 제목 크기와 좁은 화면 행 조작 칸 — 1440 · 390 캡처.
7. 검증 — 타입 검사 · 테스트 · 전후 캡처 비교.

## 가장 위험한 단계

3단계. 패널 속성 편집은 실시간 저장 · 계산 갱신과 묶여 있다. 팝업이 고를 때마다 커밋하면 버전 충돌이나 중복 저장이 날 수 있다. 표가 같은 팝업으로 이미 같은 방식(고를 때마다 `onCommit`)을 쓰므로 그 경로를 따른다. 깨지면 이 단계 커밋만 되돌린다. 1 · 2단계와 나머지는 서로 기대지 않는다.

## 검증

```
pnpm typecheck
pnpm test
```

화면: `http://localhost:3131/career/experience`(표 · 보드 · 타임라인 · 패널), `/career/project`(갤러리), `/career/records/<id>`(전체 페이지)를 1440×940 밝은 · 어두운, 390×844에서 캡처한다.
