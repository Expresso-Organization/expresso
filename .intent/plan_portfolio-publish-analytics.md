---
title: 포트폴리오 배포 · 방문 수집 · 분석 화면 연결
slug: portfolio-publish-analytics
stage: plan
status: accepted
intent: .intent/intent_portfolio-publish-analytics.md
spec: .intent/spec_portfolio-publish-analytics.md
date: 2026-10-28
---

# 포트폴리오 배포 · 방문 수집 · 분석 화면 연결 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/contracts/src/publishing.ts` | `SlugSchema` 예약어 검사, `FreeHtmlDeploymentSnapshotSchema.outline` |
| `packages/contracts/src/analytics.ts` | 섹션 `position`, 추이 점의 클릭 세 필드 |
| `packages/database/src/mongodb-migrations/0022/migration.ts` (새 파일) | `publicSlug` 검증기 · 값 채우기 · 인덱스, `deployment_subdomain_key` 교체 |
| `packages/database/src/mongo-migrations.ts` | 0022 등록 |
| `packages/database/src/documents/generation.ts` | `PortfolioDoc.publicSlug` |
| `services/backend/package.json` | `htmlparser2` 명시 의존성(잠금 파일에 이미 있는 10.1.0) |
| `services/backend/src/modules/publishing/outline.ts` (새 파일) · `outline.test.ts` | 문서에서 섹션 목록 뽑기 |
| `services/backend/src/modules/publishing/service.ts` | 주소 소유 · `outline` 저장 · 공개 조회 |
| `services/backend/src/modules/publishing/mongodb.integration.test.ts` | 같은 slug 재배포, slug 변경 뒤 rollback |
| `services/backend/src/modules/analytics/service.ts` | slug로 찾기, 날짜 해시, 포트폴리오 단위 합산, 섹션 제목, 해설 입력 |
| `services/backend/src/modules/analytics/metrics.ts` | `org_domains` 수집 안 함, 기본 지면에서 제외 |
| `services/backend/src/modules/analytics/mongo.integration.test.ts` | 수집 순서, 두 deployment 합산, 해설 입력 |
| `services/backend/src/modules/jobs/ingest/adapter.ts` | User-Agent 주소를 `expresso.ai.kr`로 |
| `services/web/src/lib/public-site.ts` (새 파일) | 공개 주소 함수 |
| `services/web/src/lib/site-tracker.ts` (새 파일) | 추적 스크립트 문자열 · 해시 · 메시지 타입 |
| `services/web/src/proxy.ts` | 서브도메인 rewrite, matcher |
| `services/web/src/app/site/[slug]/page.tsx` · `SiteFrame.tsx` (새 파일) | 스크립트 · CSP 주입, 메시지 중계 |
| `services/web/src/app/api/analytics/events/route.ts` (새 파일) | 백엔드로 넘기는 웹 라우트 |
| `services/web/src/app/(app)/analytics/page.tsx` · `Dashboard.tsx` · `page.module.css` | 목록 범위, Spark · 추이 · 섹션 목록 |
| `DeployPanel.tsx` · `Editor.tsx` · `home/page.tsx` · `AppChrome.tsx` · `lib/sample/site.ts` | 주소 표기 |
| `services/web/.env.example` | `NEXT_PUBLIC_SITE_HOST` |
| `infra/nginx/sites.expresso.ai.kr.conf` (새 파일) · `docs/operations/ORACLE_HOSTING.md` | 와일드카드 vhost, DNS · 인증서 절차 |

구현 중에 이 표를 벗어나면 같은 커밋에서 이 파일을 고칩니다.

## 작업 순서

1. 같은 slug 재배포 통합 테스트를 먼저 씁니다. 지금 코드에서 409로 실패하는 것을 확인합니다.
2. 계약 · 마이그레이션 0022 · `PortfolioDoc`를 바꿉니다. 로컬 DB에 `pnpm db:migrate`를 돌리고 `portfolios` 인덱스 목록을 봅니다. 번호는 원격 브랜치 최대값 0021 다음으로 정했고, 로컬 DB(`--port 57017`)의 적용 목록에서 0022가 비어 있는지 다시 확인합니다.
3. `outline.ts`와 단위 테스트를 만듭니다. 중첩 section, 제목 없는 section, section이 없는 문서를 다룹니다.
4. `PublishingService`를 고칩니다. 1단계 테스트와 rollback 테스트가 통과해야 합니다.
5. `AnalyticsService` · `metrics.ts`를 고치고 통합 테스트를 더합니다. `pnpm test:infra`가 통과해야 합니다.
6. 웹 `public-site.ts`로 주소 표기를 바꿉니다. `rg "xpresso\.me" services`의 결과가 0건이어야 합니다.
7. 추적 스크립트 · `SiteFrame` · 웹 라우트 · CSP를 만듭니다. 브라우저 네트워크 탭에서 `/api/analytics/events` 202를 확인합니다.
8. `proxy.ts` 서브도메인 처리를 넣습니다. `jiwon.site.localhost:<포트>/`는 사이트가 보이고 `/home`은 404여야 합니다.
9. 대시보드 그림을 고칩니다. 화면에서 Spark · 완독 선 · 섹션 목록을 확인합니다.
10. nginx 파일과 운영 문서를 씁니다. 로컬에 nginx가 없으므로 `nginx -t`는 서버에서 돌립니다. 이 사실은 PR에 적습니다.

## 가장 위험한 단계

2단계 마이그레이션이 가장 위험합니다. 운영 DB의 unique 인덱스를 지우고 새로 만듭니다.
- 값 채우기가 끝나기 전에 새 인덱스를 만들면 중복은 없지만 빈 값이 생길 수 있습니다. 그래서 채우기 → 인덱스 순서로 단계를 나눕니다.
- 실패하면 되돌리는 순서는 다음과 같습니다. 0022 단계를 역순으로 수동 실행합니다: `portfolio_public_slug_key`를 drop하고, `deployment_subdomain_idx`를 drop한 뒤 `deployment_subdomain_key`를 다시 만듭니다. 그다음 이전 코드를 배포합니다. `publicSlug` 필드는 남아도 이전 코드가 읽지 않습니다.

7단계는 보안상 위험합니다. iframe에 `allow-scripts`를 줍니다. 브라우저 콘솔에서 두 가지를 확인합니다.
- iframe 안에서 `document.cookie`와 `parent.document` 접근이 막혀 있어야 합니다.
- 해시가 맞지 않는 인라인 스크립트가 CSP에 막혀야 합니다.

## 검증

```
pnpm typecheck
pnpm test
pnpm test:infra
```

확인할 화면은 워크트리 서버(웹 31xx · API 41xx · 워커, 별도 DB와 `QUEUE_PREFIX`)에서 봅니다. 앱 주소는 `pa.localhost:<포트>`, 공개 사이트 주소는 `<slug>.site.localhost:<포트>`입니다. 계정은 dev01이고, 이메일 인증 여부와 `ready` 생성 페이지가 있는지 먼저 확인합니다.

1. 편집 → 배포에서 같은 주소로 두 번 배포합니다. 버전 목록에 v1 · v2가 보여야 합니다.
2. 쿠키가 없는 탭에서 공개 주소를 엽니다. 끝까지 스크롤하고 메일 링크를 누릅니다.
3. 분석 → 지금 집계를 누릅니다. 방문 · 완독 · 연락처 클릭 · 섹션 제목이 보여야 합니다.
4. 앱 탭에서 `/site/<slug>`를 엽니다. 다시 집계해도 방문 수가 그대로여야 합니다.
5. 라이트 · 다크 테마와 390px 폭에서 대시보드를 찍습니다.
