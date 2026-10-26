---
title: 진행 현황 작업 범위 · 분량 다이어그램
slug: status-scope-diagrams
stage: spec
status: accepted
intent: .intent/intent_status-scope-diagrams.md
date: 2026-10-26
---

# 진행 현황 작업 범위 · 분량 다이어그램 — 명세

## 요구사항

- [ ] 작업 범위 지도는 `rows`(팀원 필터 적용 후) 한 줄을 칸 하나로 그린다. 칸 수와 상태별 칸 수가 `SectionCards`의 `countStates(rows)`와 같다.
- [ ] 지도는 도메인 → 주요기능(`major`) → 기능 순으로 중첩한다. 도메인 블록이 충분히 크면 머리글에 `D1 이름 · 개수`를 적는다.
- [ ] 칸을 누르면 목록 표의 행을 눌렀을 때와 같은 판정 상세 시트가 열린다.
- [ ] 번다운의 가로축은 학기 주차(2–15)이고, 세로축은 완료가 아닌 기능 수(부분 · API만 · 미구현 · 판정 전)다.
- [ ] 필요 속도는 `N = ceil(남은 수 ÷ 남은 주)`이고, 남은 주는 이번 주를 포함한 `weeks - week + 1`이다. 기능은 쪼갤 수 없으므로 올림한다. 카드에 남은 수, 남은 주, N을 함께 적는다.
- [ ] 필요 속도 선은 지금 점 `(weekPosition(generatedAt), 남은 수)`에서 학기 끝 `(weeks + 1, 0)`까지 긋는다. 가로축 범위는 `[2, weeks + 1]`, 눈금은 각 주의 시작이다.
- [ ] 실제 선의 마지막 점은 언제나 `(generatedAt, countStates(rows)의 완료 외 합)`이다. 그래서 카드의 남은 수와 같다. 팀 전체 화면에서는 그 앞에 `history`의 각 점(모든 도메인 합)을 둔다. 팀원을 고르면 이력에 팀원별 값이 없으므로 마지막 점 하나만 찍고 그 사실을 적는다.
- [ ] 팀원별 작업량은 `report.members` 순서로, 전체 `rows`를 `owner`별 상태 수로 쌓는다. 막대를 누르면 `pickMember`를 부르고, 고른 팀원을 다시 누르면 해제한다. 고른 팀원 외의 막대는 흐리게 그린다.
- [ ] 일정표는 `report.plan`을 주차 칸 위의 막대로 그린다. 팀원을 고르면 `owners`에 `*`나 그 이름이 있는 항목만 남긴다. 이번 주 위치에 세로선을 긋는다.
- [ ] 번다운과 일정표는 같은 주차 좌표를 쓴다. 주 n은 `[n, n+1)` 구간이고, 시각 t의 위치는 `weekPosition(t) = 2 + (t - week2Start) / 7일`이다. `week2Start`는 지금처럼 현지 시각 자정으로 읽는다. 「N주차」 배지의 `semesterWeek`는 `floor(weekPosition(now))`로 바꿔 계산을 한 곳에 둔다. 이번 주 세로선은 `weekPosition(now)`에 긋는다. 그래서 선이 언제나 배지와 같은 주의 칸 안에 있다.
- [ ] 라이트 · 다크에서 색은 기존 `STATE_COLOR`(`--viz-*`)만 쓰고, 375px 폭에서 가로 스크롤이 생기지 않는다.

## 설계

- `src/lib/scope.ts`(새 파일, 별칭 없이 상대 경로만 가져와 `node --test`로 돈다)
  - `squarify(items, rect)`: 값이 있는 항목을 사각형 안에 나누는 squarified 배치
  - `weekPosition(t, week2Start)`: 시각을 주차 좌표로 바꾼다. `data.ts`의 `semesterWeek`도 이 값을 내림해서 쓴다
  - `pace(remaining, week, weeks)`: 필요 속도 `{ weeksLeft, perWeek }`
- `src/components/status/scope.tsx`(새 파일)
  - `ScopeMap`: 컨테이너 폭을 `ResizeObserver`로 재고, `squarify`를 세 번 겹쳐 절대 위치 `button`으로 그린다
  - `Burndown`: Recharts `LineChart`, 숫자형 X축
  - `Workload`: Recharts `BarChart layout="vertical"`
  - `PlanTimeline`: CSS 그리드와 div로 그린다
- 판정 상세 시트를 `ListTabs`에서 꺼낸다. `featureDetail(row, report)`와 `DetailSheet`를 export하고, 상태는 `Dashboard`가 갖는다. `ListTabs`와 `ScopeMap` 모두 `onDetail`을 부른다.
- `App.tsx`의 배치
  - 할 일 아래에 `#scope` 구역을 둔다. 지도(2칸)와 작업량(1칸)이 한 줄, 번다운과 일정표가 한 줄이다.
  - 사이드바 바로가기에 「작업 범위」를 더한다.
- 테스트 `src/lib/scope.test.ts`를 `package.json` `test`에 더한다. `node:test`의 타입은 `@types/node`에 있다. 그래서 `tsconfig.app.json`에서 이 파일을 빼고 `tsconfig.scanner.json`(`types: ["node"]`)에 넣는다.

## 버린 대안

- Recharts `Treemap`
  - `flat` 형식은 부모 사각형 위에 자식이 덮여 도메인 머리글을 남길 자리가 없다.
  - 칸마다 접근 가능한 버튼과 키보드 포커스를 주기도 어렵다.
- 번다운을 팀원별로 그리려고 이력에 팀원별 합계를 추가하는 방법. intent가 스캐너와 결과 형식 변경을 범위 밖으로 두었다.

## 함정

- `ADM`은 담당자가 넷이다. 그래서 도메인 합계로는 팀원별 값을 만들 수 없다.
- `history`는 지금 한 점(2026-10-25)이다. 이력 선은 점 하나로만 보인다.
- 학기가 끝나 `week > weeks`이면 `weeksLeft`가 0 이하가 된다. 이때는 속도 대신 "학기 종료"를 적는다.
- 판정 전 기능(`judgment === null`)은 남은 작업에 넣고, 지도에서는 `muted` 색으로 그린다.
- 작은 도메인 블록에는 머리글을 넣지 않는다. 너무 작은 칸에는 테두리 간격을 줄인다.

## 완료 기준

- `pnpm typecheck` · `pnpm test` · `pnpm build`가 통과한다(`services/dev-portal/status`).
- 운영 `report.json`으로 띄운 화면에서 요구사항을 하나씩 확인한다. 2026-10-26 데이터에서는 다음 값이 나와야 한다.
  - 상태별 칸이 완료 12 · 부분 93 · API만 29 · 미구현 75다
  - 번다운이 "주당 33개"(197 ÷ 6)다
  - 일정표 세로선이 10주 칸 안에 있다
