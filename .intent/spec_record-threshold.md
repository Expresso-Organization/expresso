---
title: 일치도 · 추천의 기록 3건 조건 제거
slug: record-threshold
stage: spec
status: accepted
intent: .intent/intent_record-threshold.md
date: 2026-11-02
---

# 일치도 · 추천의 기록 3건 조건 제거 — 명세

## 요구사항

- [ ] `job-analysis/service.ts`의 일치도 계산 조건이 `records.length > 0`이다. 0건이면 지금처럼 `matchScores`에서 그 공고 점수를 지운다.
- [ ] `jobs/service.ts`의 `computeMatch`는 `records.length === 0`일 때만 `JobMarketError(409, "more career records are required", { required: 1, actual: 0 })`를 던진다.
- [ ] `jobs/legacy-mysql-service.ts`의 `computeMatch`도 같은 기준이다. 두 구현이 같은 `JobMarketApi`를 만족하므로 기준이 갈리면 안 된다.
- [ ] 홈 첫 실행 블록 제목이 "첫 기록을 남기면 공고와 맞춰 볼 수 있습니다"이고 본문은 "직접 쓰거나 바리스타에게 질문을 받아 채울 수 있습니다." 한 줄이다.
- [ ] `docs/Expresso 구현 명세서.dc.html`의 두 문장이 새 제목으로 바뀐다.
- [ ] 통합 테스트: 기록 0건 409(`required: 1, actual: 0`), 기록 1건 계산 성공. 공고 분석 테스트는 기록 1건으로 점수가 저장되고 0건 분석에서는 점수가 없다.

## 설계

**재사용.** 계산식 `calculateExplainableMatch`(`jobs/match-score.ts`)는 그대로 쓴다. 요건 충족률이라 기록 수에 기대는 나눗셈이 없다. 기록 텍스트는 줄바꿈으로 이어 한 문자열로 넘기므로 1건이어도 같은 경로다.

**바꾸는 것.** 기준 상수 두 곳(+ 레거시 한 곳)의 비교식, 409의 `required` 값, 홈 문구, 명세서 문구, 테스트 세 곳.

**새로 만드는 것.** 없음. 상수를 이름 붙여 올리지 않는다. 남는 조건은 "비교할 기록이 있는가"라서 값이 아니라 존재 여부다.

## 버린 대안

- 기준을 1로 낮춘 상수(`MIN_RECORDS = 1`)를 두는 것. 0건 검사는 조정할 값이 아니므로 상수로 두면 다시 올릴 여지만 남긴다.
- 0건일 때도 점수 0을 저장하는 것. 홈 추천이 0점 공고로 채워지고 "맞는 공고"라는 제목과 어긋난다.

## 함정

- `jobs.integration.test.ts`의 "requires three records…" 테스트는 2건에서 409를 기대한다. 0건 409 · 1건 성공으로 바꾸고 이름도 고친다.
- 같은 파일의 `computeMatch(other, postingId)` 409 기대는 `other`가 기록 0건이라 그대로 맞다.
- 공고 분석 테스트의 두 번째 케이스는 기록 3건을 만든 뒤 점수 1건을 기대한다. 기록 1건으로 줄여 새 기준을 확인한다. 첫 케이스(기록 0건)에는 점수 0건 기대를 더한다.
- 웹 · 모바일 · 계약에 이 409나 `required: 3`을 읽는 코드는 없다(2026-11-02 grep).

## 완료 기준

```
pnpm --filter @expresso/backend typecheck
pnpm --filter @expresso/backend test
pnpm test:infra
pnpm --filter @expresso/web typecheck
pnpm --filter @expresso/web test
```

모두 종료 코드 0.
