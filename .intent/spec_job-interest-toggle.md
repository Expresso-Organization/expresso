---
title: 공고 상세 관심 공고 담기 · 해제
slug: job-interest-toggle
stage: spec
status: accepted
intent: .intent/intent_job-interest-toggle.md
date: 2026-10-16
---

# 공고 상세 관심 공고 담기 · 해제 — 명세

## 요구사항

- [ ] `DELETE /v1/jobs/postings/:id/interest`가 로그인한 사용자의 관심 행만 지우고 204를 낸다. 관심 행이 없어도 204다. 공고가 없으면 404, id가 UUID가 아니면 400이다.
- [ ] 다른 사용자의 DELETE는 내 관심 행을 지우지 못한다.
- [ ] `PUT …/interest` 응답이 계약 `JobInterestResponseSchema`(`{ data: JobInterest & { jobPostingId } }`)를 따른다. `updatedAt`을 포함한다. 라우트가 이 스키마로 응답을 만든다.
- [ ] MongoDB · MySQL 두 구현이 같은 동작을 한다(`JobMarketApi`가 레거시 클래스에서 파생).
- [ ] 웹 `jobs.saveInterest` · `jobs.removeInterest`가 각각 PUT(`{ stage: "saved" }`) · DELETE를 부르고, PUT 응답은 계약으로 파싱한다.
- [ ] 상세 머리 버튼이 담기/해제를 오간다. 누른 즉시 아이콘 · 문구가 바뀌고(낙관적 갱신), 처리 중에는 다시 누를 수 없으며, 실패하면 원래 상태로 돌아가고 실패 문구를 보인다. `aria-pressed`가 담김 여부를 말한다.
- [ ] 담기 · 해제 뒤 같은 화면의 사이드바 "관심 공고"가 바뀌고, `/jobs`로 가면 레일과 "관심 공고 N"이 바뀐 상태다.
- [ ] 사이드바 "관심 공고"는 `interested=true` · 마감 순 · 5건이고, 숫자는 `summary.total`, 점수는 `match.total`(없으면 "분석 대기")이다.

## 설계

- **계약**: `job-board.ts`에 `JobInterestResponseSchema`를 둔다. 본체는 `job-board.ts`의 `JobInterestSchema`를 `jobPostingId`로 넓힌 것이다. 관심 행의 모양을 한 곳에서만 정한다.
- **백엔드**: `deleteInterest(userId, jobPostingId)`를 `service.ts`(`#write` 트랜잭션, `deleteRecentSearch`와 같은 꼴)와 `legacy-mysql-service.ts`에 둔다. 두 `upsertInterest`가 `updatedAt`도 돌려준다. `routes.ts`에 `app.delete(…/postings/:id/interest)`를 PUT 옆에 둔다.
- **웹 API**: `endpoints.ts`의 `jobs`에 `saveInterest`(`request` + 계약) · `removeInterest`(`requestNoContent`).
- **서버 액션**: `jobs/[jobId]/interest-actions.ts` — 폼의 `jobPostingId`와 `next`(`save`|`remove`)를 읽어 API를 부르고 `revalidatePath("/", "layout")`. 사이드바는 각 구간 `layout.tsx`의 `AppChrome`에 있어 모든 앱 화면에 걸쳐 바뀌므로 루트 레이아웃 단위로 무효화한다(Next 16 `revalidatePath` 문서: 서버 함수에서 부르면 보고 있는 화면을 바로 갱신하고 클라이언트 캐시를 비운다). 실패(`ApiError`)는 `{ error }`로 돌려준다. `next`를 클라이언트가 본 상태로 정하므로 두 번 눌러도 PUT · DELETE가 멱등이라 결과가 같다.
- **버튼**: `jobs/[jobId]/InterestButton.tsx`(클라이언트). `useOptimistic` + `<form action>`. 모양은 기존 `styles.headAction`과 같은 아이콘 · 문구. 상세 `page.tsx`는 버튼 자리만 이 컴포넌트로 바꾼다.
- **사이드바**: `lib/app-data.ts`에 `watchedJobs = cache(…jobs.postings({ interested: true, sort: "deadline", limit: 5 }))`. `AppChrome`과 `/jobs` 화면이 같이 쓴다(한 요청 안에서 한 번만 부름). `Sidebar`에 `interestTotal` 속성을 더한다.

## 버린 대안

- 단계를 `closed`로 바꾸는 해제 — `interested` 필터가 행 존재로 거르므로 관심 공고로 남는다.
- 공고가 없을 때 말고도 관심 행이 없으면 404 — 토글을 두 번 누르거나 탭 두 개에서 누를 때 오류가 난다. PUT이 멱등이므로 짝을 맞춘다.
- `HomeReadModel`에 관심 공고를 더하는 것 — 홈 계약을 바꾸게 되고, 공고 목록 API가 이미 점수 · 로고 · 건수를 함께 준다.
- `router.refresh()`로 다시 그리기 — 서버 액션 응답 한 번에 갱신된 트리가 오는 `revalidatePath`가 왕복이 적다.

## 함정

- 라우트 파라미터 이름은 `:id`여야 한다(같은 경로에 다른 이름이면 Fastify가 거부).
- 통합 테스트 파일은 `mysql` · `mongodb` 두 엔진을 루프로 돈다. MySQL은 `DATABASE_URL`이 없으면 건너뛴다.
- 웹 테스트는 contracts `dist`를 본다 — 계약을 고치면 먼저 짓는다.
- PR #84가 같은 머리를 고친다. 버튼을 컴포넌트로 빼서 충돌을 한 줄로 줄인다.

## 완료 기준

- `pnpm typecheck` · `pnpm test` 통과.
- `pnpm test:infra`에서 jobs 통합 테스트(mongodb) 통과 — DELETE 404/204/교차 사용자 · `interested=true` 0건.
- 웹 테스트: `InterestButton` 담기 · 해제 분기와 실패 복귀.
- 브라우저: 상세에서 담기 → 사이드바에 줄이 생김 → `/jobs` 레일 · "관심 공고 N" 증가 → 상세에서 해제 → 사라짐.
