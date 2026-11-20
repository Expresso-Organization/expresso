---
title: 앱 셸 공용 레이아웃
slug: app-shell-layout
stage: spec
status: accepted
intent: .intent/intent_app-shell-layout.md
date: 2026-11-20
---

# 앱 셸 공용 레이아웃 — 명세

## 요구사항

- [ ] `(app)` 아래 셸 화면 사이를 클라이언트 이동할 때 `AppChrome`이 다시 마운트되지 않는다(사이드바 DOM 노드 동일).
- [ ] 같은 이동에서 `SidebarSkeleton`(`aria-busy`)이 DOM에 들어오지 않는다.
- [ ] `/edit/[portfolioId]`는 셸 없이 그린다. `/edit/[portfolioId]/deploy`는 셸 안에 그린다.
- [ ] `next build` 경로 목록이 origin/main과 같다.
- [ ] 사이드바 값을 바꾸는 변경 뒤 사이드바가 새 값을 보인다(분류 추가 · 휴지통 · 대신 로그인 · 배포 · 이름 변경 · AI 대화 뒤 크레딧).

## 설계

- `app/(app)/layout.tsx`를 새로 두고 `<AppChrome>`을 그린다. 구간별 `layout.tsx` 12개(account · admin · agent · analytics · brew/[brewId] · brew/new · career · edit/[portfolioId]/deploy · goal · home · jobs · library)를 지운다.
- 편집기를 형제 route group `app/(editor)/edit/[portfolioId]/`로 옮긴다(page · Editor*.tsx · actions · `page.module.css` · error · loading · not-found · `preview/route.ts`). `deploy/`는 `(app)/edit/[portfolioId]/deploy`에 남긴다. 동적 세그먼트 이름은 `portfolioId`로 같다.
- `(app)` 아래 남는 셸 없는 것은 route handler(`account/export`)와 리다이렉트 페이지(`portfolio/new`)뿐이다. 둘은 레이아웃을 그리지 않거나 그리기 전에 넘어간다.
- 사이드바 갱신: 공용 레이아웃은 이동으로 다시 그리지 않는다(Next 문서 layouts-and-pages "layouts … do not rerender"). 대신 다음 경로가 레이아웃까지 다시 그린다.
  - `router.refresh()` — 분류 · 기록 · 휴지통 · 제작 · 비교 화면이 이미 부른다.
  - `revalidatePath`를 부르는 Server Action — Next 16은 Server Action 응답을 루트부터 그리고 `FreshnessPolicy.RefreshAll`로 적용한다(`next/dist/client/components/router-reducer/reducers/server-action-reducer.js` 주석 "the server always renders from the root in response to a Server Action"). 배포 · 이름 변경 · 관심 공고 · 대신 로그인이 여기에 든다.
  - AI 대화: `AgentChat`이 같은 대화의 실행이 `running`에서 끝난 상태로 바뀌면 `router.refresh()`를 한 번 부른다. 대화는 클라이언트 fetch라 위 두 경로를 타지 않는다.
  - AI 대화의 기록 초안 승인: `RecordDraftCard`가 승인 뒤 `router.refresh()`를 부른다. 저장된 기록이 사이드바 카테고리 건수를 바꾼다.
- `AppChrome.tsx` 머리 주석, `interest-actions.ts` 주석, `tokens.test.ts`의 편집기 경로 키, `dev-portal` 스캐너 D8 경로를 새 위치로 맞춘다.

## 버린 대안

- 셸 화면을 `(app)/(shell)/`로 옮기기: 폴더 10개가 움직여 `@/app/(app)/home/home-model` 같은 import와 열린 브랜치(#261 등) 대부분과 충돌한다. 편집기만 옮기면 바뀌는 경로가 한 구간이다.
- 이동마다 `router.refresh()`로 사이드바 갱신: 이동마다 화면 전체를 두 번 그린다.

## 함정

- 같은 URL 접두사 `/edit/[portfolioId]`가 두 그룹에 걸친다. 세그먼트 이름이 다르면 빌드가 실패한다.
- 편집기의 `error.tsx` · `loading.tsx`가 지금은 deploy 레이아웃도 감쌌다. deploy는 자체 error · loading · not-found가 있어 그대로 동작한다.
- `revalidatePath(`/edit/${id}`)`는 경로 문자열 기준이라 그룹을 옮겨도 그대로 맞는다.

## 완료 기준

- `pnpm typecheck` · `pnpm test` 통과.
- 운영 빌드 경로 목록 diff 없음.
- Playwright(운영 빌드, 개발 로그인): 사이드바 링크로 홈 → 라이브러리 → 탐색 → 분석 → 커리어 기록. 첫 화면 사이드바에 표식을 달고 매 이동 뒤 같은 노드인지, `MutationObserver`가 스켈레톤 삽입을 한 번도 기록하지 않았는지 본다. 같은 스크립트가 origin/main 빌드에서는 실패해야 한다.
