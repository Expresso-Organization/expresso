---
title: 진행 현황 작업 범위 · 분량 다이어그램
slug: status-scope-diagrams
stage: plan
status: accepted
intent: .intent/intent_status-scope-diagrams.md
spec: .intent/spec_status-scope-diagrams.md
date: 2026-10-26
---

# 진행 현황 작업 범위 · 분량 다이어그램 — 구현 계획

## 바뀌는 파일

`services/dev-portal/status/` 기준 경로다. 빌드 결과는 `docs/status/`에 들어간다.

| 파일 | 무엇을 |
|---|---|
| `src/lib/scope.ts` | `squarify` · `weekPosition` · `pace` · `remainingOf` (새 파일) |
| `src/lib/scope.test.ts` | 위 함수 단위 테스트 (새 파일) |
| `src/lib/data.ts` | `semesterWeek`가 `weekPosition`을 내림해서 쓴다. `Data.loadedAt`(데이터를 받은 시각)을 더해 화면의 「지금」으로 쓴다 — 렌더 중에 `Date.now()`를 부르면 `react-hooks/purity`에 걸린다 |
| `src/components/status/scope.tsx` | `ScopeMap` · `Burndown` · `Workload` · `PlanTimeline` (새 파일). 번다운과 일정표에 이번 주 칸 음영을 같이 깐다 — 지금 선이 몇 주차 안에 있는지 보이게 |
| `src/components/status/data-table.tsx` | `featureDetail` · `DetailSheet` export, `ListTabs`는 `onDetail`을 받는다 |
| `src/App.tsx` | 상세 시트 상태를 `Dashboard`로 올리고 `#scope` 구역을 배치한다. 주차 배지도 `loadedAt` 기준 |
| `src/components/status/app-sidebar.tsx` | 바로가기에 「작업 범위」를 더한다 |
| `tsconfig.app.json` · `tsconfig.scanner.json` | `src/**/*.test.ts`를 앱 설정에서 빼고 스캐너 설정에 넣는다 |
| `package.json` | `test`에 `src/lib/*.test.ts`를 더한다 |
| `docs/status/index.html` · `docs/status/assets/*` | `pnpm build` 결과 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. `scope.ts`와 테스트를 쓴다. `pnpm test`로 확인한다. 확인할 것은 다음 넷이다.
   - `squarify` 사각형 넓이의 합이 전체와 같다
   - 사각형끼리 겹치지 않는다
   - `pace(197, 10, 15)`가 `{ weeksLeft: 6, perWeek: 33 }`이다
   - 학기가 끝나면 `null`이다
2. `semesterWeek`를 `weekPosition` 기준으로 바꾼다. `pnpm typecheck`로 확인한다.
3. 상세 시트를 `Dashboard`로 올린다. 목록 표에서 행을 눌러 시트가 그대로 열리는지 확인한다.
4. `scope.tsx`의 네 그림을 만들고 `App.tsx` · 사이드바에 연결한다.
5. 운영 데이터를 `docs/status/data/`(git 제외)에 받아 `pnpm dev`로 띄운다. spec의 완료 기준을 하나씩 본다.
6. `pnpm build`를 하고 `docs/status/`를 함께 커밋한다.

## 가장 위험한 단계

4단계 `ScopeMap`이다.

- 폭을 잰 다음에 그리므로 첫 렌더에서 폭이 0이면 빈 칸이 된다. 폭이 0이면 그리지 않고 기다린다.
- 375px 폭에서는 209칸이 한 칸 약 25px로 작아진다. 칸 사이 간격과 머리글 높이가 칸을 덮으면 간격을 줄인다.
- 깨지면 `#scope` 구역 하나만 빼서 되돌릴 수 있다. 다른 구역은 3단계 외에 바뀌지 않는다.

## 검증

```
cd services/dev-portal/status
pnpm typecheck
pnpm test
pnpm build
```

화면에서 확인할 것

- 「진행 현황」에서 지도를 본다.
  - 범례 개수가 카드와 같다
  - 칸을 누르면 상세 시트가 열린다
- 번다운 숫자를 확인한다.
- 작업량에서 채서현 막대를 누른다.
  - 헤더에 채서현 배지가 붙는다
  - 지도와 일정표가 바뀐다
- 일정표의 세로선 위치를 본다.
- 다크 테마와 375px 폭에서 다시 본다.
