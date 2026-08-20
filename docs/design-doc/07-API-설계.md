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
| 인증 | 세션 쿠키 (`identity_session`) |
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

현재 형상의 엔드포인트 **125개**다. URI는 명사형을 원칙으로 한다. 동사가 필요한 동작은
하위 리소스(`/analyses`, `/runs`, `/deployments`)로 표현한다.


**GET** (49개)

| Method | URI | 모듈 | Description |
| --- | --- | --- | --- |
| GET | `/v1/account/export` | account-lifecycle | |
| GET | `/v1/analytics/metrics` | analytics | |
| GET | `/v1/deployments/:id/analytics/derived` | analytics | |
| GET | `/v1/deployments/:id/analytics/insight` | analytics | |
| GET | `/v1/portfolios/:id/analytics/dashboard` | analytics | |
| GET | `/v1/brew-jobs/:id` | brew-jobs | |
| GET | `/v1/career/categories` | career | |
| GET | `/v1/career/categories/:categoryId/views` | career | |
| GET | `/v1/career/profile` | career | |
| GET | `/v1/career/records` | career | |
| GET | `/v1/career/records/:recordId` | career | |
| GET | `/v1/career/records/:recordId/delete-impact` | career | |
| GET | `/v1/career/records/:recordId/links` | career | |
| GET | `/v1/career/skills` | career | |
| GET | `/v1/career/skills/:skillId/evidence` | career | |
| GET | `/v1/consents` | consent | |
| GET | `/v1/home` | engagement | |
| GET | `/v1/notification-preferences` | engagement | |
| GET | `/v1/notifications` | engagement | |
| GET | `/v1/search` | engagement | |
| GET | `/v1/entitlements/:capability` | entitlements | |
| GET | `/v1/generation-jobs/:id` | generation | |
| GET | `/v1/me` | identity | |
| GET | `/v1/interview-sessions/:id` | interview | |
| GET | `/v1/job-analyses/:id` | job-analysis | |
| GET | `/v1/companies/:id/logo` | jobs | |
| GET | `/v1/job-sources` | jobs | |
| GET | `/v1/jobs/postings` | jobs | |
| GET | `/v1/jobs/postings/:id` | jobs | |
| GET | `/v1/jobs/recent-searches` | jobs | |
| GET | `/v1/jobs/saved-searches` | jobs | |
| GET | `/v1/portfolios/:id/layouts` | layout | |
| GET | `/v1/brews/:id` | materials | |
| GET | `/v1/brews/:id/materials` | materials | |
| GET | `/v1/media` | media | |
| GET | `/v1/media/:id` | media | |
| GET | `${path}/document` | page | |
| GET | `${path}/history` | page | |
| GET | `/v1/portfolios` | portfolios | |
| GET | `/v1/portfolios/:id` | portfolios | |
| GET | `/v1/portfolios/:id/revisions` | portfolios | |
| GET | `/v1/export-jobs/:id` | publishing | |
| GET | `/v1/portfolios/:id/deployments` | publishing | |
| GET | `/v1/public/assets/:id` | publishing | |
| GET | `/v1/public/portfolios/:slug` | publishing | |
| GET | `/v1/recipes/:id` | recipe | |
| GET | `/health/live` | system | |
| GET | `/health/ready` | system | |
| GET | `/v1/recipes/:id/template-previews` | templates | |

**POST** (54개)

| Method | URI | 모듈 | Description |
| --- | --- | --- | --- |
| POST | `/v1/account/deletion` | account-lifecycle | |
| POST | `/v1/account/deletion/cancel` | account-lifecycle | |
| POST | `/v1/analytics/events` | analytics | |
| POST | `/v1/deployments/:id/analytics/aggregate` | analytics | |
| POST | `/v1/portfolios/:id/analytics/aggregate` | analytics | |
| POST | `/v1/portfolios/:id/analytics/insight` | analytics | |
| POST | `/v1/portfolios/:id/dashboard-layout` | analytics | |
| POST | `/v1/portfolios/:id/dashboard-views` | analytics | |
| POST | `/v1/portfolios/:id/widgets` | analytics | |
| POST | `/v1/career/categories` | career | |
| POST | `/v1/career/categories/:categoryId/views` | career | |
| POST | `/v1/career/records` | career | |
| POST | `/v1/career/records/:recordId/links` | career | |
| POST | `/v1/career/records/:recordId/restore` | career | |
| POST | `/v1/career/skills/recompute` | career | |
| POST | `/v1/consents` | consent | |
| POST | `/v1/generation-jobs` | generation | |
| POST | `/v1/auth/google` | identity | |
| POST | `/v1/auth/google/link` | identity | |
| POST | `/v1/auth/login` | identity | |
| POST | `/v1/auth/logout` | identity | |
| POST | `/v1/auth/signup` | identity | |
| POST | `/v1/brews/:id/interview-sessions` | interview | |
| POST | `/v1/interview-sessions/:id/${paused ? "pause" : "resume"}` | interview | |
| POST | `/v1/interview-sessions/:id/questions/:questionId/replace` | interview | |
| POST | `/v1/interview-sessions/:id/questions/:questionId/skip` | interview | |
| POST | `/v1/job-analyses/:id/reanalyze` | job-analysis | |
| POST | `/v1/job-sources` | jobs | |
| POST | `/v1/job-sources/:id/runs` | jobs | |
| POST | `/v1/job-sources/runs` | jobs | |
| POST | `/v1/jobs/demand-summary` | jobs | |
| POST | `/v1/jobs/postings/:id/analyses` | jobs | |
| POST | `/v1/jobs/postings/:id/match` | jobs | |
| POST | `/v1/jobs/saved-searches` | jobs | |
| POST | `/v1/jobs/search/interpret` | jobs | |
| POST | `/v1/jobs/submissions` | jobs | |
| POST | `/v1/jobs/url-imports` | jobs | |
| POST | `/v1/portfolios/:id/layouts/:layoutId/select` | layout | |
| POST | `/v1/portfolios/:id/layouts/remix` | layout | |
| POST | `/v1/brews` | materials | |
| POST | `/v1/media` | media | |
| POST | `/v1/portfolios/:id/sections/:sectionId/media-blocks` | media | |
| POST | `/v1/portfolio-edit-proposals/:id/apply` | portfolio-editing | |
| POST | `/v1/portfolio-revisions/:id/revert` | portfolio-editing | |
| POST | `/v1/portfolios/:id/blocks/:blockId/duplicate` | portfolio-editing | |
| POST | `/v1/portfolios/:id/blocks/:blockId/edit-preview` | portfolio-editing | |
| POST | `/v1/portfolios/:id/restore` | portfolio-editing | |
| POST | `/v1/assets/:id/signed-url` | publishing | |
| POST | `/v1/portfolios/:id/deployments` | publishing | |
| POST | `/v1/portfolios/:id/deployments/:deploymentId/rollback` | publishing | |
| POST | `/v1/portfolios/:id/exports` | publishing | |
| POST | `/v1/portfolios/:id/resume-assets` | publishing | |
| POST | `/v1/brews/:id/recipes` | recipe | |
| POST | `/v1/recipes/:id/revisions/:revisionId/restore-item` | recipe | |

**PUT** (5개)

| Method | URI | 모듈 | Description |
| --- | --- | --- | --- |
| PUT | `/v1/career/profile` | career | |
| PUT | `/v1/notification-preferences/:kind` | engagement | |
| PUT | `/v1/interview-sessions/:id/answers/:questionId` | interview | |
| PUT | `/v1/jobs/postings/:id/interest` | jobs | |
| PUT | `/v1/brews/:id/materials` | materials | |

**PATCH** (9개)

| Method | URI | 모듈 | Description |
| --- | --- | --- | --- |
| PATCH | `/v1/portfolios/:id/widgets/order` | analytics | |
| PATCH | `/v1/widgets/:id` | analytics | |
| PATCH | `/v1/career/categories/:categoryId/property-schema` | career | |
| PATCH | `/v1/career/records/:recordId` | career | |
| PATCH | `/v1/brews/:id` | materials | |
| PATCH | `/v1/portfolios/:id/sections/:sectionId` | portfolio-editing | |
| PATCH | `/v1/portfolios/:id/sections/:sectionId/blocks/order` | portfolio-editing | |
| PATCH | `/v1/portfolios/:id/sections/order` | portfolio-editing | |
| PATCH | `/v1/recipes/:id` | recipe | |

**DELETE** (8개)

| Method | URI | 모듈 | Description |
| --- | --- | --- | --- |
| DELETE | `/v1/portfolios/:id/dashboard-layout` | analytics | |
| DELETE | `/v1/widgets/:id` | analytics | |
| DELETE | `/v1/career/records/:recordId` | career | |
| DELETE | `/v1/consents/:scope` | consent | |
| DELETE | `/v1/identity/sessions/:sessionId` | identity | |
| DELETE | `/v1/jobs/recent-searches/:id` | jobs | |
| DELETE | `/v1/portfolios/:id/blocks/:blockId` | portfolio-editing | |
| DELETE | `/v1/portfolios/:id/publication` | publishing | |

> Description 칸은 미작성이다. `packages/contracts/src/`의 각 스키마 주석에서 옮긴다.

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

19개 중 18개가 수정 대상이다. **문서와 코드를 함께 고칠지, 문서만 양식에 맞출지는
결정이 필요하다.** 코드를 고치면 클라이언트 호출부와 계약 스키마가 함께 바뀐다.

## 7.3. 서비스 REST API 설계

7.2의 모든 API를 아래 형식으로 상세 설계한다. 대표 2건을 형식 예시로 작성한다.

### GET /v1/job-analyses/:id

```text
(웹) 클라이언트  ──▶  공고 분석 결과 요청   ──▶ (IN)   Expresso API 서버
                 ◀──  분석 결과 전송      ◀── (OUT)
```

**Parameter**

| 속성 | IN | OUT | Type | Description |
| --- | --- | --- | --- | --- |
| `id` | O | | uuid | 공고 분석 식별자 |
| `content_type` | | O | String | application/json |
| `status` | | O | String | pending / running / done / failed |
| `requirements` | | O | Array | 추출된 요구사항 목록 |
| `coverage` | | O | Array | 요구사항별 커버리지 판정 |
| `sourceSpans` | | O | Array | 원문 근거 구간 |

**실제 전송내용 (JSON)**

```json
전송방향 : IN
GET /v1/job-analyses/3f2a1c8e-0b47-4d9a-91c2-6e5f0a7b1d34

전송방향 : OUT
{
  "status": "done",
  "requirements": [
    {
      "id": "req_01",
      "label": "React 기반 프론트엔드 개발 경험",
      "axis": "technology",
      "kind": "must",
      "quote": "React를 사용한 웹 프론트엔드 개발 경험 3년 이상"
    }
  ],
  "coverage": [
    {
      "requirementId": "req_01",
      "coverage": "covered",
      "confidence": 0.86,
      "coveredBy": ["rec_a91f"],
      "decidedBy": "llm:job_analysis"
    }
  ]
}
```

`decidedBy`가 `model:...`이면 학습 모델이, `rule`이면 규칙 폴백이 판정한 것이다.
어느 쪽이 답했는지 남기지 않으면 성능 문제가 생겼을 때 원인을 가릴 수 없다.

### POST /v1/generation-jobs

```text
(웹) 클라이언트  ──▶  포트폴리오 생성 요청  ──▶ (IN)   Expresso API 서버
                 ◀──  작업 식별자 전송     ◀── (OUT)
```

**Parameter**

| 속성 | IN | OUT | Type | Description |
| --- | --- | --- | --- | --- |
| `recipeId` | O | | uuid | 생성 대상 레시피 |
| `templateId` | O | | uuid | 선택한 디자인 템플릿 |
| `Idempotency-Key` | O | | String | 헤더. 중복 생성 방지 |
| `content_type` | | O | String | application/json |
| `jobId` | | O | uuid | 생성 작업 식별자 |
| `status` | | O | String | queued |
| `usageRemaining` | | O | int | 남은 생성 횟수 |

**실제 전송내용 (JSON)**

```json
전송방향 : IN
{
  "recipeId": "8c4d2e1a-77b3-4f60-a1de-93c5b0f28a47",
  "templateId": "2b91f0c6-4a15-4e83-9d27-5f60ab3c81e9"
}

전송방향 : OUT
{
  "jobId": "d5e7a2b9-31c0-4a68-b7f4-0e19c86d5a23",
  "status": "queued",
  "usageRemaining": 2
}
```

### 작성 현황

125개 중 2개 작성.

## 7.4. AI학습서버 REST API 설계

AI학습서버는 별도로 실행되는 서버다. 서비스 API와 포트·프로세스를 분리한다.

| 항목 | 값 |
| --- | --- |
| 기본 경로 | `/training` · `/inference` |
| 포트 | 4100 |
| 인증 | 내부 네트워크 + 서비스 토큰 |
| 외부 공개 | 하지 않음 |
| 모델 종류 | `match`(모델 A) · `record`(모델 B) — 경로 파라미터 또는 본문의 `kind`로 구분 |

### API 정의

| Method | URI | Description |
| --- | --- | --- |
| GET | `/training/datasets` | 데이터세트 목록 조회 (`?kind=match\|record`) |
| POST | `/training/datasets` | 데이터세트 생성 — 쌍 생성 · 교사 라벨링 · 특징 추출 |
| GET | `/training/datasets/:version` | 데이터세트 상세(행 수 · 분포 · 교사 모델 · κ) |
| DELETE | `/training/datasets/:version` | 데이터세트 삭제 |
| GET | `/training/datasets/:version/review-samples` | 사람 검수용 표본 조회 (교사 라벨 가림) |
| PUT | `/training/datasets/:version/review-samples` | 검수 결과 제출 · κ 산출 |
| GET | `/training/runs` | 학습 실행 목록 조회 |
| POST | `/training/runs` | 학습 실행 |
| GET | `/training/runs/:id` | 학습 진행 · 결과 조회 |
| DELETE | `/training/runs/:id` | 학습 중단 |
| GET | `/training/runs/:id/metrics` | 성능 지표 조회 (ROC 좌표 · NDCG · 3축 비교) |
| GET | `/training/models` | 모델 버전 목록 조회 (`?kind=`) |
| GET | `/training/models/:version` | 모델 상세 조회 |
| POST | `/training/models/:version/deployments` | 모델 배포 |
| DELETE | `/training/models/:version` | 모델 삭제 |
| GET | `/training/active-models` | 활성 모델 조회 (A · B 각각) |
| PUT | `/training/active-models/:kind` | 활성 모델 변경(롤백 포함) |
| GET | `/training/parameters` | 학습 파라미터 조회 |
| PUT | `/training/parameters` | 학습 파라미터 수정 |
| GET | `/training/teacher-prompts` | 교사 프롬프트 버전 조회 |
| PUT | `/training/teacher-prompts/:kind` | 교사 프롬프트 수정 |
| GET | `/training/failures` | 학습 장애기록 조회 |
| POST | `/inference/match` | **모델 A** — 공고 적합도 판정 |
| POST | `/inference/record-rank` | **모델 B** — 공고에 맞는 기록 정렬 |
| GET | `/health/live` | 생존 확인 |
| GET | `/health/ready` | 준비 확인(모델 로드 여부) |

### POST /inference/match — 모델 A

```text
API 서버  ──▶  공고 적합도 판정 요청  ──▶ (IN)   AI학습서버(추론)
          ◀──  공고별 점수 전송      ◀── (OUT)
```

**Parameter**

| 속성 | IN | OUT | Type | Description |
| --- | --- | --- | --- | --- |
| `profile` | O | | Object | 프로필 요약 — 총 경력 · 주 직군 · 스킬 · 기록 수 |
| `profile.recordCount` | O | | int | 3 미만이면 서버가 `usable: false`로 답한다 |
| `postings` | O | | Array | 공고 목록 (최대 500) |
| `postings[].id` | O | | uuid | 공고 식별자 |
| `postings[].requirements` | O | | Array | 라벨 · 축 · 종류 |
| `modelVersion` | | O | String | 판정에 쓴 모델 버전 |
| `usable` | | O | bool | 모델 적용 가능 여부. false면 호출자가 규칙으로 폴백 |
| `results` | | O | Array | 공고별 결과 |
| `results[].score` | | O | int | 적합도 0–100. 요건 0건이면 null |
| `results[].axes` | | O | Object | 축별 충족률 |
| `results[].topFeatures` | | O | Array | 판정에 기여한 특징 상위 3개 |

**실제 전송내용 (JSON)**

```json
전송방향 : IN
{
  "profile": {
    "totalMonths": 46,
    "primaryCategory": "backend",
    "skills": ["typescript", "postgresql", "aws"],
    "recordCount": 12
  },
  "postings": [
    {
      "id": "8c4d2e1a-77b3-4f60-a1de-93c5b0f28a47",
      "requirements": [
        { "label": "TypeScript 백엔드 개발 경험 3년 이상", "axis": "technology", "kind": "must" },
        { "label": "대용량 트래픽 처리 경험", "axis": "impact", "kind": "nice" }
      ]
    }
  ]
}

전송방향 : OUT
{
  "modelVersion": "match-v1-003",
  "usable": true,
  "results": [
    {
      "id": "8c4d2e1a-77b3-4f60-a1de-93c5b0f28a47",
      "score": 78,
      "axes": { "technology": 0.86, "impact": 0.40, "role": 0.75, "conditions": 1.0 },
      "topFeatures": ["cos_skills_requirements", "must_hit_ratio", "years_gap"]
    }
  ]
}
```

`usable`이 false면 호출자가 `match-score.ts` 규칙으로 되돌아갑니다. 기록이 3건 미만인
신규 사용자는 학습 분포 밖이라 모델이 근거 없는 순위를 냅니다.

### POST /inference/record-rank — 모델 B

**Parameter**

| 속성 | IN | OUT | Type | Description |
| --- | --- | --- | --- | --- |
| `posting` | O | | Object | 공고 요약 · 요구사항 목록 |
| `records` | O | | Array | 정렬 대상 기록 목록 |
| `records[]` | O | | Object | 제목 · 본문 · 카테고리 · 속성 |
| `modelVersion` | | O | String | 정렬에 쓴 모델 버전 |
| `results[].score` | | O | float | 적합도 0–100 |
| `results[].rank` | | O | int | 이 공고 안에서의 순위 |
| `results[].topFeatures` | | O | Array | 적합도에 기여한 특징 상위 3개 |

**실제 전송내용 (JSON)**

```json
전송방향 : IN
{
  "posting": {
    "summary": "React 기반 웹 프론트엔드 개발자를 찾습니다. ...",
    "requirements": [
      { "label": "React 기반 프론트엔드 개발 경험", "axis": "technology", "kind": "must" }
    ]
  },
  "records": [
    {
      "recordId": "r1",
      "title": "사내 관리자 콘솔 재구축",
      "body": "React와 TypeScript로 관리자 콘솔을 다시 만들었다. ...",
      "category": "프로젝트",
      "properties": { "durationMonths": 8, "stack": ["react", "typescript"] }
    }
  ]
}

전송방향 : OUT
{
  "modelVersion": "record-v1-002",
  "results": [
    {
      "recordId": "r1",
      "score": 96,
      "rank": 1,
      "topFeatures": ["max_sent_cos", "tech_token_recall", "duration_months"]
    }
  ]
}
```

`topFeatures`가 있어야 화면 01b에서 "왜 이 기록을 뺐는가"(T4.1.3 제외 사유 제시)를
사용자에게 보일 수 있습니다.

### POST /training/runs

**Parameter**

| 속성 | IN | OUT | Type | Description |
| --- | --- | --- | --- | --- |
| `kind` | O | | String | `match` 또는 `record` |
| `datasetVersion` | O | | String | 학습에 쓸 데이터세트 |
| `algorithm` | O | | String | `lightgbm_rank` / `logistic` |
| `parameterOverrides` | | | Object | 4.3 기본값 덮어쓰기 |
| `runId` | | O | uuid | 학습 실행 식별자 |
| `status` | | O | String | queued |

교사 신뢰도(κ)가 0.6 미만인 데이터세트로 학습을 요청하면 **400을 반환하고 학습하지
않습니다.** 교사가 사람과 어긋난 상태에서 학습하면 학생이 그 오차를 배웁니다.

### GET /training/runs/:id/metrics

**Parameter**

| 속성 | IN | OUT | Type | Description |
| --- | --- | --- | --- | --- |
| `id` | O | | uuid | 학습 실행 식별자 |
| `kind` | | O | String | `match` / `record` |
| `ndcg` | | O | Object | 모델 A 전용 — `@5` · `@10` |
| `precisionAt8` | | O | float | 상위 여덟 건의 정밀도 (모델 B) |
| `ndcg` | | O | Object | NDCG@5 · NDCG@10 (두 모델 공통) |
| `rocPoints` | | O | Array | ROC 좌표 (높음 vs 나머지, 모델별 1곡선) |
| `auc` | | O | Object | 높음 vs 나머지 AUC |
| `baseline` | | O | Object | 규칙 기반 동일 지표 |
| `teacherAgreement` | | O | Object | 교사↔사람 κ |
| `studentHuman` | | O | Object | 학생↔사람 일치도 |
| `latencyMs` | | O | Object | 모델 A 전용 — 공고 200건 판정 지연 |
| `approved` | | O | bool | 9.2 기준 충족 여부 |
