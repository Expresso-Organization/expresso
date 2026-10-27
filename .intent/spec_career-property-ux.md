---
title: 커리어 기록 속성 편집 UX 결함 수정
slug: career-property-ux
stage: spec
status: accepted
intent: .intent/intent_career-property-ux.md
date: 2026-10-28
---

# 커리어 기록 속성 편집 UX 결함 수정 — 명세

## 요구사항

- [ ] `FormulaEditor`는 저장 원문의 `prop("<UUID>")`를 `prop("<이름>")`으로 바꿔 보인다. 이름은 `JSON.stringify`로 넣어 따옴표 · 역슬래시가 왕복한다.
- [ ] 미리 보기 · 저장 직전에 표시 원문을 저장 원문(UUID)으로 되돌린다. `onCommit` · `preview`에는 저장 원문만 넘어간다.
- [ ] 없는 이름 · 겹치는 이름은 서버를 부르지 않고 그 위치의 진단(`unknown_property` · `ambiguous_property`)으로 보인다.
- [ ] 서버 진단의 `start` · `end`는 저장 원문 기준이다. 표시 원문 위치로 옮겨 보인다.
- [ ] 이름 토큰은 textarea 뒤 같은 글꼴 · 여백의 배경 층에 `<mark>`로 칠해 보인다. 자동완성 단추에서 UUID 줄을 지운다.
- [ ] 수식 · 롤업 정의가 있는 카테고리에서, 기록 버전이 저장으로 바뀌거나 계산 속성 키가 `computedProperties`에 없으면 `GET /api/career/records/:id`를 다시 읽는다. 버전이 올라가고 빠진 키가 모두 생기면 멈추고 그 기록으로 패널을 갱신한다.
- [ ] 다시 읽는 동안 문서 속성 영역은 `aria-busy="true"`이고 계산값 칸이 깜빡인다. `prefers-reduced-motion`에서는 흐리게만 보인다.
- [ ] 속성 추가 목록에 `created_time`(생성 일시 · `clock`) · `updated_time`(최종 편집 일시 · `clock-clockwise`)이 있다. 설정 없이 `system: true`로 만든다.
- [ ] 백엔드는 `system: true` 생성을 두 시각 유형에만 허용한다. 두 시각 유형의 `system` 속성은 `rename` · `reorder` · `delete` · `restore`를 허용한다. `title`과 다른 `system` 속성은 지금처럼 막는다.
- [ ] 계산 Worker는 `system` 시각 속성 값을 기록의 `createdAt` · `updatedAt`에서 읽는다. 수식 · 롤업이 이 속성을 읽을 수 있다.
- [ ] `ReadOnlyValue`는 시각 값을 로컬 `YYYY-MM-DD HH:mm`으로 보인다.
- [ ] 속성 추가 목록의 경계는 트리거의 가장 가까운 세로 스크롤 조상과 화면의 교집합이다. 아래 공간이 내용보다 작고 위가 더 넓으면 위로 연다. 높이는 고른 쪽 공간으로 제한하고 넘치면 목록 안에서 스크롤한다.

## 설계

- 수식 변환은 새 파일 `properties/formula-source.ts`에 둔다. 문자열 리터럴을 건너뛰는 관대한 스캐너가 `prop` 식별자 · `(` · 문자열 · `)`를 찾는다. 입력 중인 불완전한 수식에서도 예외를 던지지 않는다. `@expresso/editor`의 `tokenizeFormula`는 허용하지 않는 문자에서 던지므로 쓰지 않는다. 변환은 바꾼 구간 목록을 돌려주고, 그 목록으로 저장 원문 위치를 표시 원문 위치로 옮긴다.
- 이름 해석 대상은 삭제되지 않은 모든 속성이다. 자동완성 단추는 지금처럼 수식이 아닌 속성만 보인다. 두 속성이 같은 이름이면 표시할 때 UUID를 그대로 둔다.
- 계산값 재조회는 새 파일 `properties/computed-refresh.ts`의 `useComputedRefresh(record, definitions, setRecord)` 훅이 맡는다. `PropertyList`는 import 한 줄 · 호출 한 줄 · `aria-busy` 한 곳만 바뀐다. 저장된 뷰 세션이 바꾸는 저장 콜백 줄과 `onDefinitionsChange` 줄은 건드리지 않는다. 훅은 자기가 적용한 버전을 기억해 자기 갱신으로 다시 돌지 않는다. 적용할 때 패널이 더 새 버전이면 버린다.
- 재조회 간격은 outbox 전달 주기 기본값(`OUTBOX_POLL_INTERVAL_MS=1000`)이다. 마감은 전달 1초 · BullMQ 지수 재시도 첫 세 번(1 · 2 · 4초)의 합 8초에 한 간격을 더한 9초다.
- 시각 속성은 기존 `system` 시각 경로(`PropertyList.resolvedPropertyValue` · `PropertyValueEditor` 읽기 전용 분기 · `properties.ts` 쓰기 차단 · `view-query.ts`의 `$createdAt` · `CareerTableCell`)를 그대로 쓴다. 웹 · 뷰 코드는 바꾸지 않는다.
- 목록 배치는 `PropertyCreatePopover.positionPopover`만 고친다. 위로 열 때는 `bottom`으로 고정해 수식 진단이 늘어나도 트리거를 덮지 않는다. 근거 없는 220 · 360 · 520 하한을 지운다.

## 버린 대안

- 시각 속성을 `system: false`로 만들기: 모든 읽기 경로가 `system`으로 파생 여부를 가르므로 값이 「비어 있음」이 되고 표에서 편집된다. 유형만 보게 바꾸려면 `views/**`를 고쳐야 한다.
- contenteditable 칩 편집기: 커서 · 선택 · 붙여 넣기를 다시 구현해야 한다. 같은 글자 위에 배경 층을 겹치면 네이티브 textarea 동작을 그대로 쓴다.
- 계산 완료 소켓 이벤트: `modules/career-editor/**`가 다른 세션 범위다.

## 함정

- Worker의 `recompute`는 결과가 같아도 기록 `version`을 올린다. 패널이 옛 버전을 들고 있으면 다음 제목 저장(`savePatch`)이 재시도 없이 412가 된다.
- 마이그레이션 0017이 옮긴 기존 `system` 시각 속성도 이름 변경 · 삭제가 가능해진다. 값은 기록 시각에서 파생되므로 지워도 잃는 값이 없다.
- 배경 층과 textarea는 글꼴 · 여백 · 줄바꿈 규칙이 하나라도 다르면 토큰이 어긋난다. 한글이 섞이므로 mono 글꼴을 쓰지 않는다.

## 완료 기준

- `pnpm typecheck` · `pnpm test` · `pnpm test:infra` 통과.
- 검증 서버에서 intent의 개발 목표 다섯 장면을 화면으로 확인한다.
