---
title: 공고 상세 대조 전 상태
slug: job-detail-compare-state
stage: spec
status: accepted
intent: .intent/intent_job-detail-compare-state.md
date: 2026-10-27
---

# 공고 상세 대조 전 상태 — 명세

## 요구사항

- [ ] `coverage === null`인 요건 줄은 근거 줄(`.requirementNote`) 요소를 렌더하지 않는다.
- [ ] `job.match === null`이면 기술 스택 블록의 `.stackNote` 요소를 렌더하지 않는다.
- [ ] 자격 요건 블록 머리 오른쪽은 `job.analysis` 하나로 갈린다.
      `null` → 대조 버튼, `queued`·`running` → 진행 막대와 단계 이름,
      `done` → `N개 중 M개 충족`, `failed` → 실패 표시(재시도 가능하면 버튼 포함).
- [ ] 대조 버튼은 `POST /v1/jobs/postings/:id/analyses`를 부르고 공고 상세에 머문다.
      서버 액션이 `revalidatePath`로 이 공고 상세만 무효화해, 같은 응답에서 진행 상태가 그려진다.
- [ ] `queued`·`running`일 때만 1.5초 간격 갱신이 돌고, `done`·`failed`가 되면 멈춘다.
- [ ] `JobAnalysisSummarySchema`가 `failure: { code, retryable } | null`을 싣는다.
- [ ] `analyzePosting`은 기존 분석이 `failed`이고 `failureRetryable`이면 큐에 다시 넣는다.
      그 밖에는 지금처럼 기존 분석을 그대로 돌려준다.
- [ ] 화면 정의서 06b에 대조 전 · 대조 중 · 실패 세 상태가 들어간다.

## 설계

**재사용**

- 서버 액션과 버튼은 같은 폴더의 `interest-actions.ts` · `InterestButton.tsx` 양식을 따른다.
  `"use server"` 액션 + `useActionState` 클라이언트 버튼 + 실패 문구.
- 진행 막대와 자동 갱신은 `brew/new/[jobAnalysisId]/AnalysisProgress.tsx`의 양식을 따른다.
  `useEffect` 안에서 1.5초 간격 `router.refresh()`, `progressStage`를 퍼센트로 바꾸는 표.
  그 파일은 brew의 CSS를 쓰므로 가져다 쓰지 않고 같은 구조를 공고 상세 폴더에 둔다.
  그 컴포넌트는 진행 중에만 마운트되어 조건 없이 폴링한다. `CompareControl`은 네 상태를 모두
  그리므로 `useEffect` 안에서 `status`가 `queued`·`running`일 때만 타이머를 건다.
- 실패 모양은 이미 계약에 있는 `JobAnalysisStatusSchema.failure`(`job-analysis.ts:77`)와 같은
  `{ code, retryable }`를 쓴다. 새 모양을 만들지 않는다.

**계약**

`packages/contracts/src/job-board.ts`의 `JobAnalysisSummarySchema`에 `failure` 필드를 더한다.
`services/backend/src/modules/jobs/board-service.ts`의 상세 매퍼가
`analysis.failureCode ? { code, retryable: analysis.failureRetryable ?? false } : null`로 채운다.
`legacy-mysql-board-service.ts`도 같은 자리에 null을 채워 계약을 지킨다.

**백엔드**

`services/backend/src/modules/jobs/service.ts`의 `analyzePosting`에서, 기존 분석이
`status === "failed" && failureRetryable === true`면 `status`·`progressStage`를 `queued`로 되돌리고
`job.normalize` 이벤트를 다시 넣는다. 멱등 키는 같은 분석을 두 번 넣지 않도록
`job-normalize:${id}:retry:${attempts}`로 둔다.

**갱신 경로**

버튼을 누른 뒤 진행 상태가 보이려면 서버 컴포넌트가 다시 그려져야 한다.
같은 폴더의 `interest-actions.ts`가 쓰는 `revalidatePath`를 쓴다 — 관심 공고는 사이드바까지 걸려
`revalidatePath("/", "layout")`이지만, 대조는 이 공고 상세 안에서 끝나므로
`revalidatePath(`/jobs/${jobPostingId}`)` 하나로 둔다.
Next 버전이 이 저장소 고유이므로, 구현할 때 `services/web/node_modules/next/dist/docs/`의
해당 문서를 먼저 읽고 호출 양식을 확인한다(`services/web/AGENTS.md`).

**화면**

`page.tsx`의 `RequirementRow`에서 `state === null`이면 `.requirementNote` div 자체를 만들지 않는다.
기술 스택 블록의 `.stackNote`는 `job.match`가 있을 때만 만든다.
자격 요건 블록 머리의 `.blockTitleNote` 자리에 새 클라이언트 컴포넌트 `CompareControl`을 둔다.
이 컴포넌트는 도메인을 모른다 — `page.tsx`가 `job.analysis`와 집계 숫자를 속성으로 바꿔 넘긴다.

**정의서**

`docs/Expresso Screens.dc.html`의 06b 자격 요건 블록에 세 상태를 추가한다.
정의서가 기준이므로 구현 전에 정의서를 먼저 고친다.

## 버린 대안

- **문장만 지우고 버튼은 두지 않는다** — 반복과 색은 사라지지만 대조를 시작할 방법이 여전히 없다.
  화면이 상태만 말하고 할 일을 주지 않는 구조가 그대로 남는다.
- **공고 상세를 열면 자동으로 대조한다** — GET 한 번이 DB 행과 큐 작업을 만든다.
  공고를 훑기만 해도 돌고, 사용자가 고를 자리가 없어진다.
- **기술 스택 줄도 `job.analysis`로 갈린다** — `technologies[].matched`가 `match`에서 파생되므로
  (`board-service.ts:28`), 분석이 끝나도 기록이 3건 미만이면 전부 `null`이 되어
  "표시된 0개는 내 기록에 이미 있는 것입니다"가 나온다. 신호는 블록마다 따로 둔다.

## 함정

- `.requirementNote`의 기본 색이 `--ex-status-success-text`다(`page.module.css:248`).
  `covered`가 modifier 없이 이 기본값을 쓰기 때문에 생긴 결함이다.
  줄을 안 그리면 사라지지만, 기본 색을 중립으로 바꾸고 `.requirementNoteCovered`를 두는 편이
  다음에 같은 실수를 막는다. 이번 변경에 함께 넣는다.
- `match`는 커리어 기록이 3건 미만이면 분석이 끝나도 `null`이다
  (`job-analysis/service.ts:97`). "일치도 없음"은 "대조 안 함"이 아니다.
- 요건 행이 없는 공고는 워커가 추출기를 부르고(`job-analysis/service.ts:55`),
  `AI_PROVIDER=off`면 `EXTRACTOR_UNAVAILABLE`로 실패한다. 그런 공고는 `musts.length === 0`이라
  자격 요건 블록이 없고, 따라서 대조 버튼도 서지 않는다.
- `EXTRACTOR_UNAVAILABLE`과 `INVALID_SOURCE_SPAN`은 `retryable: false`다
  (`job-analysis/service.ts:18`). 이 둘에는 다시 시도 버튼을 그리지 않는다.
- `requestReanalysis`는 `done`인 분석만 받는다(`job-analysis/service.ts:145`).
  실패한 분석의 재시도는 `analyzePosting` 쪽에서 처리한다.
- 추출기 버전이 올라간 뒤 옛 버전 요건 행이 남아 있으면 `done`인데도 그 행만 커버리지가 없다
  (`job-analysis/service.ts:26`의 `extractorVersion` 필터). 이 경우 요건 줄은 근거 줄 없이
  중립 아이콘으로 서고, 머리는 `done`이므로 숫자를 보인다. 두 상태가 섞이지 않는다.

## 완료 기준

```
pnpm typecheck
pnpm test
pnpm --filter @expresso/backend test:infra
```

화면 확인 — 개발 로그인으로 `/jobs/{요건이 있는 공고 id}`를 연다.

1. 대조 전: "대조하지 않았습니다" 문장이 없고, 요건 줄에 초록 글이 없다.
2. "내 기록과 대조"를 누른다: 같은 화면에서 진행 막대가 돌고, 몇 초 뒤 충족 수와 근거 줄이 나타난다.
3. 기록이 2건인 계정으로 같은 공고를 대조한다: 기술 스택 아래에 문장이 없고 자격 요건 머리는 충족 수를 보인다.
