# 7. API 설계

## 7.1. 서버/클라이언트 구조

> `[그림 7.1] 서버 인터페이스 구조 — 아래 구성을 PPT로 그려 캡처한다.`

```text
┌─ Client ──────────────┐              ┌─ Server (AI서비스) ─────────────────┐
│                       │              │ ┌──────────┬────────────┬────────┐ │
│  요청/응답 처리         │              │ │ REST     │ 해당기능처리 │ REST   │ │
│  ┌─────────────────┐  │   REST API   │ │ 메시지    │            │ 메시지  │ │
│  │ 타입 계약        │  │◀────────────▶│ │ 분석(URI) │ 도메인 모듈 │ 생성    │ │
│  │ @expresso/      │  │   JSON       │ │          │            │ (URI)  │ │
│  │ contracts (zod) │  │              │ ├──────────┴────────────┴────────┤ │
│  └─────────────────┘  │              │ │ 메시지 수신          메시지 송신  │ │
│  fetch                │              │ └────────────────────────────────┘ │
│  HTTP                 │              │  Fastify 5 (HTTP)                  │
│  TCP/IP               │              │  Node.js 24 (TCP/IP)               │
└───────────────────────┘              └────────────────────────────────────┘
             │                                          │
             └──────────────── 인터넷 ────────────────────┘
```

### 계약 공유

클라이언트와 서버는 요청·응답 스키마를 **같은 코드**로 공유한다. `packages/contracts`에
zod 스키마를 두고, 서버는 검증에, 클라이언트는 타입에 쓴다. 스키마가 바뀌면 두 쪽이 함께
깨지므로 불일치가 배포 후가 아니라 빌드 때 드러난다.

### 공통 규격

| 항목 | 값 |
| --- | --- |
| 기본 경로 | `/v1` (`API_PREFIX`) |
| 형식 | `application/json` |
| 인증 | `httpOnly` 세션 쿠키 (`ex_session`) |
| 요청 ID | 응답 헤더 `x-request-id` |
| 낙관적 잠금 | `If-Match` 요청 헤더 · `ETag` 응답 헤더 |
| 멱등성 | `Idempotency-Key` 헤더 (생성 계열) |
| 타임아웃 | 30초 (`requestTimeoutMs`) |

### 오류 응답 형식

모든 오류는 같은 형태로 답한다(`services/backend/src/api/error-handler.ts`).

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "requestId": "req_0f8a...",
    "details": {}
  }
}
```

`message`는 상태 코드마다 고정된 문구다. 내부 사정을 문장으로 흘리지 않기 위해서다.
자세한 원인은 서버 로그에만 남고, 클라이언트는 `requestId`로 찾아본다.

## 7.2. 서비스 REST API 정의

2026-09-28 시점의 Fastify HTTP 경로 정의는 163개다. 상태 확인 경로 2개를 제외한
`/v1` 경로는 161개다. 이 중 커리어 편집기 경로 10개는 기능 플래그가 켜질 때 등록된다.
기본 설정에서 등록되는 HTTP 경로는 153개다. 아래 목록은 `services/backend/src/modules/**/routes.ts`와
`jobs/board-routes.ts`의 등록 코드를 기준으로 하며, 반복 등록되는 인터뷰 상태 2개와
AI 제안 상태 3개를 각각 풀어 센다. 커리어 문서 편집 경로는
`CAREER_EDITOR_V2_ENABLED=true`일 때 등록된다. WebSocket 세션 경로는 REST 수에
포함하지 않는다.

**GET** (62개)

| Method | URI | 모듈 |
| --- | --- | --- |
| GET | `/health/live` | system |
| GET | `/health/ready` | system |
| GET | `/v1/account/export` | account-lifecycle |
| GET | `/v1/analytics/metrics` | analytics |
| GET | `/v1/brew-jobs/:id` | brew-jobs |
| GET | `/v1/brews/:brewId/company-research` | company-research |
| GET | `/v1/brews/:id` | materials |
| GET | `/v1/brews/:id/materials` | materials |
| GET | `/v1/career/categories` | career |
| GET | `/v1/career/categories/:categoryId/view-configurations` | career |
| GET | `/v1/career/categories/:categoryId/views` | career |
| GET | `/v1/career/profile` | career |
| GET | `/v1/career/records` | career |
| GET | `/v1/career/records/:recordId` | career |
| GET | `/v1/career/records/:recordId/ai-proposals/:proposalId` | career-editor |
| GET | `/v1/career/records/:recordId/delete-impact` | career |
| GET | `/v1/career/records/:recordId/document` | career-editor |
| GET | `/v1/career/records/:recordId/document/revisions` | career-editor |
| GET | `/v1/career/records/:recordId/links` | career |
| GET | `/v1/career/records/:recordId/relations` | career |
| GET | `/v1/career/skills` | career |
| GET | `/v1/career/skills/:skillId/evidence` | career |
| GET | `/v1/career/view-configurations/:viewId/query` | career |
| GET | `/v1/companies/:id/logo` | jobs |
| GET | `/v1/consents` | consent |
| GET | `/v1/deployments/:id/analytics/derived` | analytics |
| GET | `/v1/deployments/:id/analytics/insight` | analytics |
| GET | `/v1/design-system-revisions/:id` | design-systems |
| GET | `/v1/design-systems` | design-systems |
| GET | `/v1/design-systems/:id` | design-systems |
| GET | `/v1/entitlements/:capability` | entitlements |
| GET | `/v1/export-jobs/:id` | publishing |
| GET | `/v1/generation-jobs/:id` | generation |
| GET | `/v1/generation-jobs/:id/page-stream` | generation |
| GET | `/v1/home` | engagement |
| GET | `/v1/interview-sessions/:id` | interview |
| GET | `/v1/job-analyses/:id` | job-analysis |
| GET | `/v1/job-sources` | jobs |
| GET | `/v1/jobs/postings` | jobs |
| GET | `/v1/jobs/postings/:id` | jobs |
| GET | `/v1/jobs/recent-searches` | jobs |
| GET | `/v1/jobs/saved-searches` | jobs |
| GET | `/v1/me` | identity |
| GET | `/v1/media` | media |
| GET | `/v1/media/:id` | media |
| GET | `/v1/notification-preferences` | engagement |
| GET | `/v1/notifications` | engagement |
| GET | `/v1/portfolios` | portfolios |
| GET | `/v1/portfolios/:id` | portfolios |
| GET | `/v1/portfolios/:id/analytics/dashboard` | analytics |
| GET | `/v1/portfolios/:id/deployments` | publishing |
| GET | `/v1/portfolios/:id/layouts` | layout |
| GET | `/v1/portfolios/:id/page` | page |
| GET | `/v1/portfolios/:id/page/document` | page |
| GET | `/v1/portfolios/:id/page/history` | page |
| GET | `/v1/portfolios/:id/page/stream` | page |
| GET | `/v1/portfolios/:id/revisions` | portfolios |
| GET | `/v1/public/assets/:id` | publishing |
| GET | `/v1/public/portfolios/:slug` | publishing |
| GET | `/v1/recipes/:id` | recipe |
| GET | `/v1/recipes/:id/template-previews` | templates |
| GET | `/v1/search` | engagement |

**POST** (75개)

| Method | URI | 모듈 |
| --- | --- | --- |
| POST | `/v1/account/deletion` | account-lifecycle |
| POST | `/v1/account/deletion/cancel` | account-lifecycle |
| POST | `/v1/analytics/events` | analytics |
| POST | `/v1/assets/:id/signed-url` | publishing |
| POST | `/v1/auth/google` | identity |
| POST | `/v1/auth/google/link` | identity |
| POST | `/v1/auth/login` | identity |
| POST | `/v1/auth/logout` | identity |
| POST | `/v1/auth/signup` | identity |
| POST | `/v1/brews` | materials |
| POST | `/v1/brews/:id/design-selection` | design-systems |
| POST | `/v1/brews/:id/interview-sessions` | interview |
| POST | `/v1/brews/:id/recipes` | recipe |
| POST | `/v1/brews/free` | materials |
| POST | `/v1/career/categories` | career |
| POST | `/v1/career/categories/:categoryId/property-schema/:propertyId/restore` | career |
| POST | `/v1/career/categories/:categoryId/property-schema/apply` | career |
| POST | `/v1/career/categories/:categoryId/property-schema/preview` | career |
| POST | `/v1/career/categories/:categoryId/view-configurations` | career |
| POST | `/v1/career/categories/:categoryId/view-configurations/reorder` | career |
| POST | `/v1/career/categories/:categoryId/views` | career |
| POST | `/v1/career/formulas/preview` | career |
| POST | `/v1/career/records` | career |
| POST | `/v1/career/records/:recordId/ai-proposals` | career-editor |
| POST | `/v1/career/records/:recordId/ai-proposals/:proposalId/apply` | career-editor |
| POST | `/v1/career/records/:recordId/ai-proposals/:proposalId/cancel` | career-editor |
| POST | `/v1/career/records/:recordId/ai-proposals/:proposalId/reject` | career-editor |
| POST | `/v1/career/records/:recordId/ai-proposals/:proposalId/undo` | career-editor |
| POST | `/v1/career/records/:recordId/document/revisions/:revisionId/restore` | career-editor |
| POST | `/v1/career/records/:recordId/document/updates` | career-editor |
| POST | `/v1/career/records/:recordId/links` | career |
| POST | `/v1/career/records/:recordId/move` | career |
| POST | `/v1/career/records/:recordId/move/preview` | career |
| POST | `/v1/career/records/:recordId/restore` | career |
| POST | `/v1/career/rollups/preview` | career |
| POST | `/v1/career/skills/recompute` | career |
| POST | `/v1/career/view-configurations/:viewId/duplicate` | career |
| POST | `/v1/consents` | consent |
| POST | `/v1/deployments/:id/analytics/aggregate` | analytics |
| POST | `/v1/generation-jobs` | generation |
| POST | `/v1/interview-sessions/:id/pause` | interview |
| POST | `/v1/interview-sessions/:id/questions/:questionId/replace` | interview |
| POST | `/v1/interview-sessions/:id/questions/:questionId/skip` | interview |
| POST | `/v1/interview-sessions/:id/resume` | interview |
| POST | `/v1/job-analyses/:id/reanalyze` | job-analysis |
| POST | `/v1/job-sources` | jobs |
| POST | `/v1/job-sources/:id/runs` | jobs |
| POST | `/v1/job-sources/runs` | jobs |
| POST | `/v1/jobs/demand-summary` | jobs |
| POST | `/v1/jobs/postings/:id/analyses` | jobs |
| POST | `/v1/jobs/postings/:id/match` | jobs |
| POST | `/v1/jobs/saved-searches` | jobs |
| POST | `/v1/jobs/search/interpret` | jobs |
| POST | `/v1/jobs/submissions` | jobs |
| POST | `/v1/jobs/url-imports` | jobs |
| POST | `/v1/media` | media |
| POST | `/v1/portfolio-edit-proposals/:id/apply` | portfolio-editing |
| POST | `/v1/portfolio-revisions/:id/revert` | portfolio-editing |
| POST | `/v1/portfolios/:id/analytics/aggregate` | analytics |
| POST | `/v1/portfolios/:id/analytics/insight` | analytics |
| POST | `/v1/portfolios/:id/blocks/:blockId/duplicate` | portfolio-editing |
| POST | `/v1/portfolios/:id/blocks/:blockId/edit-preview` | portfolio-editing |
| POST | `/v1/portfolios/:id/dashboard-layout` | analytics |
| POST | `/v1/portfolios/:id/dashboard-views` | analytics |
| POST | `/v1/portfolios/:id/deployments` | publishing |
| POST | `/v1/portfolios/:id/deployments/:deploymentId/rollback` | publishing |
| POST | `/v1/portfolios/:id/exports` | publishing |
| POST | `/v1/portfolios/:id/layouts/:layoutId/select` | layout |
| POST | `/v1/portfolios/:id/layouts/remix` | layout |
| POST | `/v1/portfolios/:id/page` | page |
| POST | `/v1/portfolios/:id/restore` | portfolio-editing |
| POST | `/v1/portfolios/:id/resume-assets` | publishing |
| POST | `/v1/portfolios/:id/sections/:sectionId/media-blocks` | media |
| POST | `/v1/portfolios/:id/widgets` | analytics |
| POST | `/v1/recipes/:id/revisions/:revisionId/restore-item` | recipe |

**PUT** (7개)

| Method | URI | 모듈 |
| --- | --- | --- |
| PUT | `/v1/brews/:brewId/company-research` | company-research |
| PUT | `/v1/brews/:id/materials` | materials |
| PUT | `/v1/career/profile` | career |
| PUT | `/v1/career/records/:recordId/relations` | career |
| PUT | `/v1/interview-sessions/:id/answers/:questionId` | interview |
| PUT | `/v1/jobs/postings/:id/interest` | jobs |
| PUT | `/v1/notification-preferences/:kind` | engagement |

**PATCH** (10개)

| Method | URI | 모듈 |
| --- | --- | --- |
| PATCH | `/v1/brews/:id` | materials |
| PATCH | `/v1/career/categories/:categoryId/property-schema` | career |
| PATCH | `/v1/career/records/:recordId` | career |
| PATCH | `/v1/career/view-configurations/:viewId` | career |
| PATCH | `/v1/portfolios/:id/sections/:sectionId` | portfolio-editing |
| PATCH | `/v1/portfolios/:id/sections/:sectionId/blocks/order` | portfolio-editing |
| PATCH | `/v1/portfolios/:id/sections/order` | portfolio-editing |
| PATCH | `/v1/portfolios/:id/widgets/order` | analytics |
| PATCH | `/v1/recipes/:id` | recipe |
| PATCH | `/v1/widgets/:id` | analytics |

**DELETE** (9개)

| Method | URI | 모듈 |
| --- | --- | --- |
| DELETE | `/v1/career/records/:recordId` | career |
| DELETE | `/v1/career/view-configurations/:viewId` | career |
| DELETE | `/v1/consents/:scope` | consent |
| DELETE | `/v1/identity/sessions/:sessionId` | identity |
| DELETE | `/v1/jobs/recent-searches/:id` | jobs |
| DELETE | `/v1/portfolios/:id/blocks/:blockId` | portfolio-editing |
| DELETE | `/v1/portfolios/:id/dashboard-layout` | analytics |
| DELETE | `/v1/portfolios/:id/publication` | publishing |
| DELETE | `/v1/widgets/:id` | analytics |

### 명사형 위반 검토

양식은 URI가 반드시 명사형일 것을 요구한다. 현재 형상에서 어긋나는 것들이다.

| URI | 문제 | 수정안 |
| --- | --- | --- |
| `POST /v1/career/skills/recompute` | `recompute`가 동사 | `POST /v1/career/skill-recomputations` |
| `POST /v1/jobs/search/interpret` | `interpret`가 동사 | `POST /v1/jobs/search-interpretations` |
| `POST /v1/job-analyses/:id/reanalyze` | `reanalyze`가 동사 | `POST /v1/job-analyses/:id/reruns` |
| `POST /v1/portfolios/:id/layouts/remix` | `remix`가 동사 | `POST /v1/portfolios/:id/layout-remixes` |
| `POST /v1/.../layouts/:layoutId/select` | `select`가 동사 | `PUT /v1/portfolios/:id/selected-layout` |
| `POST /v1/portfolio-edit-proposals/:id/apply` | `apply`가 동사 | `POST /v1/portfolio-edit-proposals/:id/applications` |
| `POST /v1/portfolio-revisions/:id/revert` | `revert`가 동사 | `POST /v1/portfolio-revisions/:id/reversions` |
| `POST /v1/portfolios/:id/restore` | `restore`가 동사 | `POST /v1/portfolios/:id/restorations` |
| `POST /v1/.../deployments/:id/rollback` | `rollback`가 동사 | `POST /v1/portfolios/:id/deployments/:id/rollbacks` |
| `POST /v1/.../questions/:id/replace` | `replace`가 동사 | `PUT /v1/interview-sessions/:id/questions/:id` |
| `POST /v1/.../questions/:id/skip` | `skip`가 동사 | `PUT /v1/.../questions/:id/skipped` |
| `POST /v1/interview-sessions/:id/pause\|resume` | 동사 | `PUT /v1/interview-sessions/:id/state` |
| `POST /v1/recipes/:id/revisions/:id/restore-item` | 동사 | `POST /v1/recipes/:id/item-restorations` |
| `POST /v1/jobs/postings/:id/match` | 동사 | `POST /v1/jobs/postings/:id/match-scores` |
| `POST /v1/jobs/demand-summary` | 동사구 | `GET /v1/jobs/demand-summaries` |
| `POST /v1/.../analytics/aggregate` | `aggregate`가 동사 | `POST /v1/.../analytics/aggregations` |
| `POST /v1/blocks/:id/duplicate` | `duplicate`가 동사 | `POST /v1/.../blocks/:id/duplications` |
| `POST /v1/blocks/:blockId/edit-preview` | 동사구 | `POST /v1/.../blocks/:id/edit-previews` |
| `POST /v1/assets/:id/signed-url` | 허용 | 명사구 |

위 표는 현행 URI에서 명사형 원칙과 어긋나는 대표 경로를 기록한다. 경로를 바꿀 때는
`packages/contracts`와 웹 호출부를 함께 변경한다.

## 7.3. 서비스 REST API 설계

7.2에서 정의한 모든 API를 상세하게 설계한다. 각 API마다 요청과 응답의 방향, 파라메터 목록, 실제 전송 내용을 적는다. 다만 163개 가운데 상당수는 **요청과 응답의 형태가 서로 같다.** 목록 조회는 어느 경로든 쿼리로 거르고 커서로 이어 받으며, 생성은 어느 경로든 `Idempotency-Key`를 요구한다.

따라서 형태가 서로 다른 9개(1 – 9)를 먼저 설계하고, 2.5 · 2.6의 주요기능 가운데 대표 API가 없는 기능마다 1개씩 17개(10 – 26)를 더해 **26개를 설계**한다. 나머지는 아래 유형에 귀속시킨다. 유형이 같으면 경로와 필드 이름만 달라지며, 그 값은 `packages/contracts/src/`의 zod 스키마에 있다. 스키마가 계약의 원본이므로 본 절과 어긋나면 스키마를 따른다.

### 요청 · 응답 유형

| 유형 | 요청과 응답의 특징 | 대표 | 해당 범위 |
| --- | --- | --- | --- |
| 목록 조회 | 쿼리로 거르고 커서로 이어 받는다. 200 | 7.3.1 · 7.3.13 · 7.3.14 · 7.3.17 | GET 62건 중 목록 |
| 단건 조회 | 경로 파라메터로 하나를 읽는다. 200 | 7.3.1 · 7.3.16 · 7.3.24 · 7.3.25 · 7.3.26 | GET 62건 중 단건 |
| 생성 | `Idempotency-Key`로 중복 생성을 막는다. 201 | 7.3.2 · 7.3.10 · 7.3.11 · 7.3.15 · 7.3.18 · 7.3.21 · 7.3.22 · 7.3.23 | POST 75건 중 생성 |
| 조건부 수정 | `If-Match`로 버전을 확인한다. 200 또는 409 | 7.3.3 · 7.3.12 | PATCH 10 · PUT 7 |
| 삭제 | 영향 범위를 먼저 알린 뒤 지운다. 204 | 7.3.4 | DELETE 9 |
| 비동기 접수 | 작업 식별자를 담아 202를 돌려준다 | 7.3.5 · 7.3.19 · 7.3.20 | POST 75건 중 비동기 |
| 일치도 산출 | 공고 요건과 사용자 기록의 축별 충족 내역과 점수를 돌려준다. 200 | 7.3.6 | 일치도 경로 |
| 스트림 | `text/event-stream`으로 진행을 밀어 준다 | 7.3.7 | 1건 |
| 공개 조회 | 인증이 없다. 배포 스냅샷만 노출한다 | 7.3.8 | 4건 |
| 서명 URL | 만료가 있는 임시 주소를 발급한다 | 7.3.9 | 1건 |

열 유형이 163개 HTTP 경로의 형태를 모두 포함한다. 메서드별 분포는 GET 62 · POST 75 · PATCH 10 · DELETE 9 · PUT 7이다.

### 1) 기록 목록 조회

유형 **목록 조회** · `GET /v1/career/records`

> `[그림 7.3.1 기록 목록 조회의 요청 · 응답 방향]` — HTML 본문의 SVG를 참조한다.

| 속성 | IN | OUT | Type | Description |
| --- | --- | --- | --- | --- |
| `categoryId` | O | — | uuid | 카테고리로 거른다. 없으면 전체 |
| `status` | O | — | String | `draft` · `organized` · `verified` |
| `origin` | O | — | String | `manual` · `ai` · `interview` · `import` |
| `q` | O | — | String | 제목에서 찾는다. 1 – 200자 |
| `sort` | O | — | String | `updated_desc` · `updated_asc` · `title_asc` · `period_desc` · `period_asc`, 기본값 `updated_desc` |
| `cursor` | O | — | String | 이어 받을 위치 |
| `limit` | O | — | int | 1 – 100, 기본값 50 |
| `data` | — | O | Array | 기록 목록 |
| `page` | — | O | Object | `{nextCursor, hasNextPage}`. 다음 쪽이 없으면 `nextCursor`는 null |
| `summary` | — | O | Object | `{total, draft, organized, verified, empty}`. 조건에 맞는 기록의 상태별 개수 |

표 7.3.1 기록 목록 조회의 파라메터

```ts
// 실제 전송내용 (IN)
전송방향 : IN
GET /v1/career/records?categoryId=7a1c9e42-2b3d-4f5e-8a6b-1c2d3e4f5a6b&status=organized&sort=updated_desc&limit=50
```

```ts
// 실제 전송내용 (OUT)
전송방향 : OUT
{
  "data": [
    {
      "id": "0b6f2a3e-5c1d-4e8a-9f27-3d4c5b6a7e81",
      "categoryId": "7a1c9e42-2b3d-4f5e-8a6b-1c2d3e4f5a6b",
      "categoryKey": "project",
      "title": "사내 검색 개편",
      "status": "organized",
      "origin": "manual",
      "properties": { "role": "백엔드 리드" },
      "bodyMd": "검색 지연을 320ms에서 90ms로 줄였다.",
      "isEmpty": false,
      "periodFrom": "2025-03-01",
      "periodTo": "2025-09-30",
      "linkCount": 2,
      "usedInCount": 3,
      "version": 7,
      "createdAt": "2026-08-01T01:20:00.000Z",
      "updatedAt": "2026-08-11T04:12:33.000Z"
    }
  ],
  "page": { "nextCursor": null, "hasNextPage": false },
  "summary": { "total": 1, "draft": 0, "organized": 1, "verified": 0, "empty": 0 }
}
```

목록은 커서 방식으로 이어 받으며 쪽 번호는 사용하지 않는다. 기록이 추가되거나 지워져도 이미 본 항목이 다시 나오거나 건너뛰지 않기 때문이다. `usedInCount`는 그 기록을 인용한 포트폴리오 수이며, 화면의 「사용처 N곳」에 그대로 쓰인다.

### 2) 기록 생성

유형 **생성** · `POST /v1/career/records`

> `[그림 7.3.2 기록 생성의 요청 · 응답 방향]` — HTML 본문의 SVG를 참조한다.

| 속성 | IN | OUT | Type | Description |
| --- | --- | --- | --- | --- |
| `Idempotency-Key` | O | — | Header | 필수. 같은 키로 다시 보내면 이미 만든 기록을 돌려준다 |
| `categoryId` | O | — | uuid | 필수 |
| `title` | O | — | String | 최대 300자, 기본값 빈 문자열 |
| `properties` | O | — | Object | 카테고리 속성 스키마를 따른다 |
| `bodyMd` | O | — | String | 최대 200,000자 |
| `ETag` | — | O | Header | 생성된 기록의 버전. 형식은 `"v1"` |
| `data` | — | O | Object | 생성된 기록. 처음 상태는 `draft` |
| `resource` | — | O | Object | `{version, updatedAt}` |

표 7.3.2 기록 생성의 파라메터

```ts
// 실제 전송내용 (IN)
전송방향 : IN
Idempotency-Key: 4b1f9c2e-7a30-4d55-9c11-8e2f0a6d34bb
{
  "categoryId": "7a1c9e42-2b3d-4f5e-8a6b-1c2d3e4f5a6b",
  "title": "사내 검색 개편",
  "properties": { "period": { "type": "date", "value": { "start": "2025-03-01", "end": "2025-09-30", "timezone": null } } },
  "bodyMd": "검색 지연을 320ms에서 90ms로 줄였다."
}
```

```ts
// 실제 전송내용 (OUT)
전송방향 : OUT
HTTP 201 Created
ETag: "v1"
{
  "data": {
    "id": "0b6f2a3e-5c1d-4e8a-9f27-3d4c5b6a7e81",
    "categoryId": "7a1c9e42-2b3d-4f5e-8a6b-1c2d3e4f5a6b",
    "title": "사내 검색 개편",
    "status": "draft",
    "origin": "manual",
    "properties": { "period": { "type": "date", "value": { "start": "2025-03-01", "end": "2025-09-30", "timezone": null } } },
    "bodyMd": "검색 지연을 320ms에서 90ms로 줄였다.",
    "version": 1,
    "createdAt": "2026-08-14T02:10:11.000Z",
    "updatedAt": "2026-08-14T02:10:11.000Z"
  },
  "resource": { "version": 1, "updatedAt": "2026-08-14T02:10:11.000Z" }
}
```

`Idempotency-Key`는 16자 이상 128자 이하여야 하고 안전한 문자만 허용한다. 네트워크가 끊겨 클라이언트가 재시도하더라도 기록이 두 벌 생기지 않게 하는 장치이며, 서버는 새로 만들지 않고 첫 요청이 만든 기록을 200으로 돌려준다. 같은 키에 다른 본문을 보내면 409이다.

### 3) 기록 수정

유형 **조건부 수정** · `PATCH /v1/career/records/:recordId`

> `[그림 7.3.3 기록 수정의 요청 · 응답 방향]` — HTML 본문의 SVG를 참조한다.

| 속성 | IN | OUT | Type | Description |
| --- | --- | --- | --- | --- |
| `recordId` | O | — | uuid | 경로 파라메터 |
| `If-Match` | O | — | Header | 현재 버전의 ETag(`"v7"` 형식). 없으면 400, 어긋나면 412 |
| `title` | O | — | String | 넷 중 하나 이상은 있어야 한다 |
| `status` | O | — | String | `draft` · `organized` · `verified` |
| `properties` | O | — | Object | — |
| `bodyMd` | O | — | String | — |
| `ETag` | — | O | Header | 올라간 버전. 다음 수정의 `If-Match`에 쓴다 |
| `data` | — | O | Object | 갱신된 기록 |
| `resource` | — | O | Object | 올라간 버전 |

표 7.3.3 기록 수정의 파라메터

```ts
// 실제 전송내용 (IN)
전송방향 : IN
If-Match: "v7"
{
  "bodyMd": "검색 지연을 320ms에서 90ms로 줄였다. 색인 크기는 1.4배가 되었다."
}
```

```ts
// 실제 전송내용 (OUT)
전송방향 : OUT
ETag: "v8"
{
  "data": {
    "id": "0b6f2a3e-5c1d-4e8a-9f27-3d4c5b6a7e81",
    "categoryId": "7a1c9e42-2b3d-4f5e-8a6b-1c2d3e4f5a6b",
    "title": "사내 검색 개편",
    "status": "organized",
    "origin": "manual",
    "properties": { "role": "백엔드 리드" },
    "bodyMd": "검색 지연을 320ms에서 90ms로 줄였다. 색인 크기는 1.4배가 되었다.",
    "version": 8,
    "createdAt": "2026-08-01T01:20:00.000Z",
    "updatedAt": "2026-08-14T02:31:40.000Z"
  },
  "resource": { "version": 8, "updatedAt": "2026-08-14T02:31:40.000Z" }
}

버전이 어긋난 경우
HTTP 412
{ "error": { "code": "PRECONDITION_FAILED", "message": "Resource version is stale",
             "requestId": "req_0f8a2c91-3b4d-4e5f-a6b7-c8d9e0f1a2b3" } }
```

네 필드 가운데 하나도 없으면 400이다. 빈 수정 요청이 버전만 올리는 것을 막기 위해서이다. 412를 받은 클라이언트는 최신 상태를 다시 읽어 사용자에게 무엇이 달라졌는지 보여 준 뒤 재시도한다.

### 4) 기록 삭제와 영향 범위

유형 **삭제** · `GET /v1/career/records/:recordId/delete-impact · DELETE`

> `[그림 7.3.4 기록 삭제와 영향 범위의 요청 · 응답 방향]` — HTML 본문의 SVG를 참조한다.

| 속성 | IN | OUT | Type | Description |
| --- | --- | --- | --- | --- |
| `recordId` | O | O | uuid | 경로 파라메터. 응답에도 담긴다 |
| `data` | — | O | Object | 영향 범위. 아래 필드를 담는다. `DELETE`도 같은 모양을 돌려준다 |
| `portfolioCount` | — | O | int | 이 기록을 인용한 포트폴리오 수 |
| `blockCount` | — | O | int | 영향을 받는 블록 수 |
| `deletedAt` | — | O | Timestamp | 삭제 시각. 영향 범위 조회에서는 조회 시각 |
| `purgeAfter` | — | O | Timestamp | 삭제 시각으로부터 30일. 이후에는 복구할 수 없다 |

표 7.3.4 기록 삭제와 영향 범위의 파라메터

```ts
// 실제 전송내용 (IN)
전송방향 : IN
GET /v1/career/records/0b6f2a3e-5c1d-4e8a-9f27-3d4c5b6a7e81/delete-impact
```

```ts
// 실제 전송내용 (OUT)
전송방향 : OUT
{
  "data": {
    "recordId": "0b6f2a3e-5c1d-4e8a-9f27-3d4c5b6a7e81",
    "portfolioCount": 3,
    "blockCount": 11,
    "deletedAt": "2026-08-14T02:40:00.000Z",
    "purgeAfter": "2026-09-13T02:40:00.000Z"
  }
}

삭제 실행
DELETE /v1/career/records/0b6f2a3e-5c1d-4e8a-9f27-3d4c5b6a7e81  →  HTTP 200
{ "data": { "recordId": "0b6f2a3e-5c1d-4e8a-9f27-3d4c5b6a7e81", "portfolioCount": 3, "blockCount": 11,
             "deletedAt": "2026-08-14T02:41:05.000Z", "purgeAfter": "2026-09-13T02:41:05.000Z" } }
```

삭제를 바로 실행하지 않고 영향 범위를 먼저 알려 준다. 이미 배포된 포트폴리오가 그 기록을 인용하고 있을 수 있기 때문이다. 삭제 후에도 `purgeAfter`까지는 `POST …/restore`로 되돌릴 수 있다.

### 5) 공고 분석 접수

유형 **비동기 접수** · `POST /v1/jobs/postings/:id/analyses`

> `[그림 7.3.5 공고 분석 접수의 요청 · 응답 방향]` — HTML 본문의 SVG를 참조한다.

| 속성 | IN | OUT | Type | Description |
| --- | --- | --- | --- | --- |
| `id` | O | — | uuid | 공고 식별자, 경로 파라메터 |
| `data` | — | O | Object | 접수 결과. 아래 필드와 `jobPostingId`를 담는다 |
| `jobAnalysisId` | — | O | uuid | 진행 조회에 사용한다 |
| `status` | — | O | String | `queued` · `running` · `done` · `failed`. 새로 접수하면 `queued` |
| `reused` | — | O | Boolean | 이 공고의 분석이 이미 있어 그것을 돌려주면 true |

표 7.3.5 공고 분석 접수의 파라메터

```ts
// 실제 전송내용 (IN)
전송방향 : IN
POST /v1/jobs/postings/3e9d1f7a-6b2c-4d8e-a1f3-5b7c9d0e2f41/analyses
```

```ts
// 실제 전송내용 (OUT)
전송방향 : OUT
HTTP 201 Created
{
  "data": {
    "jobPostingId": "3e9d1f7a-6b2c-4d8e-a1f3-5b7c9d0e2f41",
    "jobAnalysisId": "8c4b2a19-7d3e-4f6a-b5c8-9e0d1f2a3b4c",
    "status": "queued",
    "reused": false
  }
}
```

분석에는 수십 초가 걸리므로 결과를 기다리지 않고 접수 응답을 반환한다. 새로 접수하면 201, 이 공고의 분석이 이미 있으면 그 분석을 200으로 돌려준다. 클라이언트는 `jobAnalysisId`로 `GET /v1/job-analyses/:id`를 주기적으로 조회하여 완료를 확인한다.

### 6) 공고 일치도 산출

유형 **일치도 산출** · `POST /v1/jobs/postings/:id/match`

> `[그림 7.3.6 공고 일치도 산출의 요청 · 응답 방향]` — HTML 본문의 SVG를 참조한다.

| 속성 | IN | OUT | Type | Description |
| --- | --- | --- | --- | --- |
| `id` | O | — | uuid | 공고 식별자, 경로 파라메터 |
| `data` | — | O | Object | 산출 결과. 아래 필드와 `jobPostingId`를 담는다 |
| `total` | — | O | int | 0 – 100. `round(100 × covered ÷ required)` |
| `required` | — | O | int | 공고가 명시한 요건 수. 네 축의 합이며 1 이상 |
| `covered` | — | O | int | 기록에서 근거를 찾은 요건 수. 네 축의 합 |
| `axes` | — | O | Object | `technology` · `impact` · `role` · `conditions`. 축마다 `{required, covered, matched, missing}` |
| `reason` | — | O | String | 화면에 그대로 보이는 한 문장 |
| `nextAction` | — | O | String | 다음에 할 일을 적은 한 문장 |
| `computedAt` | — | O | Timestamp | 산출 시각 |

표 7.3.6 공고 일치도 산출의 파라메터

```ts
// 실제 전송내용 (IN)
전송방향 : IN
POST /v1/jobs/postings/3e9d1f7a-6b2c-4d8e-a1f3-5b7c9d0e2f41/match
```

```ts
// 실제 전송내용 (OUT)
전송방향 : OUT
{
  "data": {
    "jobPostingId": "3e9d1f7a-6b2c-4d8e-a1f3-5b7c9d0e2f41",
    "total": 80,
    "covered": 8,
    "required": 10,
    "axes": {
      "technology": {
        "required": 5, "covered": 4,
        "matched": ["React", "TypeScript", "Node.js", "PostgreSQL"],
        "missing": ["Kubernetes"]
      },
      "impact": {
        "required": 2, "covered": 2,
        "matched": ["지연 개선", "트래픽 규모"], "missing": []
      },
      "role": {
        "required": 2, "covered": 1,
        "matched": ["백엔드"], "missing": ["리드 경험"]
      },
      "conditions": {
        "required": 1, "covered": 1,
        "matched": ["서울"], "missing": []
      }
    },
    "reason": "역할·연차에서 리드 경험 근거가 비어 있습니다.",
    "nextAction": "리드 경험을 실제로 사용한 기록을 추가하거나 기존 기록의 원문 근거를 보강하세요.",
    "computedAt": "2026-08-14T03:05:12.000Z"
  }
}
```

`total`은 공고가 명시한 요건 가운데 기록에서 근거를 찾은 요건의 비율이며, 축은 요건을 묶어 보여 주는 분류이고 배점이 아니다. 요건을 하나도 읽지 못한 공고는 점수를 내지 않고 409로 답한다. 삭제되지 않은 기록이 3개보다 적을 때도 409이다. 0점과 판정 불가는 다른 상태이다.

### 7) 생성 진행 스트림

유형 **스트림** · `GET /v1/generation-jobs/:id/page-stream`

> `[그림 7.3.7 생성 진행 스트림의 요청 · 응답 방향]` — HTML 본문의 SVG를 참조한다.

| 속성 | IN | OUT | Type | Description |
| --- | --- | --- | --- | --- |
| `id` | O | — | uuid | 생성 작업 식별자 |
| `Accept` | O | — | Header | `text/event-stream` |
| `event` | — | O | String | `begin` · `thinking` · `delta` · `done` · `failed` |
| `data` | — | O | Object | 이벤트별 본문. `begin`은 `{style}`, `thinking`은 `{tokens}`, `delta`는 `{text}`, `done`은 `{pageId}`, `failed`는 `{code}` |

표 7.3.7 생성 진행 스트림의 파라메터

```ts
// 실제 전송내용 (IN)
전송방향 : IN
GET /v1/generation-jobs/5f3e8d21-9a4b-4c7d-8e6f-0a1b2c3d4e5f/page-stream
Accept: text/event-stream
```

```ts
// 실제 전송내용 (OUT)
전송방향 : OUT
Content-Type: text/event-stream; charset=utf-8

id: 1786676400000-0
event: begin
data: {"style":"null"}

id: 1786676412000-0
event: thinking
data: {"tokens":512}

id: 1786676530000-0
event: delta
data: {"text":"{\"html\":\"<section><h1>사내 검색 개편"}

id: 1786676590000-0
event: done
data: {"pageId":"2d7c6b5a-4e3f-4a1b-9c8d-7e6f5a4b3c2d"}
```

생성은 몇 분이 걸리고 그 사이 화면이 비어 있으면 사용자가 실패로 오해한다. 모델이 쓰는 지면 JSON을 조각(`delta`)이 나오는 대로 밀어 주어 진행을 보여 준다. 연결이 끊겼다 다시 붙으면 서버가 처음부터 다시 보내므로 클라이언트는 받은 내용을 비우고 처음부터 다시 받는다.

### 8) 공개 포트폴리오 열람

유형 **공개 조회** · `GET /v1/public/portfolios/:slug`

> `[그림 7.3.8 공개 포트폴리오 열람의 요청 · 응답 방향]` — HTML 본문의 SVG를 참조한다.

| 속성 | IN | OUT | Type | Description |
| --- | --- | --- | --- | --- |
| `slug` | O | — | String | 공개 주소, 경로 파라메터. 3 – 63자, 영문 소문자 · 숫자 · `-` |
| `data` | — | O | Object | `kind`에 따라 `deployment` 또는 새 주소를 담는다 |
| `kind` | — | O | String | `portfolio` · `redirect`. 바뀐 주소로 들어오면 `redirect`와 `{from, to, expiresAt}` |
| `deployment` | — | O | Object | 배포 시점에 고정된 문서. `snapshot` · 공유 카드용 `seo` · `publishedAt`를 담는다 |

표 7.3.8 공개 포트폴리오 열람의 파라메터

```ts
// 실제 전송내용 (IN)
전송방향 : IN
GET /v1/public/portfolios/minjae-frontend-2026
(인증 헤더 없음)
```

```ts
// 실제 전송내용 (OUT)
전송방향 : OUT
{
  "data": {
    "kind": "portfolio",
    "deployment": {
      "id": "9a8b7c6d-5e4f-4321-8abc-def012345678",
      "portfolioId": "4c3b2a1d-0e9f-4a8b-9c7d-6e5f4a3b2c1d",
      "version": 3,
      "slug": "minjae-frontend-2026",
      "snapshot": {
        "portfolioId": "4c3b2a1d-0e9f-4a8b-9c7d-6e5f4a3b2c1d",
        "title": "박민재 · 프론트엔드",
        "templateId": "6e5d4c3b-2a1f-4e0d-8c9b-a8f7e6d5c4b3",
        "sections": [ { "id": "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", "order": 0, "visible": true, "blocks": [ ... ] } ],
        "generatedPage": { "id": "2d7c6b5a-4e3f-4a1b-9c8d-7e6f5a4b3c2d", "revision": 2, "document": "<!doctype html>…" }
      },
      "seo": { "title": "박민재 · 프론트엔드", "description": "…", "indexable": true },
      "contactVisibility": "on_request",
      "publishedAt": "2026-08-12T09:00:00.000Z"
    }
  }
}
```

인증 없이 열리는 경로이다. 배포 시점의 스냅샷만 노출하므로 이후의 편집이 공개된 문서를 바꾸지 않는다. 사용자 식별자와 원본 기록은 응답에 담기지 않는다.

### 9) 자산 서명 URL 발급

유형 **서명 URL** · `POST /v1/assets/:id/signed-url`

> `[그림 7.3.9 자산 서명 URL 발급의 요청 · 응답 방향]` — HTML 본문의 SVG를 참조한다.

| 속성 | IN | OUT | Type | Description |
| --- | --- | --- | --- | --- |
| `id` | O | — | uuid | 내보내기 자산 식별자, 경로 파라메터 |
| `ttlSeconds` | O | — | int | 1 – 86,400초, 기본값 300 |
| `data.assetId` | — | O | uuid | 자산 식별자 |
| `data.url` | — | O | String | `/v1/public/assets/:id`에 `version` · `expires` · `signature`를 붙인 주소 |
| `data.expiresAt` | — | O | datetime | 이 시각 이후에는 403을 돌려준다 |

표 7.3.9 자산 서명 URL 발급의 파라메터

```ts
// 실제 전송내용 (IN)
전송방향 : IN
POST /v1/assets/4f1c2a9e-7b3d-4e8a-9c21-5d6e7f8a9b0c/signed-url
{
  "ttlSeconds": 600
}
```

```ts
// 실제 전송내용 (OUT)
전송방향 : OUT
{
  "data": {
    "assetId": "4f1c2a9e-7b3d-4e8a-9c21-5d6e7f8a9b0c",
    "url": "/v1/public/assets/4f1c2a9e-7b3d-4e8a-9c21-5d6e7f8a9b0c?version=2&expires=1791201000&signature=Jb3x…",
    "expiresAt": "2026-10-05T11:50:00.000Z"
  }
}
```

파일을 API 서버가 직접 내려보내지 않고, 만료 시각과 서명을 붙인 공개 자산 주소만 발급한다. 요금제가 `export.document`를 허용하지 않으면 403을, 자산이 없거나 회수되었으면 404를 돌려준다. 발급된 주소는 만료 시각이 지나거나 서명이 맞지 않으면 403으로 거절되며, 내려받을 때마다 자산의 내려받기 수를 1 늘린다.

### 10) 로그인

유형 **생성** · `POST /v1/auth/login`

> `[그림 7.3.10 로그인의 요청 · 응답 방향]` — HTML 본문의 SVG를 참조한다.

| 속성 | IN | OUT | Type | Description |
| --- | --- | --- | --- | --- |
| `email` | O | — | String | 필수, 이메일 형식, 최대 320자 |
| `password` | O | — | String | 필수, 1–200자 |
| `data.user.id` | — | O | uuid | 사용자 식별자 |
| `data.user.email` | — | O | String | 사용자 이메일 |
| `data.user.displayName` | — | O | String | 1–200자 |
| `data.user.planCode` | — | O | enum | `free` · `pro` · `team` |
| `data.session.sessionId` | — | O | uuid | 발급된 세션 식별자 |
| `data.session.accessToken` | — | O | String | `exps_` 접두사 뒤 43자 |
| `data.session.expiresAt` | — | O | datetime | 세션 만료 시각(ISO 문자열) |

표 7.3.10 로그인의 파라메터

```ts
// 실제 전송내용 (IN)
전송방향 : IN
{
  "email": "jiwoo.kim@example.com",
  "password": "correct-horse-battery"
}
```

```ts
// 실제 전송내용 (OUT)
전송방향 : OUT
{
  "data": {
    "user": {
      "id": "dda90c64-d124-45ea-b5e8-3355341b2c05",
      "email": "jiwoo.kim@example.com",
      "displayName": "김지우",
      "planCode": "free"
    },
    "session": {
      "sessionId": "dfd6c113-d5ef-4626-9b9d-b9ed4140f89e",
      "accessToken": "exps_Q2xZ8kV4mT7pR1sW9nB3cD6fH0jK5lL2qA8eU4yI7oX",
      "expiresAt": "2026-11-04T02:10:11.000Z"
    }
  }
}
```

인증 없이 호출하는 경로이며, 본문이 스키마를 벗어나면 400을, 이메일이나 비밀번호가 맞지 않거나 삭제를 요청한 계정이면 401을 돌려준다. 성공하면 200과 함께 새 세션을 하나 발급하고, 세션 만료 시각은 발급 시점으로부터 30일 뒤로 정한다.

### 11) 카테고리 생성

유형 **생성** · `POST /v1/career/categories`

> `[그림 7.3.11 카테고리 생성의 요청 · 응답 방향]` — HTML 본문의 SVG를 참조한다.

| 속성 | IN | OUT | Type | Description |
| --- | --- | --- | --- | --- |
| `key` | O | O | String | 필수, 영문 소문자로 시작하는 2–64자(`a-z` · `0-9` · `_`) |
| `name` | O | O | String | 필수, 1–120자 |
| `icon` | O | O | String | 필수, 1–80자 |
| `defaultView` | O | O | enum | `table` · `gallery` · `timeline` · `board` · `list` |
| `propertySchema` | O | O | Object | 속성 키 → `{label, type, required, system}`, 기본값 빈 객체. 응답에는 각 속성의 `id`가 채워진다 |
| `ETag` | — | O | Header | `"v{version}"` 형식 |
| `data.id` | — | O | uuid | 카테고리 식별자 |
| `data.isSystem` | — | O | bool | 사용자 카테고리는 `false` |
| `data.sortOrder` | — | O | int | 7 + 기존 사용자 카테고리 수 |
| `data.recordCount` | — | O | int | 소속 기록 수 |
| `data.version` | — | O | int | 생성 직후 1 |

표 7.3.11 카테고리 생성의 파라메터

```ts
// 실제 전송내용 (IN)
전송방향 : IN
{
  "key": "side_project",
  "name": "사이드 프로젝트",
  "icon": "rocket",
  "defaultView": "gallery",
  "propertySchema": {
    "stack": { "label": "기술 스택", "type": "tags", "required": false, "system": false }
  }
}
```

```ts
// 실제 전송내용 (OUT)
전송방향 : OUT
ETag: "v1"
{
  "data": {
    "id": "2c4ada0e-7b25-42da-b360-86dfa0b7fa54",
    "key": "side_project",
    "name": "사이드 프로젝트",
    "icon": "rocket",
    "defaultView": "gallery",
    "isSystem": false,
    "propertySchema": {
      "stack": {
        "id": "4d52b09f-554f-4908-ae11-95f1cc1ba3c6",
        "label": "기술 스택", "type": "tags", "required": false, "system": false
      }
    },
    "sortOrder": 7,
    "recordCount": 0,
    "version": 1
  }
}
```

성공하면 201을 돌려주고 `ETag` 헤더에 카테고리 버전을 싣는다. 본문이 스키마를 벗어나면 400을, 그 사용자에게 같은 `key`의 카테고리가 이미 있거나 사용자 카테고리가 100개에 이르면 409를 돌려준다. 속성 정의에 `id`가 없으면 서버가 UUID를 발급해 채운다.

### 12) 기록 문서 편집 반영

유형 **조건부 수정** · `POST /v1/career/records/:recordId/document/updates`

> `[그림 7.3.12 기록 문서 편집 반영의 요청 · 응답 방향]` — HTML 본문의 SVG를 참조한다.

| 속성 | IN | OUT | Type | Description |
| --- | --- | --- | --- | --- |
| `recordId` | O | O | uuid | 경로 파라메터, 편집 대상 기록 |
| `clientId` | O | O | uuid | 필수, 편집 클라이언트 식별자 |
| `clientSequence` | O | O | int | 필수, 1 이상. 클라이언트가 매기는 업데이트 순번 |
| `expectedSequence` | O | — | int | 선택, 0 이상. 클라이언트가 알고 있는 문서 버전 |
| `updateBase64` | O | — | String | 필수, Base64 인코딩된 문서 업데이트. 디코딩 후 1MB 이하 |
| `checksum` | O | — | String | 필수, 디코딩한 바이트의 SHA-256 16진수 64자 |
| `serverSequence` | — | O | int | 서버가 부여한 업데이트 순번, 1 이상 |
| `documentVersion` | — | O | int | 반영 후 문서 버전 |

표 7.3.12 기록 문서 편집 반영의 파라메터

```ts
// 실제 전송내용 (IN)
전송방향 : IN
POST /v1/career/records/8aaade04-0aec-4175-927a-d8a5f4564253/document/updates
{
  "clientId": "c303fa51-ddf1-4457-a4d4-a33280028378",
  "clientSequence": 12,
  "expectedSequence": 41,
  "updateBase64": "AQHC5ZK7BAAHAQRib2R5AQA=",
  "checksum": "6a91343114156e74f65cef83a5a2476af562a241e8d96a32c63bf053acb07cde"
}
```

```ts
// 실제 전송내용 (OUT)
전송방향 : OUT
{
  "recordId": "8aaade04-0aec-4175-927a-d8a5f4564253",
  "clientId": "c303fa51-ddf1-4457-a4d4-a33280028378",
  "clientSequence": 12,
  "serverSequence": 42,
  "documentVersion": 42
}
```

디코딩한 업데이트가 1MB를 넘으면 413을, 체크섬이 맞지 않으면 422를, 기록이 없으면 404를, `expectedSequence`가 현재 문서 버전과 다르면 409를 돌려준다. 같은 `clientId` · `clientSequence` 조합이 다시 오면 업데이트를 새로 저장하지 않고 처음 부여한 순번을 그대로 돌려준다. 압축되지 않은 업데이트가 100건 이상이거나 합계 512KB 이상이 되면 문서 압축 작업을 큐에 넣는다.

### 13) 저장된 뷰 조회

유형 **목록 조회** · `GET /v1/career/view-configurations/:viewId/query`

> `[그림 7.3.13 저장된 뷰 조회의 요청 · 응답 방향]` — HTML 본문의 SVG를 참조한다.

| 속성 | IN | OUT | Type | Description |
| --- | --- | --- | --- | --- |
| `viewId` | O | — | uuid | 경로 파라메터, 저장된 뷰 식별자 |
| `cursor` | O | — | String | 쿼리, 선택, 1–4096자. 이전 응답의 `nextCursor` |
| `limit` | O | — | int | 쿼리, 선택, 1–100, 기본값 50 |
| `data` | — | O | Array | 뷰의 필터 · 정렬을 적용한 기록 목록 |
| `data[].id` | — | O | uuid | 기록 식별자 |
| `data[].title` | — | O | String | 최대 300자 |
| `data[].status` | — | O | enum | `draft` · `organized` · `verified` |
| `data[].origin` | — | O | enum | `manual` · `ai` · `interview` · `import` |
| `data[].properties` | — | O | Object | 카테고리 속성 값 |
| `data[].version` | — | O | int | 기록 버전 |
| `page.hasNextPage` | — | O | bool | 다음 페이지 존재 여부 |
| `page.nextCursor` | — | O | String | 다음 페이지 커서, 마지막 페이지면 `null` |

표 7.3.13 저장된 뷰 조회의 파라메터

```ts
// 실제 전송내용 (IN)
전송방향 : IN
GET /v1/career/view-configurations/cd3ca7f4-a403-48c4-a8a8-00fe7b0637d7/query?limit=20
```

```ts
// 실제 전송내용 (OUT)
전송방향 : OUT
{
  "data": [
    {
      "id": "8aaade04-0aec-4175-927a-d8a5f4564253",
      "categoryId": "2c4ada0e-7b25-42da-b360-86dfa0b7fa54",
      "title": "사내 검색 개편",
      "status": "organized",
      "origin": "manual",
      "properties": { "stack": ["TypeScript", "Elasticsearch"] },
      "computedProperties": {},
      "bodyMd": "검색 지연을 320ms에서 90ms로 줄였다.",
      "version": 3,
      "createdAt": "2026-08-14T02:10:11.000Z",
      "updatedAt": "2026-09-02T07:41:30.000Z"
    }
  ],
  "page": {
    "hasNextPage": true,
    "nextCursor": "eyJ1c2VySWQiOiJkZGE5MGM2NCJ9.Hk3vQ9pZ2mN8rT1x"
  }
}
```

뷰나 그 뷰의 카테고리가 없으면 404를, 쿼리 문자열이 스키마를 벗어나면 400을 돌려준다. 커서는 서버가 서명하고 사용자 · 뷰 · 뷰 버전에 묶여 15분 동안 유효하며, 서명이 맞지 않거나 만료되었거나 그사이 뷰 설정이 바뀌었으면 400을 돌려준다. 서버는 `limit`보다 한 건 더 읽어 `hasNextPage`를 정한다.

### 14) 스킬 목록 조회

유형 **목록 조회** · `GET /v1/career/skills`

> `[그림 7.3.14 스킬 목록 조회의 요청 · 응답 방향]` — HTML 본문의 SVG를 참조한다.

| 속성 | IN | OUT | Type | Description |
| --- | --- | --- | --- | --- |
| `data` | — | O | Array | 근거가 1건 이상인 스킬 목록 |
| `data[].id` | — | O | uuid | 스킬 식별자 |
| `data[].name` | — | O | String | 1–120자 |
| `data[].level` | — | O | int | 숙련도 1–5 |
| `data[].evidenceCount` | — | O | int | 근거 수, 1 이상 |
| `data[].strength` | — | O | enum | `weak` · `supported` · `strong` |
| `data[].lastUsedAt` | — | O | datetime | 마지막 사용 시각(ISO 문자열) |
| `data[].computedAt` | — | O | datetime | 스킬을 다시 계산한 시각(ISO 문자열) |

표 7.3.14 스킬 목록 조회의 파라메터

```ts
// 실제 전송내용 (IN)
전송방향 : IN
GET /v1/career/skills
```

```ts
// 실제 전송내용 (OUT)
전송방향 : OUT
{
  "data": [
    {
      "id": "c2678c48-6d61-4830-87b6-3c9ad9349b59",
      "name": "TypeScript",
      "level": 4,
      "evidenceCount": 6,
      "strength": "strong",
      "lastUsedAt": "2026-09-02T07:41:30.000Z",
      "computedAt": "2026-09-02T07:42:05.000Z"
    }
  ]
}
```

요청 파라메터 없이 로그인한 사용자의 스킬만 돌려준다. 근거 수가 0인 스킬은 빼고, `level` 내림차순 · `evidenceCount` 내림차순 · 이름 오름차순으로 정렬해 최대 1,000건까지 담는다. 조회만 하며 스킬을 다시 계산하지 않는다.

### 15) 자연어 검색 조건 변환

유형 **생성** · `POST /v1/jobs/search/interpret`

> `[그림 7.3.15 자연어 검색 조건 변환의 요청 · 응답 방향]` — HTML 본문의 SVG를 참조한다.

| 속성 | IN | OUT | Type | Description |
| --- | --- | --- | --- | --- |
| `query` | O | — | String | 필수, 앞뒤 공백 제거 후 2–1,000자 |
| `resultCount` | O | — | int | 선택, 0 이상, 기본값 0. 최근 검색에 함께 저장한다 |
| `originalQuery` | — | O | String | 해석한 검색어 |
| `conditions` | — | O | Array | 추출한 검색 조건 목록 |
| `conditions[].field` | — | O | enum | `role` · `experience` · `work_type` · `location` · `salary` · `company_size` · `technology` |
| `conditions[].value` | — | O | String · number | 1–200자 문자열 또는 0 이상의 수. `experience` · `salary`는 수 |
| `conditions[].enabled` | — | O | bool | 조건 적용 여부 |
| `conditions[].confidence` | — | O | number | 0–1 |
| `needsClarification` | — | O | bool | 추출한 조건이 없으면 `true` |
| `example` | — | O | String | 선택, 조건이 없을 때만 담는 예시 검색어 |
| `recentSearchId` | — | O | uuid | 저장된 최근 검색 식별자 |

표 7.3.15 자연어 검색 조건 변환의 파라메터

```ts
// 실제 전송내용 (IN)
전송방향 : IN
{
  "query": "서울 3년 이상 TypeScript 백엔드 원격",
  "resultCount": 0
}
```

```ts
// 실제 전송내용 (OUT)
전송방향 : OUT
{
  "originalQuery": "서울 3년 이상 TypeScript 백엔드 원격",
  "conditions": [
    { "field": "role", "value": "백엔드", "enabled": true, "confidence": 0.95 },
    { "field": "experience", "value": 3, "enabled": true, "confidence": 0.95 },
    { "field": "work_type", "value": "remote", "enabled": true, "confidence": 0.95 },
    { "field": "location", "value": "서울", "enabled": true, "confidence": 0.9 },
    { "field": "technology", "value": "typescript", "enabled": true, "confidence": 0.98 }
  ],
  "needsClarification": false,
  "recentSearchId": "dda90c64-d124-45ea-b5e8-3355341b2c05"
}
```

서버는 역할 · 경력 연수 · 근무 형태 · 지역 · 기술 · 연봉을 사전과 정규식으로 추출하며, 연봉 조건은 `enabled: false`로 만든다. 본문이 스키마를 벗어나면 400을 돌려준다. 해석할 때마다 최근 검색에 기록하는데, 직전 최근 검색과 검색어가 같으면 그 항목을 갱신하고 사용자당 최근 20건만 남긴다.

### 16) 공고 상세 조회

유형 **단건 조회** · `GET /v1/jobs/postings/:id`

> `[그림 7.3.16 공고 상세 조회의 요청 · 응답 방향]` — HTML 본문의 SVG를 참조한다.

| 속성 | IN | OUT | Type | Description |
| --- | --- | --- | --- | --- |
| `id` | O | — | uuid | 경로 파라메터. 공고 id |
| `data.title` | — | O | String | 1–300자 |
| `data.company` | — | O | Object | 회사 정보. 상세에서는 `brandColors` · `tonePalette` · `toneImpression`이 더 붙는다 |
| `data.descriptionRaw` | — | O | String | 공고 원문. 요건의 `sourceSpan`이 이 문자열의 글자 위치를 가리킨다 |
| `data.duties` | — | O | Array | `{group, items}` 목록. 주요 업무 |
| `data.criteria` | — | O | Array | 자격 요건. `kind`는 `must` · `nice` · `tone`, `coverage`는 `covered` · `partial` · `missing` 또는 null |
| `data.daysLeft` | — | O | int | 마감까지 남은 날. 상시 모집이면 null, 지났으면 음수 |
| `data.match` | — | O | Object | 일치도. `total`은 0–100. 계산하지 않았으면 null |
| `data.interest` | — | O | Object | 관심 공고 상태. `stage`는 `saved` · `applied` · `closed`. 없으면 null |
| `data.analysis` | — | O | Object | 이 사용자의 공고 해석 작업. `status`는 `queued` · `running` · `done` · `failed`. 없으면 null |
| `data.rank` | — | O | Object | `{position, total}`. 점수가 매겨진 공고 사이의 순위, 없으면 null |
| `data.topRecords` | — | O | Array | `{id, title}` 최대 3건. 요건을 덮는 횟수가 많은 기록 순 |

표 7.3.16 공고 상세 조회의 파라메터

```ts
// 실제 전송내용 (IN)
전송방향 : IN
GET /v1/jobs/postings/7c0e2a51-3f4b-4d8e-9a61-2b5d8f0c1e47
```

```ts
// 실제 전송내용 (OUT)
전송방향 : OUT
{
  "data": {
    "id": "7c0e2a51-3f4b-4d8e-9a61-2b5d8f0c1e47",
    "title": "백엔드 엔지니어 (검색 플랫폼)",
    "company": {
      "id": "1a9d4e70-5b2c-4f3a-8e16-0c7b9d2f4a85",
      "name": "예시테크",
      "toneImpression": "짧고 단정한 문장"
    },
    "source": "api",
    "daysLeft": 12,
    "descriptionRaw": "[주요 업무]\n검색 API 설계와 운영...",
    "duties": [{ "group": "주요 업무", "items": ["검색 API 설계와 운영"] }],
    "criteria": [
      {
        "id": "3e6f1b2a-9c40-4d7e-8b15-6a2c0f9d1e33",
        "orderNo": 0,
        "label": "Elasticsearch 운영 경험",
        "kind": "must",
        "coverage": "covered",
        "coveredBy": [{ "id": "b4d2c8e1-6f30-4a97-9e52-1c8a7f0b3d64", "title": "사내 검색 개편" }],
        "sourceSpan": { "start": 42, "end": 61, "quote": "Elasticsearch 운영 경험" }
      }
    ],
    "match": { "total": 78, "covered": 7, "required": 9, "reason": "검색 지연 개선 기록이 핵심 요건을 덮는다.", "nextAction": "대용량 색인 경험을 보강한다.", "computedAt": "2026-10-01T08:12:40.000Z" },
    "interest": null,
    "analysis": { "id": "5f8a3c19-2d6e-4b07-a1c4-9e0d7b2f6a18", "status": "done", "progressStage": "done", "analyzedAt": "2026-10-01T08:12:38.000Z" },
    "rank": { "position": 2, "total": 14 },
    "topRecords": [{ "id": "b4d2c8e1-6f30-4a97-9e52-1c8a7f0b3d64", "title": "사내 검색 개편" }]
  }
}
```

경로의 `id`가 UUID 형식이 아니면 400을, 해당 공고가 없으면 404를 돌려준다. 공고 본문과 요건은 모든 사용자에게 같고, `match` · `interest` · `analysis` · `rank`와 요건의 `coverage`는 요청한 사용자 기준으로 채워진다. 이 공고를 아직 대조하지 않았으면 요건의 `coverage`는 null로 온다.

### 17) 재료 후보 조회

유형 **목록 조회** · `GET /v1/brews/:id/materials`

> `[그림 7.3.17 재료 후보 조회의 요청 · 응답 방향]` — HTML 본문의 SVG를 참조한다.

| 속성 | IN | OUT | Type | Description |
| --- | --- | --- | --- | --- |
| `id` | O | — | uuid | 경로 파라메터. 제작(brew) id |
| `data.selectionLimit` | — | O | int | 한 번에 고를 수 있는 재료 수. 현재 10 |
| `data.mode` | — | O | enum | `solo` · `collab` |
| `data.lengthPreset` | — | O | enum | `single` · `double` · `triple` |
| `data.materials` | — | O | Array | 재료 후보. 최대 50건, `rank` 오름차순 |
| `data.materials.recordId` | — | O | uuid | 커리어 기록 id |
| `data.materials.status` | — | O | enum | `organized` · `verified` |
| `data.materials.score` | — | O | int | 0 이상의 매칭 점수 |
| `data.materials.rank` | — | O | int | 매칭 순위. 선택을 바꿔도 바뀌지 않는다 |
| `data.materials.selected` | — | O | bool | 현재 선택 여부 |
| `data.materials.selectedBy` | — | O | enum | `auto` · `user` |
| `data.materials.reason` | — | O | String | 순위 근거 문장. 1–300자 |

표 7.3.17 재료 후보 조회의 파라메터

```ts
// 실제 전송내용 (IN)
전송방향 : IN
GET /v1/brews/2d7f4a10-8c3e-4b59-b6a1-0e9c5d3f7b22/materials
```

```ts
// 실제 전송내용 (OUT)
전송방향 : OUT
{
  "data": {
    "brewId": "2d7f4a10-8c3e-4b59-b6a1-0e9c5d3f7b22",
    "jobAnalysisId": "5f8a3c19-2d6e-4b07-a1c4-9e0d7b2f6a18",
    "updatedAt": "2026-10-01T08:20:05.000Z",
    "selectionLimit": 10,
    "mode": "solo",
    "lengthPreset": "single",
    "materials": [
      {
        "recordId": "b4d2c8e1-6f30-4a97-9e52-1c8a7f0b3d64",
        "title": "사내 검색 개편",
        "status": "verified",
        "score": 86,
        "rank": 0,
        "selected": true,
        "selectedBy": "auto",
        "excludedReason": null,
        "categoryName": "경험",
        "categoryIcon": "briefcase",
        "periodFrom": "2025-03-01",
        "periodTo": "2025-09-30",
        "origin": "manual",
        "reason": "공고의 검색 성능 요건과 기술이 겹친다."
      }
    ]
  }
}
```

경로의 `id`가 UUID 형식이 아니면 400을, 요청한 사용자의 제작이 아니거나 없으면 404를 돌려준다. 후보는 제작을 만들 때 최대 50건까지 매겨지고 순위 0–9의 10건이 자동으로 선택된다. 이 API는 읽기 전용이며, 선택을 바꿀 때는 같은 경로의 `PUT`에 `recordIds`(중복 없는 uuid 최대 10개)를 보내고 같은 형태의 응답을 받는다.

### 18) 인터뷰 답변 저장

유형 **생성** · `PUT /v1/interview-sessions/:id/answers/:questionId`

> `[그림 7.3.18 인터뷰 답변 저장의 요청 · 응답 방향]` — HTML 본문의 SVG를 참조한다.

| 속성 | IN | OUT | Type | Description |
| --- | --- | --- | --- | --- |
| `Idempotency-Key` | O | — | Header | 16–128자, 안전한 문자만 허용 |
| `id` | O | — | uuid | 경로 파라메터. 인터뷰 세션 id |
| `questionId` | O | — | uuid | 경로 파라메터. 질문 id |
| `inputType` | O | — | enum | `text` · `voice` |
| `transcript` | O | — | String | 앞뒤 공백을 지운 뒤 1–100,000자 |
| `data.answer` | — | O | Object | `{id, questionId, inputType, transcript, createdRecordId, version, updatedAt}` |
| `data.answer.createdRecordId` | — | O | uuid | 답변으로 만들어진 커리어 기록 id |
| `data.recordChange.type` | — | O | enum | `created` · `strengthened` |
| `data.recordChange.changedFields` | — | O | Array | 바뀐 기록 필드 이름. 1개 이상 |
| `data.recordChange.sourceQuote` | — | O | String | 기록에 반영한 답변 원문 |
| `data.progress` | — | O | Object | `{answered, total}`. `total`은 3–6 |

표 7.3.18 인터뷰 답변 저장의 파라메터

```ts
// 실제 전송내용 (IN)
전송방향 : IN
PUT /v1/interview-sessions/9a3e7c21-4f5b-4d08-b2e6-1c7f0a8d5e39/answers/6b1d9f42-0e7a-4c35-8f21-3d5a9c0e7b14
Idempotency-Key: 4b1f9c2e-7a30-4d55-9c11-8e2f0a6d34bb
{
  "inputType": "text",
  "transcript": "검색 색인을 샤드 단위로 나눠 재색인 시간을 6시간에서 40분으로 줄였다."
}
```

```ts
// 실제 전송내용 (OUT)
전송방향 : OUT
{
  "data": {
    "answer": {
      "id": "e2c4a7f1-3b9d-4e60-a815-7d0f2b6c9e43",
      "questionId": "6b1d9f42-0e7a-4c35-8f21-3d5a9c0e7b14",
      "inputType": "text",
      "transcript": "검색 색인을 샤드 단위로 나눠 재색인 시간을 6시간에서 40분으로 줄였다.",
      "createdRecordId": "c7f0e3b2-5a14-4d86-9b3e-2f8d1a6c0e57",
      "version": 1,
      "updatedAt": "2026-10-01T09:02:17.000Z"
    },
    "recordChange": {
      "type": "created",
      "recordId": "c7f0e3b2-5a14-4d86-9b3e-2f8d1a6c0e57",
      "changedFields": ["title", "body_md"],
      "sourceQuote": "검색 색인을 샤드 단위로 나눠 재색인 시간을 6시간에서 40분으로 줄였다."
    },
    "progress": { "answered": 2, "total": 5 }
  }
}
```

질문에 처음 답하면 경험 카테고리에 `origin`이 `interview`인 초안 기록을 새로 만들고, 같은 질문에 다시 답하면 그 기록의 제목과 본문을 덮어쓰며 `recordChange.type`을 `strengthened`로 돌려준다. 같은 `Idempotency-Key`로 같은 내용을 다시 보내면 첫 결과를 돌려주고, 다른 내용을 보내면 409를 돌려준다. 세션이나 질문이 없으면 404이며, 저장할 때마다 세션의 답변 수와 다음 질문 순서를 다시 계산하고 모든 질문이 답변되거나 건너뛰어지면 세션을 `done`으로 바꾼다.

### 19) 레시피 생성

유형 **비동기 접수** · `POST /v1/brews/:id/recipes`

> `[그림 7.3.19 레시피 생성의 요청 · 응답 방향]` — HTML 본문의 SVG를 참조한다.

| 속성 | IN | OUT | Type | Description |
| --- | --- | --- | --- | --- |
| `Idempotency-Key` | O | — | Header | 16–128자, 안전한 문자만 허용 |
| `id` | O | — | uuid | 경로 파라메터. 제작(brew) id |
| `data.jobId` | — | O | uuid | 접수된 작업 id |
| `data.type` | — | O | enum | `interview` · `recipe`. 이 API는 `recipe` |
| `data.status` | — | O | enum | `queued` · `running` · `succeeded` · `failed` |
| `data.stage` | — | O | String | 진행 단계. 1–100자 |
| `data.attempts` | — | O | int | 실행 시도 횟수 |
| `data.resultId` | — | O | uuid | 완성된 레시피 id. 끝나기 전에는 null |
| `data.failure` | — | O | Object | `{code, retryable}`. 실패가 없으면 null |

표 7.3.19 레시피 생성의 파라메터

```ts
// 실제 전송내용 (IN)
전송방향 : IN
POST /v1/brews/2d7f4a10-8c3e-4b59-b6a1-0e9c5d3f7b22/recipes
Idempotency-Key: 8e5d2a17-6c4f-4b90-a3d1-7f0b9e2c5a48
```

```ts
// 실제 전송내용 (OUT)
전송방향 : OUT
{
  "data": {
    "jobId": "f1a6c3e8-2b7d-4950-8e14-5c9a0d3f7b26",
    "type": "recipe",
    "status": "queued",
    "stage": "queued",
    "attempts": 0,
    "resultId": null,
    "failure": null
  }
}
```

요청 본문은 읽지 않으며, 작업 문서와 `recipe.draft` outbox 이벤트를 한 트랜잭션에 기록한 뒤 202로 작업 상태만 돌려준다. 같은 `Idempotency-Key`로 다시 보내면 새 작업을 만들지 않고 기존 작업을 돌려주며, 그 키가 다른 제작이나 다른 작업 유형에 쓰였으면 409를, 제작이 없으면 404를 돌려준다. 레시피는 워커가 작업을 끝낸 뒤 만들어지고, 클라이언트는 `GET /v1/brew-jobs/:id`로 상태를 확인해 `resultId`를 받는다.

### 20) 포트폴리오 생성 실행

유형 **비동기 접수** · `POST /v1/generation-jobs`

> `[그림 7.3.20 포트폴리오 생성 실행의 요청 · 응답 방향]` — HTML 본문의 SVG를 참조한다.

| 속성 | IN | OUT | Type | Description |
| --- | --- | --- | --- | --- |
| `Idempotency-Key` | O | — | Header | 16–128자, 안전한 문자만 허용 |
| `recipeId` | O | — | uuid | 필수. 생성에 쓸 레시피 |
| `templateId` | O | — | uuid | 필수. 활성 템플릿이어야 한다 |
| `styleOverrides` | O | — | Object | 선택. `background` · `text` · `accent`(`#RRGGBB`), `font`(`sans` · `serif` · `mono`), `density`(`compact` · `comfortable` · `spacious`), `structure`(`single-column` · `dense-grid` · `wide-margin`) 중 덮어쓸 축만 담는다 |
| `data.generationJobId` | — | O | uuid | 생성 작업 id |
| `data.status` | — | O | enum | `queued` · `running` · `done` · `failed` |
| `data.stage` | — | O | enum | `queued` · `validating` · `materializing` · `charging` · `done` · `failed` |
| `data.attempts` | — | O | int | 실행 시도 횟수 |
| `data.usageCharged` | — | O | bool | 사용량 차감 여부 |
| `data.portfolioId` | — | O | uuid | 만들어진 포트폴리오 id. 만들어지기 전에는 null |
| `data.failure` | — | O | Object | `{code, retryable}`. 실패가 없으면 null |

표 7.3.20 포트폴리오 생성 실행의 파라메터

```ts
// 실제 전송내용 (IN)
전송방향 : IN
Idempotency-Key: 0c9b4e72-1d5a-4f38-b6e0-9a2f7c3d1e85
{
  "recipeId": "a3e8d1c6-7b20-4f59-9d43-1e6c0b8f2a17",
  "templateId": "4f2b9e60-3c18-4a7d-b5e1-8d0a6c3f9b52",
  "styleOverrides": { "accent": "#3B5BDB", "structure": "wide-margin" }
}
```

```ts
// 실제 전송내용 (OUT)
전송방향 : OUT
{
  "data": {
    "generationJobId": "d8b3f0a5-6e21-4c97-8a4d-2f7e1c9b0a36",
    "status": "queued",
    "stage": "queued",
    "attempts": 0,
    "usageCharged": false,
    "portfolioId": null,
    "failure": null
  }
}
```

본문 검증에 실패하거나 `Idempotency-Key`가 없으면 400을, 레시피가 없거나 템플릿이 활성 상태가 아니면 404를 돌려준다. 같은 키와 같은 본문으로 다시 보내면 기존 작업을 돌려주고, 같은 키에 다른 본문을 보내면 409를 돌려준다. 작업 문서와 `portfolio.generate` outbox 이벤트를 한 트랜잭션에 기록한 뒤 202로 응답하며, 진행 상태는 `GET /v1/generation-jobs/:id`로, 만들어지는 지면은 `GET /v1/generation-jobs/:id/page-stream`으로 받는다.

### 21) 블록 수정 미리보기

유형 **생성** · `POST /v1/portfolios/:id/blocks/:blockId/edit-preview`

> `[그림 7.3.21 블록 수정 미리보기의 요청 · 응답 방향]` — HTML 본문의 SVG를 참조한다.

| 속성 | IN | OUT | Type | Description |
| --- | --- | --- | --- | --- |
| `id` | O | — | uuid | 경로 파라메터. 포트폴리오 id |
| `blockId` | O | — | uuid | 경로 파라메터. 블록 id |
| `operation` | O | — | enum | `update_text` · `set_style` · `insert_record` · `instruct` |
| `path` | O | — | String | `update_text`에서 선택. 1–60자, 생략하면 `content.text` |
| `text` | O | — | String | `update_text`에서 필수. 1–100,000자 |
| `style` | O | — | Object | `set_style`에서 필수. `size` · `weight` · `italic` · `strike` · `color` · `highlight` · `alignment` · `spacing` 중 하나 이상 |
| `recordId` | O | — | uuid | `insert_record`에서 필수. 블록에 다시 이을 기록 |
| `instruction` | O | — | String | `instruct`에서 필수. 앞뒤 공백을 지운 뒤 1–500자 |
| `data.id` | — | O | uuid | 수정 제안 id |
| `data.before / data.after` | — | O | Object | 블록의 `content` · `style` · `sourceRecordId` · `syncState` · `locked` 수정 전후 값 |
| `data.patches` | — | O | Array | `{path, before, after, label}`. 바뀐 자리 목록 |
| `data.status` | — | O | enum | `pending` · `applied` · `rejected` · `expired`. 생성 직후 `pending` |

표 7.3.21 블록 수정 미리보기의 파라메터

```ts
// 실제 전송내용 (IN)
전송방향 : IN
POST /v1/portfolios/6e0a3d58-9f21-4b7c-a4e3-0d8b5c2f1a69/blocks/1b7e4c90-5d32-4a8f-9e06-3c1a8f2d7b45/edit-preview
{
  "operation": "update_text",
  "path": "content.text",
  "text": "재색인 시간을 6시간에서 40분으로 줄였다."
}
```

```ts
// 실제 전송내용 (OUT)
전송방향 : OUT
{
  "data": {
    "id": "c5a2e9f3-0b48-4d17-86c2-7e1f4a0d3b98",
    "portfolioId": "6e0a3d58-9f21-4b7c-a4e3-0d8b5c2f1a69",
    "blockId": "1b7e4c90-5d32-4a8f-9e06-3c1a8f2d7b45",
    "targetPath": "portfolio:6e0a3d58-9f21-4b7c-a4e3-0d8b5c2f1a69/section:9d4f1b07-2e6a-4c38-b5d0-8a3e7c1f2b64/block:1b7e4c90-5d32-4a8f-9e06-3c1a8f2d7b45",
    "operation": "update_text",
    "before": { "content": { "text": "재색인 시간을 크게 줄였다." }, "style": {}, "sourceRecordId": null, "syncState": "synced", "locked": false },
    "after": { "content": { "text": "재색인 시간을 6시간에서 40분으로 줄였다." }, "style": {}, "sourceRecordId": null, "syncState": "detached", "locked": true },
    "sourceRecordId": null,
    "instruction": null,
    "patches": [
      { "path": "content.text", "before": "재색인 시간을 크게 줄였다.", "after": "재색인 시간을 6시간에서 40분으로 줄였다.", "label": "직접 고쳤습니다" }
    ],
    "status": "pending"
  }
}
```

이 API는 블록을 바꾸지 않고 24시간 뒤 만료되는 `pending` 상태의 수정 제안만 저장하며 201을 돌려준다. 블록 종류가 허용하지 않는 `path`(문단 · 제목 · 목록은 `content.text`, 수치는 `content.value` · `content.label`만 허용)는 422로, 잠긴 블록에 대한 `instruct`와 미리보기 중 블록이 바뀐 경우는 409로, 편집 모델이 설정되지 않은 상태의 `instruct`는 503으로 거절한다. 제안은 `POST /v1/portfolio-edit-proposals/:id/apply`를 호출해야 블록에 반영된다.

### 22) 포트폴리오 배포

유형 **생성** · `POST /v1/portfolios/:id/deployments`

> `[그림 7.3.22 포트폴리오 배포의 요청 · 응답 방향]` — HTML 본문의 SVG를 참조한다.

| 속성 | IN | OUT | Type | Description |
| --- | --- | --- | --- | --- |
| `id` | O | — | uuid | 경로 변수. 배포할 포트폴리오 |
| `slug` | O | — | String | 필수. 3~63자, 소문자·숫자·하이픈, 하이픈으로 시작하거나 끝나지 않는다 |
| `seo.title` | O | — | String | 선택. 1~70자 |
| `seo.description` | O | — | String | 선택. 1~160자 |
| `seo.indexable` | O | — | bool | 기본값 `false` |
| `contactVisibility` | O | O | String | `public` · `on_request` · `hidden`, 기본값 `hidden` |
| `data.id` | — | O | uuid | 새 배포의 식별자 |
| `data.portfolioId` | — | O | uuid | 배포한 포트폴리오 |
| `data.version` | — | O | int | 직전 배포 버전에 1을 더한 값, 첫 배포는 1 |
| `data.slug` | — | O | String | 배포된 주소 |
| `data.snapshot` | — | O | Object | 배포 시점의 섹션 · 블록 · 생성 페이지 사본 |
| `data.publishedAt` | — | O | datetime | 배포 시각 |

표 7.3.22 포트폴리오 배포의 파라메터

```ts
// 실제 전송내용 (IN)
전송방향 : IN
{
  "slug": "minjae-backend",
  "seo": {
    "title": "박민재 · 백엔드 엔지니어",
    "description": "검색 지연을 320ms에서 90ms로 줄인 기록",
    "indexable": true
  },
  "contactVisibility": "on_request"
}
```

```ts
// 실제 전송내용 (OUT)
전송방향 : OUT
{
  "data": {
    "id": "d3a0f6c8-2b41-4e9a-9c57-60e1b2a4f8d9",
    "portfolioId": "7c1e4a52-93d0-4f6b-8a2e-1b5d9f0c3e71",
    "version": 3,
    "slug": "minjae-backend",
    "snapshot": {
      "portfolioId": "7c1e4a52-93d0-4f6b-8a2e-1b5d9f0c3e71",
      "title": "백엔드 포트폴리오",
      "templateId": "0b6f2d3e-5a19-4c84-b7e2-9d1a4c6e8f30",
      "sections": [ { "id": "5e8c1a07-4d2b-4f93-a6e1-2c7b9d0f4a18", "order": 0, "visible": true, "blocks": [] } ],
      "generatedPage": { "id": "a41c7e90-6b3d-4f25-8e0a-3d9b1c5f7e62", "revision": 2, "document": "<!doctype html>..." }
    },
    "seo": { "title": "박민재 · 백엔드 엔지니어", "description": "검색 지연을 320ms에서 90ms로 줄인 기록", "indexable": true },
    "contactVisibility": "on_request",
    "publishedAt": "2026-08-14T03:20:45.000Z"
  }
}
```

성공하면 201을 돌려주고 포트폴리오 상태를 `published`로 바꾼다. 배포 한 건마다 `slug`가 고유해야 하므로(`deployments.subdomain` 고유 인덱스) 이전 배포에 쓴 `slug`로 다시 요청하면 같은 포트폴리오라도 409로 거절하고, 품질 검사를 통과한(`qualityStatus: ready`) 생성 페이지가 없을 때도 409를 낸다. 직전 배포와 `slug`가 다르면 옛 주소에서 새 주소로 가는 30일짜리 리다이렉트를 함께 기록한다.

### 23) 방문 이벤트 수집

유형 **생성** · `POST /v1/analytics/events`

> `[그림 7.3.23 방문 이벤트 수집의 요청 · 응답 방향]` — HTML 본문의 SVG를 참조한다.

| 속성 | IN | OUT | Type | Description |
| --- | --- | --- | --- | --- |
| `eventId` | O | O | uuid | 필수. 같은 값의 재전송은 중복으로 처리한다 |
| `slug` | O | — | String | 필수. 배포된 포트폴리오 주소 |
| `sessionId` | O | — | String | 필수. 16~128자, 영문·숫자와 `._~-` |
| `type` | O | — | String | `visit` · `complete` · `section_view` · `contact_click` · `file_download` · `link_click` |
| `occurredAt` | O | — | datetime | 필수. 시간대 오프셋 포함 |
| `referrer` | O | — | String | 선택. URL, 최대 2,000자 |
| `sectionId` | O | — | uuid | `section_view`일 때 필수 |
| `dwellMs` · `scrollDepth` | O | — | int · number | `section_view`일 때 필수. `dwellMs` 0~86,400,000, `scrollDepth` 0~1 |
| `durationMs` | O | — | int | 선택. 0~86,400,000 |
| `target` | O | — | String | 1~500자. 전환 이벤트(`contact_click` · `file_download` · `link_click`)일 때 필수 |
| `data.accepted` | — | O | bool | 접수 여부 |
| `data.duplicate` | — | O | bool | 이미 접수된 `eventId`였는지 |

표 7.3.23 방문 이벤트 수집의 파라메터

```ts
// 실제 전송내용 (IN)
전송방향 : IN
{
  "eventId": "2f9d4c61-8a07-4b3e-9e15-7c0a6b2d8f43",
  "slug": "minjae-backend",
  "sessionId": "v1.3k9QmZp2Lx7Rt8Wd",
  "type": "section_view",
  "occurredAt": "2026-08-14T05:12:08.000Z",
  "sectionId": "5e8c1a07-4d2b-4f93-a6e1-2c7b9d0f4a18",
  "dwellMs": 14200,
  "scrollDepth": 0.8
}
```

```ts
// 실제 전송내용 (OUT)
전송방향 : OUT
{
  "data": {
    "accepted": true,
    "duplicate": false,
    "eventId": "2f9d4c61-8a07-4b3e-9e15-7c0a6b2d8f43"
  }
}
```

로그인 없이 호출할 수 있고 202를 돌려준다. `Authorization: Bearer` 헤더가 있으면 토큰을 검증해, 포트폴리오 주인의 방문은 집계에서 빠지도록 표시한다. 같은 `eventId`를 같은 내용으로 다시 보내면 `duplicate: true`로 응답하고 내용이 다르면 409를 낸다. 본문이 8KB를 넘으면 413, 같은 방문자·배포에서 1분에 120건을 넘으면 429, 공개 중인 배포가 없는 `slug`이면 404, `visit` 이벤트보다 다른 이벤트가 먼저 오면 409로 거절한다.

### 24) 분석 대시보드 조회

유형 **단건 조회** · `GET /v1/portfolios/:id/analytics/dashboard`

> `[그림 7.3.24 분석 대시보드 조회의 요청 · 응답 방향]` — HTML 본문의 SVG를 참조한다.

| 속성 | IN | OUT | Type | Description |
| --- | --- | --- | --- | --- |
| `id` | O | — | uuid | 경로 변수. 조회할 포트폴리오 |
| `period` | O | — | String | 쿼리. `7d` · `30d` · `all`, 기본값 `30d` |
| `data.deployment` | — | O | Object | `{id, subdomain, customDomain, publishedAt}`. 현재 배포 |
| `data.period` | — | O | Object | `{preset, start, end}`. 날짜는 `YYYY-MM-DD` |
| `data.coverage` | — | O | Object | `{days, aggregatedDays, pendingDates}`. 방문이 있는 날 중 집계가 끝난 날과 남은 날 |
| `data.metrics` | — | O | Object | `visits` · `completes` · `contactClicks` · `fileDownloads` · `linkClicks` · `sectionViews` · `sectionDwellMs` |
| `data.previous` | — | O | Object | 같은 길이의 직전 기간 지표. `all`이거나 집계가 없으면 `null` |
| `data.trend` | — | O | Array | `{date, visits, completes}`, 최대 400개 |
| `data.sections` · `data.referrers` | — | O | Array | 섹션별 조회 수·체류 시간(최대 50개), 유입 출처 origin별 방문 수(최대 8개) |
| `data.organizations` | — | O | Object | `entitled`가 `false`면 목록 없이 자격이 없다는 값만 온다 |
| `data.insight` | — | O | Object | `state`: `insufficient_sample` · `none` · `ready` |
| `data.widgets` | — | O | Array | `{id, metricKey, visualization, span, compareTo, order}`, 최대 40개. `data.customized`가 `false`면 기본 배치이고 `id`는 `null` |

표 7.3.24 분석 대시보드 조회의 파라메터

```ts
// 실제 전송내용 (IN)
전송방향 : IN
GET /v1/portfolios/7c1e4a52-93d0-4f6b-8a2e-1b5d9f0c3e71/analytics/dashboard?period=7d
```

```ts
// 실제 전송내용 (OUT)
전송방향 : OUT
{
  "data": {
    "portfolio": { "id": "7c1e4a52-93d0-4f6b-8a2e-1b5d9f0c3e71", "title": "백엔드 포트폴리오" },
    "deployment": { "id": "d3a0f6c8-2b41-4e9a-9c57-60e1b2a4f8d9", "subdomain": "minjae-backend", "customDomain": null, "publishedAt": "2026-08-14T03:20:45.000Z" },
    "period": { "preset": "7d", "start": "2026-08-14", "end": "2026-08-20" },
    "coverage": { "days": 6, "aggregatedDays": 5, "pendingDates": ["2026-08-20"] },
    "metrics": { "visits": 24, "completes": 9, "contactClicks": 2, "fileDownloads": 1, "linkClicks": 5, "sectionViews": 61, "sectionDwellMs": 734000 },
    "previous": null,
    "trend": [ { "date": "2026-08-15", "visits": 6, "completes": 2 } ],
    "sections": [ { "sectionId": "5e8c1a07-4d2b-4f93-a6e1-2c7b9d0f4a18", "title": "", "views": 18, "dwellMs": 251000 } ],
    "referrers": [ { "origin": "https://www.linkedin.com", "visits": 11 }, { "origin": null, "visits": 7 } ],
    "organizations": { "entitled": false },
    "insight": { "state": "insufficient_sample", "sampleSize": 24, "minimumSample": 30 },
    "views": [],
    "customized": false,
    "widgets": [ { "id": null, "metricKey": "visits", "visualization": "number", "span": 3, "compareTo": "prev_period", "order": 0 } ]
  }
}
```

이 API는 저장된 집계(`metricsDaily`)를 읽기만 하고 아무것도 쓰지 않으며, 집계되지 않은 날의 방문은 `metrics`와 `trend`에 들어가지 않고 `coverage.pendingDates`에만 나타난다. 다른 사용자의 포트폴리오이거나 없으면 404, 한 번도 배포하지 않은 포트폴리오이면 409를 돌려준다. 정의되지 않은 쿼리 파라미터가 섞이면 400으로 거절한다.

### 25) 홈 화면 조회

유형 **단건 조회** · `GET /v1/home`

> `[그림 7.3.25 홈 화면 조회의 요청 · 응답 방향]` — HTML 본문의 SVG를 참조한다.

| 속성 | IN | OUT | Type | Description |
| --- | --- | --- | --- | --- |
| `data.activeBrews` | — | O | Array | `{id, status, updatedAt}`. 완료되지 않은 작업, 최근 갱신 순 최대 5개 |
| `data.portfolios` | — | O | Array | `{id, title, status}`. 제목 순 최대 10개 |
| `data.recommendedJobs` | — | O | Array | 적합도 점수가 높은 공고 최대 5개 |
| `data.recommendedJobs.score` | — | O | number | 적합도 점수 |
| `data.recommendedJobs.companyLogoUrl` | — | O | String | 최대 300자. 저장된 로고가 없으면 `null` |
| `data.keyMetrics` | — | O | Array | `{key, value}`. 지표 키별 합계, 키 이름 순 |
| `data.empty` | — | O | Object | `{brews, portfolios, recommendations, metrics}`. 각 목록이 비었는지 |

표 7.3.25 홈 화면 조회의 파라메터

```ts
// 실제 전송내용 (IN)
전송방향 : IN
GET /v1/home
```

```ts
// 실제 전송내용 (OUT)
전송방향 : OUT
{
  "data": {
    "activeBrews": [ { "id": "9b2e7d14-3c58-4a61-8f0d-5e1a7c3b9d26", "status": "generating", "updatedAt": "2026-08-14T02:41:09.000Z" } ],
    "portfolios": [ { "id": "7c1e4a52-93d0-4f6b-8a2e-1b5d9f0c3e71", "title": "백엔드 포트폴리오", "status": "published" } ],
    "recommendedJobs": [
      {
        "id": "c6f1a830-2d9e-4b75-a4c3-8e0b6d2f1a97",
        "title": "백엔드 엔지니어 (검색)",
        "company": "예시컴퍼니",
        "score": 0.82,
        "companyLogoUrl": "/v1/companies/4a7d2e91-6c03-4f58-b1e9-0d3c5a8f7b24/logo?v=3f9a1c7e5b2d8e60"
      }
    ],
    "keyMetrics": [ { "key": "completes", "value": 9 }, { "key": "visits", "value": 24 } ],
    "empty": { "brews": false, "portfolios": false, "recommendations": false, "metrics": false }
  }
}
```

로그인한 사용자 본인의 데이터만 읽고 요청 파라미터는 없다. 아무것도 쓰지 않는 조회이며, `keyMetrics`는 기간을 나누지 않고 지표 키별로 모든 일별 집계를 더한 값이다. 목록이 비어 있으면 빈 배열과 함께 `empty`의 해당 값이 `true`로 온다.

### 26) 기능 사용 권한 조회

유형 **단건 조회** · `GET /v1/entitlements/:capability`

> `[그림 7.3.26 기능 사용 권한 조회의 요청 · 응답 방향]` — HTML 본문의 SVG를 참조한다.

| 속성 | IN | OUT | Type | Description |
| --- | --- | --- | --- | --- |
| `capability` | O | O | String | 경로 변수. `portfolio.generate` · `recipe.auto` · `brew.cowork` · `template.pro` · `analytics.full` · `analytics.organization_domains` · `analytics.returning_visitors` · `export.document` · `publishing.custom_domain` · `publishing.remove_badge` · `analysis.advanced` · `collaboration.team` |
| `data.planCode` | — | O | String | `free` · `pro` · `team` |
| `data.allowed` | — | O | bool | 지금 이 기능을 쓸 수 있는지 |
| `data.reason` | — | O | String | `ENTITLED` · `PLAN_REQUIRED` · `QUOTA_EXHAUSTED` |
| `data.usage` | — | O | Object | 선택. `portfolio.generate`를 요금제가 허용할 때만 온다 |
| `data.usage.periodStart` | — | O | String | 한국 시간 기준 이번 달 1일, `YYYY-MM-DD` |
| `data.usage.resetsAt` | — | O | datetime | 다음 달 1일 0시(한국 시간) |
| `data.usage.used` | — | O | int | 이번 달 사용 횟수 |
| `data.usage.limit` · `data.usage.remaining` | — | O | int | 월 한도와 남은 횟수. 무제한이면 둘 다 `null` |

표 7.3.26 기능 사용 권한 조회의 파라메터

```ts
// 실제 전송내용 (IN)
전송방향 : IN
GET /v1/entitlements/portfolio.generate
```

```ts
// 실제 전송내용 (OUT)
전송방향 : OUT
{
  "data": {
    "capability": "portfolio.generate",
    "planCode": "free",
    "allowed": true,
    "reason": "ENTITLED",
    "usage": {
      "periodStart": "2026-08-01",
      "resetsAt": "2026-08-31T15:00:00.000Z",
      "used": 2,
      "limit": 3,
      "remaining": 1
    }
  }
}
```

목록에 없는 `capability`이면 400을 돌려준다. 요금제가 기능을 허용하지 않으면 `allowed: false`, `reason: PLAN_REQUIRED`로 응답하고, `portfolio.generate`는 이번 달 사용 횟수가 한도에 닿으면 `QUOTA_EXHAUSTED`가 된다. 조회만 하며 사용량을 늘리지 않는다.

## 7.4. AI학습서버 REST API 설계

AI학습서버는 별도로 실행되는 서버다. 서비스 API와 포트·프로세스를 분리한다.

| 항목 | 값 |
| --- | --- |
| 기본 경로 | `/training` · `/inference` |
| 포트 | 4100 |
| 인증 | 내부 네트워크 + 서비스 토큰 |
| 외부 공개 | 하지 않음 |
| 학습 단위 | `bi`(Bi-Encoder+MLP) · `cross`(Cross-Encoder) — 모델 B는 활성 `cross` 버전을 사용 |

### API 정의

| Method | URI | Description |
| --- | --- | --- |
| GET | `/training/datasets` | 데이터세트 목록 조회 |
| POST | `/training/datasets` | 데이터세트 생성 — 프로필–공고 묶음 구성 · 교사 라벨링 · 루브릭 점수 계산 |
| GET | `/training/datasets/:version` | 데이터세트 상세(행 수 · 라벨 분포 · 교사 모델 · 루브릭 버전 · 라벨 검사 결과) |
| DELETE | `/training/datasets/:version` | 데이터세트 삭제 |
| GET | `/training/datasets/:version/review-samples` | 사람 평가 표본 조회 (교사 라벨 가림) |
| PUT | `/training/datasets/:version/review-samples` | 사람 평가 결과 제출 · 교사–사람 일치도 산출 |
| GET | `/training/runs` | 학습 실행 목록 조회 |
| POST | `/training/runs` | 학습 실행 (인코더 비교 · Bi-Encoder+MLP · Cross-Encoder) |
| GET | `/training/runs/:id` | 학습 진행 · 결과 조회 |
| DELETE | `/training/runs/:id` | 학습 중단 |
| GET | `/training/runs/:id/metrics` | 성능 지표 조회 (NDCG@10 · Recall@K · MAE · 순서 일치율 · ROC 좌표 · baseline 비교) |
| GET | `/training/models` | 모델 버전 목록 조회 (`?kind=bi\|cross`) |
| GET | `/training/models/:version` | 모델 상세 조회 |
| POST | `/training/models/:version/deployments` | 모델 배포 |
| DELETE | `/training/models/:version` | 모델 삭제 |
| GET | `/training/active-models` | 활성 모델 조회 (Bi-Encoder+MLP · Cross-Encoder 각각) |
| PUT | `/training/active-models/:kind` | 활성 모델 변경(롤백 포함) |
| GET | `/training/parameters` | 학습 파라미터 조회 |
| PUT | `/training/parameters` | 학습 파라미터 수정 |
| GET | `/training/teacher-prompts` | 교사 프롬프트 · 루브릭 버전 조회 |
| PUT | `/training/teacher-prompts/:kind` | 교사 프롬프트 수정 |
| GET | `/training/failures` | 학습 장애기록 조회 |
| POST | `/inference/match` | **모델 A** — 공고 선별 · 재정렬 |
| POST | `/inference/record-rank` | **모델 B** — 공고에 맞는 기록 채점 · 선택 조합 |
| GET | `/health/live` | 생존 확인 |
| GET | `/health/ready` | 준비 확인(인코더 · 모델 로드 여부) |

### POST /inference/match — 모델 A

**Parameter**

| 속성 | IN | OUT | Type | Description |
| --- | --- | --- | --- | --- |
| `profile` | O | | Object | 경력 연차 · 기록 목록(제목 · 기본 프로퍼티 · 본문) |
| `postingIds` | O | | Array | 후보 공고 식별자. 공고 벡터는 수집 시 계산되어 저장돼 있다 |
| `rerankTop` | | | int | Cross-Encoder로 재평가할 상위 후보 수. 기본값은 9.2의 Recall@K로 정한다 |
| `modelVersions` | | O | Object | 사용한 `bi` · `cross` 버전 |
| `usable` | | O | bool | 모델 판정 가능 여부 |
| `results[].score` | | O | int | 적합도 0–100 |
| `results[].stage` | | O | String | `screening` 또는 `reranked` |
| `results[].evidenceRecords` | | O | Array | Cross-Encoder 입력으로 고른 근거 기록 ID |

**실제 전송내용 (JSON)**

```json
전송방향 : IN
{
  "profile": { "experienceYears": 4, "records": [{ "recordId": "rec_2f1a", "title": "결제 정산 스케줄러 재설계" }] },
  "postingIds": ["8c4d2e1a-77b3-4f60-a1de-93c5b0f28a47"]
}

전송방향 : OUT
{
  "modelVersions": { "bi": "bi-v1-003", "cross": "cross-v1-002" },
  "usable": true,
  "results": [
    {
      "id": "8c4d2e1a-77b3-4f60-a1de-93c5b0f28a47",
      "score": 78,
      "stage": "reranked",
      "evidenceRecords": ["rec_2f1a", "rec_8c03"]
    }
  ]
}
```

`usable`이 false면 호출자가 `match-score.ts` 규칙으로 되돌아갑니다.

### POST /inference/record-rank — 모델 B

**Parameter**

| 속성 | IN | OUT | Type | Description |
| --- | --- | --- | --- | --- |
| `posting` | O | | Object | 공고 텍스트 · 요구사항 목록 |
| `records` | O | | Array | 채점 대상 기록 목록 (제목 · 본문 · 카테고리 · 속성) |
| `modelVersion` | | O | String | 채점에 쓴 `cross` 버전 |
| `results[].score` | | O | int | (공고, 기록 1건) 적합도 0–100 |
| `results[].selected` | | O | bool | 추천 선택 조합에 포함 여부 |
| `results[].reason` | | O | String | 제외 사유 — 낮은 점수 · 선택된 기록과 중복 · 새로 충족하는 요건 없음 |

**실제 전송내용 (JSON)**

```json
전송방향 : IN
{
  "posting": {
    "text": "React 기반 웹 프론트엔드 개발자를 찾습니다. ...",
    "requirements": [{ "label": "React 기반 프론트엔드 개발 경험", "kind": "must" }]
  },
  "records": [
    { "recordId": "r1", "title": "사내 관리자 콘솔 재구축", "body": "React와 TypeScript로 관리자 콘솔을 다시 만들었다. ...", "category": "프로젝트" }
  ]
}

전송방향 : OUT
{
  "modelVersion": "cross-v1-002",
  "results": [
    { "recordId": "r1", "score": 96, "selected": true, "reason": null }
  ]
}
```

`reason`이 있어야 화면 01b에서 "왜 이 기록을 뺐는가"(T4.1.3 제외 사유 제시)를
사용자에게 보일 수 있습니다.

### POST /training/runs

**Parameter**

| 속성 | IN | OUT | Type | Description |
| --- | --- | --- | --- | --- |
| `kind` | O | | String | `bi` 또는 `cross` |
| `datasetVersion` | O | | String | 학습에 쓸 데이터세트 (`fit-v1`) |
| `encoder` | | | String | `bi`의 인코더. 생략하면 네 후보를 비교한다 |
| `parameterOverrides` | | | Object | 4.3 값 덮어쓰기 |
| `runId` | | O | uuid | 학습 실행 식별자 |
| `status` | | O | String | queued |

교사 점수와 루브릭 계산이 어긋난 라벨이 남은 데이터세트로 학습을 요청하면 **400을 반환하고
학습하지 않습니다.**

### GET /training/runs/:id/metrics

**Parameter**

| 속성 | IN | OUT | Type | Description |
| --- | --- | --- | --- | --- |
| `id` | O | | uuid | 학습 실행 식별자 |
| `kind` | | O | String | `bi` / `cross` |
| `ndcgAt10` | | O | float | 추천 순위 품질 (주요 지표) |
| `recallAtK` | | O | Object | 스크리닝 후보 선별 성능 (`bi`) |
| `mae` | | O | float | 교사 라벨 점수와의 평균 절대 차이 |
| `pairOrderAccuracy` | | O | float | 공고쌍 순서 일치율 (정답 차 5점 이상인 쌍) |
| `rocPoints` | | O | Array | ROC 좌표 (적합도 라벨 60점 이상을 양성) |
| `auc` | | O | float | 위 ROC의 AUC |
| `latencyMs` | | O | Object | p95 지연 · 처리량 |
| `baseline` | | O | Object | 규칙 기반 동일 지표 |
| `approved` | | O | bool | 배포 승인 여부 |
