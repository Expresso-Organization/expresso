---
title: 홈 공고 카드 관심 탭 즉시 전환
slug: home-saved-tab-speed
stage: spec
status: accepted
intent: .intent/intent_home-saved-tab-speed.md
date: 2026-11-10
---

# 홈 공고 카드 관심 탭 즉시 전환 — 명세

## 요구사항

- [ ] 탭 단추를 눌러도 RSC 요청(`_rsc`)이 나가지 않는다.
- [ ] 관심 탭을 보면 주소가 `/home?tab=interested`, 첫 탭이면 `/home`이다. 주소는 `history.replaceState`로 바꾼다.
- [ ] 서버는 `?tab=interested`를 읽어 첫 렌더의 탭을 정한다(새로고침 · 주소 공유).
- [ ] 관심 공고가 0건이면 관심 단추를 숨기고 `?tab=interested`여도 첫 탭을 보인다(지금 규칙).
- [ ] 「전체」 링크는 보고 있는 탭을 따른다: 관심 → `/jobs?interested=true`, 첫 탭 → `/jobs?family=<family>` 또는 `/jobs`.
- [ ] 공고 행(`JobRow`)과 「만들기」 서버 액션 폼은 서버 컴포넌트로 남는다.

## 설계

원인: `HomeJobs`의 탭이 `<Link href="/home?tab=interested">`라 누를 때마다 동적 페이지 전체가
다시 돈다 — `requireSession` → `careerProfile` → `MidRow`(`roleJobs` · `watchedJobs` ·
`siteInsights`) · `Portfolios`(`homeEngagement` · `recentPortfolios` · `page.latest` × N).
`loading.tsx`가 뼈대를 띄운다. 그런데 `MidRow`는 이미 두 목록을 모두 받아 `HomeJobs`에 넘긴다.

- 재사용: `MidRow`의 데이터 호출, `JobRow`, `page.module.css`의 `.segment` · `.segmentItem` · `.cardLink`.
- `home-model.ts`(바뀜): 순수 함수 둘.
  - `jobsTabShown(tab, interestedTotal)` — 관심이 0건이면 `"role"`.
  - `allJobsQuery(shown, family)` — 「전체」 링크의 query.
- `HomeJobsTabs.tsx`(새로, `"use client"`): `useState(초기 탭)`. 세그먼트 단추 둘과 「전체」 링크를 그리고,
  서버가 넘긴 두 목록 슬롯(`roleRows` · `interestedRows`: `ReactNode`) 중 하나를 보인다. 단추를 누르면
  상태를 바꾸고 `window.history.replaceState(null, "", url)`을 부른다.
- `HomeJobs.tsx`(바뀜): 서버 컴포넌트로 남아 두 목록을 `JobRow`로 그려 `HomeJobsTabs`에 슬롯으로 넘긴다.
  관심이 0건이면 관심 슬롯을 넘기지 않는다.
- 근거: Next.js App Router는 `pushState` · `replaceState`를 라우터에 통합해 서버를 부르지 않고 주소만
  바꾼다(Next.js 문서 「Linking and Navigating → Native History API」, `app-router.tsx`의 history 패치).

## 버린 대안

- `<Link>` 유지 + `router` 캐시(`staleTimes`): 첫 전환은 여전히 왕복이고 전역 캐시 설정을 바꾼다.
- `router.replace` · `router.push`: RSC를 다시 받는다.
- `HomeJobs` 전체를 클라이언트 컴포넌트로: `JobRow` · 서버 액션 폼까지 클라이언트 번들로 간다. 슬롯이 더 작다.
- `pushState`: 뒤로 가기가 탭 되돌리기가 되는데, 이때 `useState`는 주소를 따라가지 않아 어긋난다.

## 함정

- `useState`는 초기값만 받는다. 서버가 다시 그려 `tab`이 바뀌어도(예: 서버 액션 뒤 refresh) 상태는 유지된다 — 이때 주소도 이미 같은 탭이라 어긋나지 않는다.
- 관심 공고가 0건이 되면(다른 화면에서 해제 후 돌아옴) 관심 슬롯이 없으니 첫 탭으로 그린다 — `jobsTabShown`을 클라이언트에서도 쓴다.
- `.segmentItem`이 `<a>`에서 `<button>`으로 바뀐다. 전역 리셋이 없어 `font-family: inherit`가 필요하다.
- 빈 DB(관심 0건)에서는 관심 단추가 안 보여 검증할 수 없다 — 검증 DB에 관심 공고가 있어야 한다.

## 완료 기준

- `pnpm --filter @expresso/web typecheck` · `pnpm --filter @expresso/web test` 통과.
- 내장 브라우저에서 관심 단추를 눌렀을 때 `performance.getEntriesByType("resource")`에 `_rsc`가 없고, 주소가 `/home?tab=interested`, 새로고침 뒤에도 관심 탭이 활성이다.
