---
title: 공고 분석 화면 충족 지도와 원문 근거 표시
slug: analyze-coverage-map
stage: spec
status: draft
intent: .intent/intent_analyze-coverage-map.md
date: 2026-11-07
---

# 공고 분석 화면 충족 지도와 원문 근거 표시 — 명세

## 요구사항

- [ ] `calculateRequirementCoverage`가 `keywords`를 받는다. 라벨 또는 인용에 든 공고 키워드가 하나 이상이고 모두 기록 전체에서 찾히면 `covered`이며, `coveredBy`는 키워드가 하나라도 든 기록이다.
- [ ] 키워드가 없거나 일부만 찾히면 기존 토큰 규칙으로 판정한다.
- [ ] `JobAnalysisResultSchema`에 `sourceText: string | null`을 더한다. 값은 공고 `descriptionRaw`이다.
- [ ] 원문 표시는 `sourceSpan`의 코드 포인트 위치를 그대로 쓴다. 겹치는 구간은 앞 구간이 이기고 뒤 구간은 잘린다.
- [ ] 화면의 요건 순서는 추출 순서를 유지하되 필수 → 우대 → 톤으로 묶는다. 막대 칸은 목록과 같은 순서이다.
- [ ] 키보드로 요건 행에 초점이 가면 원문 문장이 강조된다. 움직임 줄이기 설정에서는 스크롤 애니메이션이 없다.

## 설계

- `services/backend/src/modules/job-analysis/coverage.ts`: 선택 인자 `keywords`. `service.ts`는 `normalized`의 네 축을 합쳐 넘긴다. 일치도(`calculateExplainableMatch`)와 같은 키워드, 같은 정규화 규칙을 쓴다.
- `service.ts`의 `getResult` · `getResultById`가 공고를 읽어 `sourceText`를 채운다. 계약은 `.nullable().default(null)`이라 레거시 경로를 고치지 않는다.
- `analyze/source-marks.ts`: 원문을 구간 조각으로 나누고, 수집 본문의 Markdown을 제목 · 목록 · 문단 줄로 읽는 순수 함수. 위치 계산을 끝낸 뒤 표시 문법을 지워 표시가 밀리지 않는다.
- `analyze/CoverageMap.tsx`: 클라이언트 컴포넌트. 막대, 요건 행, 원문을 함께 그리고 활성 요건 상태를 가진다.
- `analyze/page.tsx`는 데이터 조회와 머리 · 바닥만 맡는다. `situation`은 `충족 2 / 6` 하나다. `Reanalyze`의 안내는 짧게 줄인다.

## 버린 대안

- 왼쪽에 인용을 유지하고 오른쪽을 없애는 방법: 줄 수가 그대로이고 근거의 위치를 보여 주지 못한다.
- 웹이 `jobs.posting`으로 원문을 따로 받는 방법: 결과 계약에 공고 ID가 없어 어차피 계약을 고쳐야 하고 왕복이 하나 는다.
- 토큰 일치 비율 임계값으로 `covered`를 정하는 방법: 임계값의 근거를 설명할 수 없다.

## 함정

- `covered`가 많아지면 인터뷰 질문 근거가 줄어든다. `#questionOptions`는 `record_gap`도 세므로 대부분 3개를 넘지만, 3개 미만이면 기존 안내가 나온다.
- 공백만 있는 원문 구간과 줄바꿈은 `white-space: pre-wrap`으로 유지한다.
- `Array.from`으로 나눠야 이모지가 있어도 위치가 맞는다.

## 완료 기준

`pnpm typecheck`, `pnpm test`, `pnpm test:infra` 통과. 로컬 서버에서 실제 분석 결과로 1440px와 390px 화면을 확인한다.
