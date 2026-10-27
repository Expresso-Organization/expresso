---
title: 포트폴리오 배포 · 방문 수집 · 분석 화면 연결
slug: portfolio-publish-analytics
stage: spec
status: accepted
intent: .intent/intent_portfolio-publish-analytics.md
date: 2026-10-28
---

# 포트폴리오 배포 · 방문 수집 · 분석 화면 연결 — 명세

## 요구사항

- [ ] R1 같은 `portfolioId`로 같은 `slug`를 두 번 `publish`하면 둘 다 성공하고 version 1 · 2가 생깁니다. 다른 포트폴리오가 쓰는 slug는 409입니다.
- [ ] R2 slug를 바꾼 뒤 이전 버전으로 `rollback`해도 `getPublic(새 slug)`가 portfolio를 반환합니다.
- [ ] R3 `www` · `dev` · `api` · `app` · `admin` · `mail` · `status` · `static` · `site`는 slug로 쓸 수 없습니다(400).
- [ ] R4 Host가 `{slug}.{NEXT_PUBLIC_SITE_HOST}`인 요청이 `/`에 오면 `/site/{slug}`를 그립니다. `/_next/*` · `/api/analytics/events`만 통과하고 나머지 경로는 404입니다.
- [ ] R5 공개 페이지가 `visit` → `section_view` → `complete` → `contact_click`·`link_click`·`file_download`를 `/api/analytics/events`로 보내고, 백엔드가 202로 받습니다.
- [ ] R6 iframe 문서에서 실행되는 스크립트는 우리 추적 스크립트 하나뿐입니다. CSP `script-src 'sha256-…'`로 고정하고 `allow-same-origin`은 주지 않습니다.
- [ ] R7 앱 호스트에서 `ex_session`이 있으면 웹 라우트가 Bearer를 붙이고, 그 방문은 `isOwner: true`로 저장됩니다.
- [ ] R8 `visitorHash`는 같은 `sessionId`라도 UTC 날짜가 다르면 달라집니다.
- [ ] R9 `dashboard`와 `insightForPortfolio`는 포트폴리오의 모든 deployment 기록을 합산합니다.
- [ ] R10 분석 목록은 `currentDeploymentId`가 있는 `published`·`unlisted` 포트폴리오를 보여 줍니다.
- [ ] R11 `sections[]`에 배포 시점 섹션 제목과 페이지 안 위치(`position`)가 들어 있습니다. 해설 작성기는 비어 있지 않은 `sections`·`referrers`를 받습니다.
- [ ] R12 `trend[]` 점마다 `contactClicks`·`fileDownloads`·`linkClicks`가 있습니다. `spark`는 위젯 지표의 값을 그립니다.
- [ ] R13 `org_domains`는 `not_collected`이고 기본 지면에서 빠집니다. 이미 굳힌 지면에 있어도 응답 `widgets`에서 빠집니다.

## 설계

**주소 소유 (R1–R3).** 주소는 `portfolios.publicSlug`(새 필드)가 가집니다. `deployments.subdomain`은 그 버전을 배포할 때의 주소를 남기는 기록이 됩니다.
- 마이그레이션 0022 `portfolio_public_slug`는 네 가지를 합니다.
  - 검증기에 `publicSlug: string|null`을 넣습니다.
  - `currentDeploymentId`의 `subdomain`으로 값을 채웁니다.
  - unique partial 인덱스 `portfolio_public_slug_key`(`publicSlug`가 string일 때)를 만듭니다.
  - `deployment_subdomain_key`를 지우고 일반 인덱스 `deployment_subdomain_idx`를 만듭니다.
- `PublishingService.publish`의 순서는 다음과 같습니다.
  1. 다른 포트폴리오의 `publicSlug`와 만료 전 `deploymentSlugRedirects.oldSlug` 가운데 이 slug가 있으면 409를 냅니다.
  2. `publicSlug`를 갱신합니다.
  3. 기존 redirect 로직은 `portfolio.publicSlug`를 기준으로 돌립니다.
  4. 경합으로 생기는 E11000 오류는 지금처럼 409로 바꿉니다.
- `getPublic` · `collect`는 `portfolios.findOne({ publicSlug, status: "published" })`에서 `currentDeploymentId`를 찾습니다.
- 예약어 검사는 새 배포가 받는 `PublicSlugSchema`(`SlugSchema.refine`)에 둡니다. 저장된 주소를 읽는 `SlugSchema`는 그대로입니다.

**서브도메인 (R4).**
- 웹 `lib/public-site.ts`에 공개 주소를 만드는 함수 두 개를 둡니다. `publicSiteHost(slug)`와 `publicSiteUrl(slug)`이고, 둘 다 `NEXT_PUBLIC_SITE_HOST`를 읽습니다. 기본값은 `expresso.ai.kr`입니다.
- 하드코딩된 `.xpresso.me` 6곳과 `lib/sample/site.ts`가 이 함수를 씁니다.
- `proxy.ts`는 맨 앞에서 Host를 봅니다. 맞으면 `NextResponse.rewrite`를 합니다. 이 경우 `matcher`가 모든 경로를 받아야 하므로, 호스트가 아니면 기존 동작으로 넘깁니다.
- 로컬에서는 `NEXT_PUBLIC_SITE_HOST=site.localhost:<포트>`를 씁니다. 워크트리 웹이 쓰는 `<이름>.localhost`와 겹치지 않게 하려는 것입니다.
- nginx는 `infra/nginx/sites.expresso.ai.kr.conf`를 새로 둡니다. `*.expresso.ai.kr`를 받아 `/v1/`은 API로, 나머지는 웹으로 보냅니다. `dev.expresso.ai.kr`는 정확한 이름이라 와일드카드보다 먼저 잡힙니다.

**수집 (R5–R8).**
- 섹션 목록은 배포 시점에 만듭니다.
  - `#snapshot`이 `generatedPage.document`를 `htmlparser2`로 읽습니다. 다른 `section` 안에 있지 않은 `<section>`을 문서 순서대로 고릅니다.
  - 각 섹션마다 `{ id: randomUUID(), title: 첫 h1–h3 텍스트 80자 | null }`를 `outline`에 넣습니다.
  - `FreeHtmlDeploymentSnapshotSchema.outline`은 optional 필드로 넣습니다. 이전 배포에는 이 필드가 없습니다.
- `collect`는 `section_view.sectionId`를 `outline` id나 기존 `sections` id에서 찾습니다.
- `site/[slug]/page.tsx`가 문서를 서빙할 때 처리하는 것은 세 가지입니다.
  - `</body>` 앞에 추적 스크립트를 넣습니다.
  - `<head>`에 CSP `default-src` 미지정 · `script-src 'sha256-X'` · `connect-src 'none'` · `object-src 'none'` · `base-uri 'none'` · `form-action 'none'`을 넣습니다.
  - sandbox를 `allow-scripts allow-popups`로 둡니다.
- 스냅샷에는 스크립트를 저장하지 않습니다.
- 스크립트(`lib/site-tracker.ts`의 문자열 상수)는 관찰만 하고 결과를 `parent.postMessage`로 넘깁니다.
  - 최상위 section 수가 `outline.length`와 같을 때만 IntersectionObserver로 섹션을 봅니다.
  - 섹션이 화면을 벗어나거나 `visibilitychange: hidden`일 때 그 구간의 체류를 한 건으로 보냅니다.
  - 스크롤이 90%에 닿으면 `complete`를 보냅니다.
  - `mailto:`·`tel:`·`linkedin.com` 링크는 `contact_click`(target은 scheme 또는 host), `download` 속성이 있거나 확장자가 `.pdf`·`.docx`인 링크는 `file_download`(파일 이름), 그 밖의 외부 링크는 `link_click`(host)으로 보냅니다.
- 부모 클라이언트 컴포넌트 `SiteFrame`이 하는 일은 다음과 같습니다.
  - `event.source === iframe.contentWindow`인 메시지만 받습니다.
  - `sessionId`를 sessionStorage에 두고, 막혀 있으면 메모리에 둡니다.
  - `eventId`와 `occurredAt`을 붙입니다.
  - `visit` 응답을 받은 뒤 나머지 이벤트를 `fetch(keepalive)`로 순서대로 보냅니다.
- 웹 라우트 `app/api/analytics/events/route.ts`는 `api/career/records/route.ts`와 같은 모양입니다. `AnalyticsEventSchema`로 검사하고, `readAccessToken()`이 있으면 Bearer를 붙여 백엔드로 넘깁니다.
- `visitorHash = analyticsDigest(salt:UTC날짜:sessionId)`입니다.

**분석 (R9–R13).**
- `AnalyticsService`의 다음 메서드는 `deploymentId: { $in: ids }`로 조회합니다: `#deployment`, `#period`, `#coverage`, `#metrics`, `dashboard`, `insight`, `requestPendingAggregation`. `#deployment`는 `{ portfolio, deployment, deploymentIds }`를 돌려줍니다.
- `metrics_daily`는 지금처럼 deployment별로 쌓고, 날짜별로 더합니다.
- 섹션 제목은 기간 안 방문이 걸린 deployment들의 `outline`에서 가져옵니다.
- `AnalyticsSectionDwellSchema`에 `position: int|null`을 넣고, `AnalyticsTrendPointSchema`에 클릭 세 필드를 넣습니다.
- `metrics.ts`의 `org_domains`에는 `missing`을 넣습니다(사유: 방문자 IP를 받지 않습니다). `DEFAULT_LAYOUT`에서도 뺍니다. `#widgetsOf`는 수집하지 않는 지표의 위젯을 응답에서 거릅니다. DB 행은 지우지 않습니다.
- `Dashboard.tsx` 변경은 네 가지입니다.
  - `Spark`가 `metricKey`에 맞는 계열을 그립니다.
  - `Trend`가 완독 선을 함께 그립니다.
  - `SectionDwell`이 `list`를 따로 그립니다.
  - 제목이 없으면 `position`번째 섹션이라고 부릅니다.
- `analytics/page.tsx`는 `published`와 `unlisted` 목록을 함께 읽습니다.

## 버린 대안

- 추적 스크립트를 스냅샷 문서에 저장하는 방법은 버렸습니다. 스크립트를 고칠 때마다 다시 배포해야 하고, 저장본에 코드가 섞입니다.
- iframe에 `allow-same-origin`을 주고 부모가 DOM을 직접 보는 방법은 버렸습니다. `allow-scripts`와 함께 주면 sandbox가 풀립니다.
- iframe 안에서 바로 `fetch`하는 방법은 버렸습니다. 출처가 `null`이라 CORS를 열어야 하고, 로그인한 주인을 가릴 수 없습니다.
- 섹션 id를 생성 HTML에 `data-*`로 박는 방법은 버렸습니다. 자유 생성 HTML의 `<section>`과 `portfolioSections`는 서로 연결되어 있지 않습니다.
- slug 소유를 `{subdomain, portfolioId}` 복합 unique로 푸는 방법은 버렸습니다. 다른 포트폴리오가 같은 주소를 가져가는 것을 막지 못합니다.
- `ex_session` 쿠키를 `.expresso.ai.kr` 전체로 넓히는 방법은 버렸습니다. 세션 토큰이 모든 공개 사이트 요청에 실립니다.

## 함정

- 서버(htmlparser2)와 브라우저(DOM)가 잘못 중첩된 HTML을 다르게 읽을 수 있습니다. 섹션 수가 다르면 섹션 이벤트를 보내지 않는 쪽을 택합니다.
- 자정을 넘긴 세션은 해시가 바뀝니다. 그래서 그 뒤의 이벤트가 409로 버려집니다. 화면은 이 응답을 무시합니다.
- 상대 경로 그림(`/v1/media/…`)은 부모 주소 기준으로 풀립니다. 서브도메인 vhost에도 `/v1/`이 있어야 합니다. CSP에 `img-src`를 걸지 않는 이유도 이것입니다.
- `matcher`를 넓히면 `proxy`가 정적 파일에서도 돕니다. 서브도메인이 아닌 요청은 기존 matcher와 같은 경로에서만 로그인 검사를 합니다.
- `POST /deployments`는 이메일 인증을 요구합니다. 확인 계정이 인증되어 있어야 합니다.

## 완료 기준

- `pnpm typecheck` · `pnpm test` · `pnpm test:infra`가 통과합니다. 새 Mongo 통합 테스트는 같은 slug 재배포, slug 변경 뒤 rollback, slug 순서 수집, deployment 두 개 합산, 해설 입력을 다룹니다.
- 브라우저에서 개발 목표 다섯 가지를 직접 확인하고 화면을 찍습니다.
