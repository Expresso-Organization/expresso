# Expresso — 에이전트 지침

## 이 저장소

커리어 기록을 모아 채용 공고에 맞는 포트폴리오를 만들고 배포하는 제품입니다.
pnpm 모노레포 하나에 전부 들어 있습니다.

| 자리 | 무엇 |
| --- | --- |
| `services/backend` | Fastify API와 BullMQ Worker. 같은 도메인 코드 · 두 프로세스 |
| `services/web` | Next.js 16 App Router. 앱 화면 · 랜딩 · 공개 포트폴리오 |
| `services/dev-portal` | 명세와 개발 포털 |
| `services/mobile` · `services/desktop` | 모바일 · 데스크톱 클라이언트 |
| `packages/contracts` | 서비스가 함께 쓰는 Zod 계약과 타입 |
| `packages/database` | 스키마와 마이그레이션 |

독립적으로 돌리거나 배포할 것만 `services`에 둡니다. 둘 이상이 함께 쓰는 코드만
`packages`로 올립니다.

경계를 자세히 볼 곳은 `docs/architecture/backend.md`와
`docs/architecture/frontend.md`입니다.

## 돌려 보기

Node 24 이상, pnpm 11입니다.

```bash
pnpm install
pnpm infra:up                                   # MySQL 53306 · Redis 56379
cp services/backend/.env.example services/backend/.env
pnpm db:migrate
pnpm dev:backend                                # http://127.0.0.1:4000
```

`pnpm dev:worker`가 큐 소비자를, `pnpm dev:web`이 3000번에 웹을 띄웁니다.
인프라가 없어도 API 프로세스는 뜨지만 `/health/ready`는 503을 냅니다.

**AI 호출은 기본이 `off`입니다** — 키 없이 각 모듈의 규칙 기반 구현으로 돕니다.
켤 때 고를 수 있는 값과 뜻은 `services/backend/.env.example`에 적혀 있습니다.

## 끝내기 전에

```bash
pnpm typecheck
pnpm test
```

- **테스트는 `dist`를 봅니다.** `@expresso/contracts`와 `@expresso/database`를
  먼저 지어야 vitest가 찾습니다. 각 패키지의 `test` 스크립트가 그 둘을 먼저
  짓게 되어 있고, CI와 `scripts/operations/deploy.sh`도 같은 순서입니다. 순서가
  갈리면 한쪽에서만 깨집니다.
- 백엔드를 고쳤으면 실제 인프라까지 씁니다 — `pnpm test:infra`. 루트 스크립트가
  `TEST_DATABASE_URL`과 `TEST_REDIS_URL`을 `infra:up`이 띄운 포트로 넘깁니다.
- CI가 도는 순서는 `.github/workflows/backend-ci.yml` · `web-ci.yml`에 있습니다 —
  계약·스키마 빌드 → 마이그레이션 → 타입 검사 → 테스트 → 통합 테스트 → 빌드.

## 지키는 선

- **계약이 유일한 출처입니다.** 요청·응답 타입은 `packages/contracts`의 Zod
  스키마에서 파생합니다. 손으로 적지 않습니다. 웹은 응답을 `lib/api/client.ts`
  에서 파싱하므로, 계약을 어기면 화면이 잘못 그려지는 대신 그 자리에서 멈춥니다.
- **모듈은 남의 속을 열지 않습니다.** `services/backend/src/modules/*`는 다른
  모듈의 내부 파일을 직접 가져오지 않고, 진입점이나 `packages/contracts`로
  드러낸 것만 씁니다.
- **스키마는 `packages/database`가 소유합니다.** 서비스가 뜰 때 스키마를 바꾸지
  않습니다. 마이그레이션은 `pnpm db:migrate`로 따로 돌립니다.
- **색 · 크기의 출처는 `services/web/src/styles/tokens.css` 한 곳입니다.**
  CSS Modules와 `--ex-*` 변수를 쓰고, 표에 없는 값을 새로 만들지 않습니다.
  토큰과 화면 정의서(`docs/Expresso Screens.dc.html`)가 어긋나면 정의서가
  기준입니다.
- **UI 컴포넌트는 도메인을 모릅니다.** 도메인 데이터를 UI 속성으로 바꾸는 일은
  화면이 합니다.
- **세션 토큰은 `httpOnly` 쿠키(`ex_session`) 하나에만 둡니다.** 클라이언트
  자바스크립트가 읽는 자리에 토큰을 두지 않습니다.

## 커밋과 주석

- 코드 작업을 마치고 나면 커밋/푸쉬합니다.
- **커밋 제목은 `{tag}: {간결한 명사형 설명}` 입니다.** `~한다` · `~고친다` ·
  `~옮긴다` 처럼 한 일을 서술하는 문장을 쓰지 않습니다. 제목은 작업 일지가
  아니라 끝난 변경을 한눈에 알아보는 자리입니다.

  ```text
  feat: Google 로그인 웹 OAuth 왕복 추가
  fix: 회사 필터 공고 목록 500 오류 수정
  docs: 프로젝트 README 전면 개편
  ci: 백엔드 CI 계약 빌드 선행 설정
  ```

  태그에 괄호를 붙이지 않습니다 — `fix(db):` 는 이 저장소의 양식이 아닙니다.
- **양식을 `git log` 에서 역추론하지 않습니다.** 히스토리에는 규칙을 어긴 커밋도
  들어 있습니다. 출처는 README 「협업 규칙 → 커밋 메시지」입니다.
- 주석은 한국어로 작성합니다.

## 배포

운영 배포는 `docs/operations/DEPLOYMENT.md`를 따릅니다. `main`에 머지되면
`.github/workflows/web-deploy.yml`이 서버에서 `scripts/operations/deploy.sh`를
돌립니다.

## 문서와 발표 자료

`docs/` 에 **사람이 눈으로 읽을 문서나 발표 자료**를 만들 때는
`docs/AGENTS.md`를 먼저 읽습니다. 어떤 양식에서 시작하는지 · 무엇을 손대지
않는지 · 그림을 어디서 가져오는지 · 이 팀이 쓰는 말투가 거기 있습니다. 빈
HTML로 시작하거나 다른 문서의 스타일을 베껴 오지 않습니다.

코드와 함께 읽는 것 — 아키텍처 노트와 운영 절차 — 은 `docs/architecture/` ·
`docs/operations/` 에 Markdown 그대로 둡니다.
