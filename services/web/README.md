# Expresso Web

Expresso 제품 웹 서비스입니다. Next.js 16 App Router · React 19 · CSS Modules.

## 실행

백엔드가 먼저 떠 있어야 합니다.

```bash
pnpm infra:up
pnpm db:migrate
pnpm dev:backend
```

다른 터미널에서:

```bash
cp services/web/.env.example services/web/.env.local
pnpm dev:web
```

`http://localhost:3000`에서 열립니다. API 주소는 `NEXT_PUBLIC_API_BASE_URL`로 바꿉니다.

## 구조

```text
src/
  app/                  App Router. (auth)는 셸 없는 화면, (app)은 앱 셸 화면
  components/
    shell/              앱 셸 · 위저드 셸 · 에디터 셸 (§4) + 사이드바 (§2.2)
    ui/                 컴포넌트 라이브러리 (§5)
  lib/
    api/                contracts 기반 타입 API 클라이언트
    session.ts          httpOnly 쿠키 세션
  styles/
    tokens.css          디자인 토큰 (§3) — 유일한 출처
```

## 규칙

- **화면은 정의서에서 가져온다. 비슷하게 만들지 않는다.**
  `docs/Expresso Screens.dc.html`에 29개 화면이 실제 마크업으로 들어 있습니다.
  새 화면을 만들 때는 먼저 그 화면의 HTML을 꺼내 색·치수·문구를 그대로 옮기고,
  그다음에 실제 데이터를 끼웁니다. 눈대중으로 다시 그리지 않습니다.

  ```bash
  # 정의서에서 화면 하나만 뽑아 보기 좋게 출력
  python3 scripts/extract-screen.py 05
  ```

- **토큰 밖의 값을 쓰지 않는다.** 색·크기·모션은 `--ex-*` 변수로만 씁니다.
  값의 출처는 구현 명세서 §3이 기준표이고, 화면 정의서가 실제 사용값입니다.
  **둘이 어긋나면 화면 정의서가 기준입니다.**
- **응답은 항상 Zod로 검증한다.** `lib/api/client.ts`가 `@expresso/contracts`의
  스키마로 파싱하므로, 백엔드가 계약을 어기면 화면이 아니라 여기서 실패합니다.
- **AI 산출물은 근거 없이 그리지 않는다.** `sourceRef`가 없는 항목은 렌더하지 않습니다.
- **애니메이션은 전역 클래스로 붙인다.** CSS Modules가 모듈 안의 `animation-name`까지
  스코프해서 전역 키프레임을 못 찾습니다. `ex-anim-caret`처럼 `global.css`의
  유틸리티 클래스를 씁니다.

## 현재 상태

**화면 정의서 29종 전부 이식 완료.**

| 화면 | 라우트 | 데이터 |
|---|---|---|
| 10 로그인 · 10b 회원가입 | `/login` · `/signup` | 실제 API. 소셜 버튼은 OAuth 경로가 없어 비활성 |
| 10c · 10d · 10e 온보딩 | `/onboarding/goal` · `/materials` · `/first-portfolio` | 샘플 |
| 00 홈 | `/home` | `GET /v1/home` + 카테고리 |
| 00c 통합 검색 · 알림 | ⌘K 오버레이 (앱 셸 어디서든) | 샘플 |
| 00b AI 검색 결과 · 06 공고 탐색 | `/jobs?q=…` · `/jobs` | 샘플 |
| 06b 공고 상세 | `/jobs/[jobId]` | 샘플 |
| 05–05e 내 커리어 | `/career/[categorySlug]` | `GET /v1/career/records` |
| 01 · 01b · 02 · 02b · 03 제작 | `/brew/[brewId]/{analyze,materials,counter,outline,design}` | 샘플 |
| 04 · 04b · 04c 다듬기 | `/edit/[portfolioId]` (3탭) | 샘플 |
| 08b 배포 · 버전 | `/edit/[portfolioId]/deploy` | 샘플 |
| 08 공개 사이트 | `/site/[slug]` | 샘플 |
| 07 · 07b · 07c 분석 | `/analytics` (편집 모드 · 위젯 설정 드로어) | 샘플 |
| 09 계정 · 요금제 | `/account` | 샘플 |

### 예시 데이터에 대해

실제 API로 도는 것은 인증 · 홈 · 내 커리어뿐입니다. 나머지 화면은 아직 없는
API를 요구합니다 — `GET /v1/brews/:id`, `GET /v1/portfolios/:id`,
`GET /v1/jobs/postings`, 템플릿 목록, 대시보드 뷰, 그리고 §8.3의 AI 계약 8종.
(`docs/API_GAPS.md`)

그래서 화면은 정의서대로 완성해 두고 데이터만 `lib/sample/*.ts`에서 읽습니다.
타입은 서버 응답 모양에 맞춰 뒀으니 **API가 생기면 그 모듈만 교체**하면 됩니다.
샘플 안의 문자열은 정의서의 확정 문구이므로 임의로 바꾸지 않습니다.

```text
lib/sample/
  brew.ts       01 · 01b · 02 · 02b
  editor.ts     04 · 04b · 04c
  jobs.ts       00b · 06 · 06b
  analytics.ts  07 · 07b · 07c
  site.ts       08 · 08b · 09 · 00c
```

## 명세

| 무엇을 볼 때 | 어느 문서 |
|---|---|
| **화면이 실제로 어떻게 생겼는가 (최종 기준)** | **Expresso Screens** — 29종 |
| 토큰 · 컴포넌트 규칙 · 계산식 · 이벤트 | 구현 명세서 |
| 무엇이 어떤 규칙으로 작동하는가 | 기능 명세서 (D1–D12) |
| 테이블 · 제약 · 상태 전이 | 데이터 모델 명세서 · ERD |
