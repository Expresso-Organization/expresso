---
title: 공고 상세 관심 공고 담기 · 해제
slug: job-interest-toggle
stage: intent
status: accepted
author: Nedian0Brien
date: 2026-10-16
---

# 공고 상세 관심 공고 담기 · 해제

## 문제

공고 상세(`/jobs/[jobId]`) 머리 오른쪽의 관심 공고 버튼은 눌러도 아무 일도
하지 않는다. `job.interest` 유무에 따라 채운/빈 북마크 아이콘만 바뀐다.

- 백엔드에는 저장 API `PUT /v1/jobs/postings/:id/interest`만 있고 해제 API가 없다.
- 이 PUT의 응답 스키마가 `packages/contracts`에 없고, 웹에는 이 API를 부르는 코드가 없다.
- 사이드바 "관심 공고" 묶음은 관심 공고가 아니라 `home.recommendedJobs`(일치도
  상위 5건, `match_scores`에서 뽑음)로 채워진다. 그래서 공고를 담아도 사이드바에는
  나타나지 않는다. 화면 정의서의 사이드바는 관심 공고를 보여 주고, 일치도가 없는
  공고는 "분석 대기"로 적는다 — 일치도 상위 목록이라면 나올 수 없는 줄이다.

## 원하는 결과

1. 상세 머리의 버튼을 누르면, 담겨 있지 않은 공고는 관심 공고(`stage: saved`)로
   담기고, 담겨 있는 공고는 해제된다. 누르는 동안 버튼은 눌린 상태를 보여 주고,
   응답이 오면 아이콘과 문구가 바뀐다.
2. 해제 API `DELETE /v1/jobs/postings/:id/interest`가 있다. 내 관심 행만 지우고
   204를 낸다. 이미 없으면 그대로 204다(PUT과 같이 멱등). 공고가 없으면 404다.
   - 단계를 `closed`로 바꾸는 방식은 쓰지 않는다. `interested=true` 필터는
     `interest._id` 존재로 거르므로(`mongo-queries.ts`) `closed`도 관심 공고로 남는다.
     `closed`는 "지원 종료"라는 별도 단계다.
3. PUT 응답 스키마가 계약에 있고 웹이 그것으로 파싱한다.
4. 담기 · 해제 직후, 같은 화면의 사이드바 "관심 공고" 묶음과 공고 목록(`/jobs`)의
   관심 공고 레일 · 머리의 "관심 공고 N"이 바뀐 상태를 보여 준다.
5. 사이드바 "관심 공고"는 내 관심 공고(`interested=true`, 마감 순, 5건)로 채운다.
   일치도가 있으면 점수를, 없으면 "분석 대기"를 보인다. 묶음 옆 숫자는 관심 공고
   전체 건수다.
6. 백엔드 통합 테스트(MongoDB · MySQL 두 엔진 루프)가 담기 → 다른 사용자의 해제가
   내 관심에 닿지 않음 → 해제 → `interested=true` 0건을 확인한다. 웹 테스트가
   버튼의 담기/해제 분기와 눌린 상태를 확인한다.

## 영향 범위

- 사용자: 공고 상세와 앱 셸 사이드바를 보는 모든 로그인 사용자.
- 모듈: `packages/contracts`(job-market), `services/backend/src/modules/jobs`
  (`routes.ts`, `service.ts`, `legacy-mysql-service.ts` — `JobMarketApi` 타입이
  레거시 클래스에서 파생되므로 둘 다 필요), `services/web`(`lib/api/endpoints.ts`,
  `app/(app)/jobs/[jobId]`, `components/shell/AppChrome.tsx`, `lib/app-data.ts`).
- 데이터: `interests` 컬렉션(MySQL은 `interest` 표). 스키마 변경 없음.

## 제약

- 계약이 유일한 출처다. 요청 · 응답 타입은 contracts의 Zod 스키마에서 파생한다.
- 라우트 파라미터 이름은 `:id`로 둔다 — 같은 경로에 다른 이름을 쓰면 Fastify가
  등록을 거부한다(`job-board.ts` 주석).
- 세션 토큰은 `ex_session` 쿠키에만 둔다. 호출은 서버 액션에서 한다.
- 기존 레이아웃 · 스타일을 유지한다. 버튼 모양은 바꾸지 않는다. PR #84가 이 머리를
  아이콘 버튼 셋으로 바꾸고 있으므로, 버튼을 별도 클라이언트 컴포넌트로 빼서 머지
  충돌을 그 한 자리로 줄인다.
- `HomeReadModel`(`recommendedJobs`)과 홈 화면은 건드리지 않는다.

## 범위 밖

- 공고 목록 행(`JobRows.tsx`)의 북마크 아이콘을 버튼으로 만드는 일.
- 공고 목록 머리 "관심 공고 N" 버튼을 눌러 관심 공고만 거르는 필터 UI.
  웹 목록 주소(`list-query.ts`)에 `interested` 조건이 아직 없다.
- 사이드바 관심 공고 줄을 상세로 가는 링크로 만드는 일, "관심 공고 추가" 버튼 동작.
- 단계(`applied` · `closed`) · 마감일 · 메모를 고치는 화면.
- 사이드바 "공고 탐색" 배지 숫자(`jobCount`).

## 열린 질문

- 해제 API의 모양 — DELETE로 정했다(원하는 결과 2).
- 사이드바 출처를 관심 공고로 바꾸는 것을 이번 범위에 넣는가 — 넣는 것으로 제안한다
  (원하는 결과 5). 넣지 않으면 원하는 결과 4의 사이드바 반영이 성립하지 않는다.
