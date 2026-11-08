---
title: 공고 상세 대조 전 상태
slug: job-detail-compare-state
stage: plan
status: accepted
intent: .intent/intent_job-detail-compare-state.md
spec: .intent/spec_job-detail-compare-state.md
date: 2026-10-27
---

# 공고 상세 대조 전 상태 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `docs/Expresso Screens.dc.html` | 06b 자격 요건 블록에 대조 전 · 대조 중 · 실패 세 상태 추가 |
| `packages/contracts/src/job-board.ts` | `JobAnalysisSummarySchema`에 `failure` 필드 추가 |
| `services/backend/src/modules/jobs/board-service.ts` | 상세 매퍼가 `failure`를 채움 |
| `services/backend/src/modules/jobs/legacy-mysql-board-service.ts` | 같은 자리에 `failure: null` 채움 |
| `services/backend/src/modules/jobs/service.ts` | `analyzePosting`이 재시도 가능한 실패를 다시 큐에 넣음 |
| `services/backend/src/modules/jobs/jobs.integration.test.ts` | 재시도 재적재 테스트 추가 |
| `docs/screen-map.js` | 개발 포털이 06c를 이름으로 부르도록 등록 |
| `services/web/src/lib/analysis-stage.ts` | 새 파일. 분석 단계 이름과 진행률을 한곳에 둠 |
| `services/web/src/app/(app)/brew/new/[jobAnalysisId]/page.tsx` | 단계 이름을 공용 모듈에서 가져옴 |
| `services/web/src/app/(app)/brew/new/[jobAnalysisId]/AnalysisProgress.tsx` | 진행률을 공용 모듈에서 가져옴 |
| `services/web/src/app/(app)/jobs/[jobId]/compare-actions.ts` | 새 파일. 대조 시작 서버 액션 |
| `services/web/src/app/(app)/jobs/[jobId]/CompareControl.tsx` | 새 파일. 버튼 · 진행 막대 · 실패 표시 |
| `services/web/src/app/(app)/jobs/[jobId]/CompareControl.test.tsx` | 새 파일. 네 상태 렌더 테스트 |
| `services/web/src/app/(app)/jobs/[jobId]/page.tsx` | 문장 셋 제거, 근거 줄 조건부, 머리에 `CompareControl` |
| `services/web/src/app/(app)/jobs/[jobId]/page.module.css` | `.requirementNote` 기본색 중립화, `.requirementNoteCovered` 추가, 컨트롤 스타일 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

0. `pnpm install`로 이 워크트리의 의존성을 깐다. `docs/AGENTS.md`를 읽고 정의서에서
   손대지 않는 곳을 확인한다 — `:root` 토큰 블록은 건드리지 않고 06b 자격 요건 블록 마크업만 고친다.
1. 정의서 06b에 세 상태를 그린다 — 브라우저로 06b를 열어 세 상태가 보이는지 확인한다.
2. 계약에 `failure`를 더하고 백엔드 매퍼 둘을 채운다 — `pnpm --filter @expresso/contracts build`가 통과한다.
3. `analyzePosting`에 재시도 재적재를 넣고 통합 테스트를 더한다 —
   `pnpm --filter @expresso/backend test` 에서 새 테스트가 통과한다.
4. 단계 이름과 진행률을 `lib/analysis-stage.ts`로 올리고 01 분석 대기 화면이 그것을 쓰게 한다.
   같은 진행을 가리키는 말이 두 벌로 갈리지 않게 하려는 것이다.
5. `compare-actions.ts`와 `CompareControl.tsx`를 만든다 — 단위 테스트로 네 상태를 확인한다.
6. `page.tsx`에서 문장 셋을 지우고 근거 줄을 조건부로 바꾸고 머리에 컨트롤을 붙인다 —
   `pnpm typecheck`가 통과한다.
7. CSS에서 `.requirementNote` 기본색을 중립으로 내리고 `.requirementNoteCovered`를 만든다 —
   `COVERAGE.covered.note`가 그 클래스를 가리킨다.
8. 개발 서버로 실제 화면을 확인한다 — 아래 검증 절차.

## 가장 위험한 단계

3번이다. (단계 번호는 위 목록 기준이다.) `analyzePosting`은 제작 시작 경로(`brew/new`)도 쓴다.
재적재 조건을 잘못 걸면 이미 끝난 분석이 다시 큐에 들어가 기존 커버리지를 덮어쓴다.
조건을 `status === "failed" && failureRetryable === true` 둘 다로 묶고,
기존 통합 테스트(`jobs.integration.test.ts`의 `reused` 검사)가 그대로 통과하는지 먼저 본다.
깨지면 그 커밋만 되돌린다 — 화면 변경과 별도 커밋으로 둔다.

6번도 조심한다. `.requirementNote`의 기본색을 바꾸면 `covered` 줄이 중립색으로 그려진다.
`COVERAGE.covered.note`에 새 클래스를 달기 전에는 충족 줄이 중립색으로 그려진다.
한 커밋 안에서 함께 바꾼다.

`legacy-mysql-service.ts`에도 `analyzePosting`이 있지만 `api/main.ts`가 그것을 엮지 않는다.
계약을 지키도록 `failure` 자리만 채우고, 재시도 재적재는 Mongo 쪽에만 넣는다.

## 검증

```
pnpm typecheck
pnpm test
pnpm --filter @expresso/backend test:infra
```

대조는 워커가 처리한다. 화면을 확인하기 전에 인프라 · API · 워커 · 웹을 모두 띄운다.
셸에 `AI_PROVIDER`가 새어 들 수 있으므로 워커는 값을 명시해 띄운다.

```
pnpm infra:up
pnpm db:migrate
pnpm dev:backend
AI_PROVIDER=off pnpm dev:worker
pnpm dev:web
```

워크트리 전용 포트를 쓰고 `<이름>.localhost:<포트>`로 연다.
쿠키가 포트를 무시하므로 다른 워크트리의 세션을 덮지 않도록 호스트 이름을 나눈다.

1. 요건이 있는 공고 상세를 연다. "대조하지 않았습니다" 문장이 하나도 없고 요건 줄에 초록 글이 없다.
2. "내 기록과 대조"를 누른다. 같은 화면에서 진행 막대가 돌고, 충족 수와 근거 줄이 나타난다.
   이때 걸린 시간을 재서 intent의 "몇 초"를 실제 값으로 고친다.
3. 기술 스택 줄 규칙은 단위 테스트로 검사한다. 실계정으로 보려면
   `services/web/.env.local`의 `DEV_LOGIN_EMAIL`을 쓰지 않던 주소로 바꿔 기록 0건에서 시작하고,
   기록 2건을 넣은 뒤 같은 공고를 대조한다.
4. 요건이 없는 공고 상세를 연다. 자격 요건 블록도 대조 버튼도 없고, 원문이 펼쳐져 있다.
