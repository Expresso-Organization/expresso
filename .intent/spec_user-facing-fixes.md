---
title: 사용자 눈에 보이는 결함 넷 정리
slug: user-facing-fixes
stage: spec
status: accepted
intent: .intent/intent_user-facing-fixes.md
date: 2026-11-02
---

# 사용자 눈에 보이는 결함 넷 정리 — 명세

## 요구사항

- [ ] `AuthAside`에 `stats` 블록이 없고, `auth.module.css`의 `.stats` · `.statValue` · `.statLabel` 규칙도 없다.
- [ ] `app/site/[slug]/page.tsx`가 `generateMetadata`를 내보낸다. `title`은 배포 `seo.title`, 없으면 스냅샷 `title`. `description`은 `seo.description`이 있을 때만 넣는다. `openGraph`는 `title` · `description` · `url`(`publicSiteUrl(slug)`) · `type: "website"`. `robots`는 `seo.indexable`이 거짓이면 `{ index: false, follow: false }`.
- [ ] 옛 주소(`kind: "redirect"`)와 404는 `generateMetadata`에서도 페이지와 같은 결과다. 옛 주소는 새 주소의 메타를 내지 않고 제목만 "Expresso"로 둔다. 페이지가 어차피 리다이렉트한다.
- [ ] `app/robots.ts`가 `User-Agent: *`에 대해 `/`를 허용하고 `/home` · `/jobs` · `/analytics` · `/career` · `/account` · `/brew` · `/edit` · `/onboarding` · `/api` · `/admin` · `/login` · `/signup` · `/verify-email`을 금지한다. `sitemap`은 적지 않는다.
- [ ] 공개 호스트(`{slug}.expresso.ai.kr`)에서 `/robots.txt`가 404가 아니라 같은 robots 응답이다. `proxy.ts`의 `servePublicSite`가 그 경로를 통과시킨다.
- [ ] 홈 추천 공고 행: 회사 · 제목 영역은 `/jobs/{id}` 링크, 「만들기」는 `analyzePostingAction`을 부르는 `<form>`의 submit 버튼이다.
- [ ] 홈 진행 중 제작 카드: 「이어서 답하기」는 `/brew/{id}/{resumeStep(status).segment}` 링크다.
- [ ] 공고 상세 `facts()`의 「기술 스택」 행은 `job.technologies.length === 0`일 때만 선다. 요건을 뽑은 공고는 본문 섹션의 대조 칩 묶음만 보인다.
- [ ] 공고 탐색 머리: 767px 이하에서 `.headNote`는 `display: none`, `.headAction`은 `white-space: nowrap`, `.categoryTabs`는 `overflow-x: auto`이고 탭은 줄바꿈하지 않는다.
- [ ] 편집기 머리 배지는 "웹 QA 통과" 또는 "웹 QA 확인 필요"만 보이고 `costUsd`를 읽지 않는다.
- [ ] `app/(app)/career/page.tsx`가 세션의 첫 카테고리(`session.categories[0].key`)로 `redirect`한다. 카테고리가 없으면 `/career/experience`로 간다.

## 설계

**재사용.**
- 공개 사이트 메타: `publishing.public(slug)`(`lib/api/endpoints.ts`)와 `publicSiteUrl`(`lib/public-site.ts`)을 그대로 쓴다. `generateMetadata`와 페이지가 같은 응답을 두 번 받지 않도록 조회를 `react`의 `cache()`로 감싼 `loadPublication(slug)` 하나를 두고 둘이 함께 부른다.
- 홈 버튼: `brew/new/new-brew-actions.ts`의 `analyzePostingAction`과 `brew/new/resume-step.ts`의 `resumeStep`을 그대로 쓴다. 새 포트폴리오 화면의 `ResumeBanner`와 같은 규칙이다.
- `/career` 리다이렉트: `requireSession()`이 이미 카테고리 목록을 들고 있다.
- robots: Next.js 16 메타데이터 파일 규약 `app/robots.ts`(`MetadataRoute.Robots`). 근거는 `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/robots.md`.

**새로 만드는 것.**
- `app/site/[slug]/page.tsx`의 `generateMetadata`와 `loadPublication`.
- `app/robots.ts`.
- `app/(app)/career/page.tsx`.
- `app/(app)/home/page.tsx`의 `ActiveBrewCard` 함수 컴포넌트(PR 118과 같은 이름 · 같은 구조).

**지우는 것.**
- `AuthAside`의 수치 블록과 그 CSS.
- 편집기 배지의 비용 접미사.
- `facts()`의 조건 없는 기술 스택 행(조건을 붙여 남긴다).

## 버린 대안

- OG 이미지로 브랜드 로고를 넣는 것. 모든 포트폴리오가 같은 그림으로 보여 주인의 사이트가 아니라 Expresso 광고가 된다.
- 공고 상세에서 본문 섹션의 대조 칩 묶음을 지우고 속성 표의 묶음만 남기는 것. 대조 상태(내 기록에 있는 스택 표시)는 섹션 쪽에만 있다.
- 모바일 머리에서 「관심 공고」 · 「알림 설정」을 아이콘만 남기는 것. 공고 상세 머리는 그렇게 하지만, 탐색 머리는 제목이 짧아 글자를 둘 자리가 있다. 세로 낙하의 원인은 폭이 아니라 `white-space`가 없는 것이다.
- `/career`에 카테고리 목록 화면을 새로 만드는 것. 사이드바가 이미 그 목록이다.

## 함정

- `generateMetadata`는 서버 컴포넌트에서만 되고, 같은 세그먼트에서 `metadata` 객체와 함께 내보낼 수 없다. `site/[slug]/page.tsx`에는 둘 다 없으므로 충돌하지 않는다.
- 공개 호스트의 요청은 프록시가 `/site/{slug}`로 다시 쓴다. `og:url`은 요청 호스트가 아니라 `publicSiteUrl(slug)`로 만든다. 앱 주소 `/site/{slug}`로 들어온 주인도 공개 주소를 메타로 받는다. 공유는 공개 주소로 하기 때문이다.
- `publishing.public()`이 404 · 400이면 페이지는 `notFound()`를 부른다. `generateMetadata`에서는 예외를 삼키고 기본 제목을 돌려준다. 페이지가 같은 응답으로 404를 낸다.
- 홈 추천 행에서 `<form>`을 `<Link>` 안에 둘 수 없다. 링크와 폼을 나란히 둔다(PR 118 주석과 같은 이유).
- `resumeStep`은 모르는 상태를 재료 고르기로 보낸다. 홈의 `activeBrews[].status`는 느슨한 문자열이라 이 함수를 거쳐야 한다.
- 카테고리 탭 묶음 안에 `SortMenu`가 함께 있다. `overflow-x: auto`를 주면 정렬 메뉴의 드롭다운이 잘릴 수 있다. 767px 이하에서만 적용하고 그 폭에서 드롭다운이 열리는지 확인한다.
- `facts()`의 기술 스택 행은 `mentionedStacks()`가 본문에서 읽은 것이라 `technologies`가 비어 있어도 설 수 있다. 조건을 `technologies.length === 0`으로 두면 아직 요건을 뽑지 않은 공고에서는 그대로 보인다.

## 완료 기준

```
pnpm --filter @expresso/web typecheck
pnpm --filter @expresso/web test
```

둘 다 종료 코드 0. 화면 확인은 plan의 「검증」에 적는다.
