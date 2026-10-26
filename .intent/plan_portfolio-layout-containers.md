---
title: 모델이 구성하는 포트폴리오 지면 레이아웃
slug: portfolio-layout-containers
stage: plan
status: accepted
intent: .intent/intent_portfolio-layout-containers.md
spec: .intent/spec_portfolio-layout-containers.md
date: 2026-10-09
---

# 모델이 구성하는 포트폴리오 지면 레이아웃 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/contracts/src/structured-portfolio.ts` | 컨테이너 노드, 트리 검증, 모델 계약의 `group-1`…`group-4` |
| `packages/contracts/src/structured-portfolio.test.ts` | R2·R3 검증 테스트 |
| `packages/portfolio-renderer/src/renderer.tsx` | 카탈로그·레지스트리에 `Columns`·`Grid`·`Band` |
| `packages/portfolio-renderer/src/styles.ts` | 컨테이너 CSS, 컨테이너 안 요소 여백, 900px 이하 한 열 |
| `packages/portfolio-renderer/src/renderer.test.ts` 또는 `library.test.ts` | 평평한 Spec HTML 동일성(R4), 컨테이너 렌더링 |
| `services/backend/src/modules/page/structured-generator.ts` | 프롬프트 컨테이너 규칙·예시 |
| `services/backend/src/modules/page/structured-generator.test.ts` | 컨테이너 Spec 생성 경로 |
| `services/backend/src/modules/page/structured.mongo.integration.test.ts` | 중첩 Spec 저장·구성 편집 |
| `services/web/src/app/(app)/edit/[portfolioId]/StructuredPageProperties.tsx` | 트리 순회 목록, 부모 안 이동, 묶음 표시 |
| `scripts/library/renderer/run-structured-profiles.ts` | `PORTFOLIO_AI=claude-code` |
| `scripts/library/renderer/check-collected-runtime.mjs` | 사례 원본을 `Grid`·`Columns`에 넣은 넘침 검사 |
| `scripts/library/renderer/seed-structured-preview.ts` | 편집 화면 확인용 컨테이너 Spec(필요 시) |
| `scripts/library/renderer/verify-structured-profiles.mjs` | 트리 표기, 구성 수 기록 |
| `scripts/library/renderer/compare-runs.mjs` | 지면 구성 측정값 |
| `docs/library/previews/portfolio/runs/library-layout-qwen-2026-10-09/` · `library-layout-sonnet-2026-10-09/` · `library-layout-sonnet-full-2026-10-09/` | 실행 기록·비교·검증 |
| `docs/architecture/portfolio-library-selection.md` | 컨테이너 규칙과 실행 결과 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 계약 — 컨테이너 노드·트리 검증·모델 계약. `pnpm --filter @expresso/contracts test`로 기존 평평한 Spec 테스트와 새 R2 사례(중첩 금지, 중복·누락, 소개·연락처 위치, 자식 수, type·variant 짝)를 확인.
2. 렌더러 — 카탈로그·레지스트리·CSS. 저장 Spec 세 개의 HTML이 `library-selection-rerender-2026-10-09`의 HTML과 같음을 테스트로 확인(R4). 컨테이너 예시 Spec을 원본 38개 조합으로 390·926·1440px 넘침 검사.
3. 프롬프트 — 규칙·예시 추가, 생성기 테스트 갱신.
4. 편집 화면 — 트리 목록·부모 안 이동. `pnpm --filter web test`, 개발 서버에서 컨테이너가 있는 판을 열어 유형 교체·이동·저장 확인.
5. 통합 테스트 — 중첩 Spec 저장·편집. `pnpm test:infra structured.mongo.integration.test.ts`.
6. 스크립트 — Sonnet 공급자, 트리 표기, 구성 측정값.
7. 실행 — qwen 3개와 Sonnet 3개(같은 준비된 입력), Sonnet 전체 경로 1개(시간·토큰 측정용). 비교 페이지·검증 기록 생성, 화면 확인.
8. 문서, 전체 `pnpm typecheck`·`pnpm test`·`pnpm test:infra`, 커밋·푸시·PR(#56 위에 쌓은 PR).

## 가장 위험한 단계

1단계의 트리 검증. 기존 평평한 Spec을 거절하면 저장된 포트폴리오의 편집·재렌더링이 깨진다. 기존 계약 테스트와 저장 Spec 세 개, 통합 테스트의 기존 사례가 모두 통과해야 다음 단계로 간다. 되돌리기는 계약 커밋을 되돌리면 되고, 저장 데이터는 바뀌지 않는다.

## 검증

```bash
pnpm --filter @expresso/contracts test
pnpm --filter @expresso/portfolio-renderer build && pnpm --filter @expresso/portfolio-renderer test
node scripts/library/renderer/check-collected-runtime.mjs --browser
pnpm typecheck && pnpm test
pnpm test:infra integration.test.ts --maxWorkers=2
PORTFOLIO_RUN_ID=library-layout-qwen-2026-10-09 services/backend/node_modules/.bin/tsx scripts/library/renderer/run-structured-profiles.ts
PORTFOLIO_AI=claude-code PORTFOLIO_RUN_ID=library-layout-sonnet-2026-10-09 services/backend/node_modules/.bin/tsx scripts/library/renderer/run-structured-profiles.ts
PORTFOLIO_AI=claude-code PORTFOLIO_NORMALIZE=1 PORTFOLIO_PROFILE=robotics-engineer PORTFOLIO_RUN_ID=library-layout-sonnet-full-2026-10-09 services/backend/node_modules/.bin/tsx scripts/library/renderer/run-structured-profiles.ts
python3 -m http.server 8942 -d docs   # 별도 프로세스
node scripts/library/renderer/compare-runs.mjs library-selection-rerender-2026-10-09 library-layout-qwen-2026-10-09
node scripts/library/renderer/verify-structured-profiles.mjs library-layout-qwen-2026-10-09
node scripts/library/renderer/verify-structured-profiles.mjs library-layout-sonnet-2026-10-09
```

화면: 두 실행의 세 프로필을 1440·390px로 열어 컨테이너 배치와 넘침을 확인한다. 편집 화면에서 컨테이너 안 사례의 유형 교체·이동·저장 후 구성이 남는지 확인한다.

## 구현 중 바뀐 점

- `Grid` 세 열과 `Columns(wide-start)` 좁은 열에서 Book 원본(고정 폭 300px)이 926px 화면에서 열 밖으로 나갔다. 원본을 금지하지 않고, 열 최소 폭 300px과 `Columns` 컨테이너 쿼리(680px)로 해결했다. 컨테이너에 `.sp-group-track` 안쪽 요소를 더했다.
- 저장 스키마가 type별 variant enum으로 먼저 거절하면 재시도 요청에 union 오류 전체가 들어갔다. 저장 스키마도 variant를 단일 enum으로 받고, 짝은 도메인 검사 메시지로 알린다.
- 프롬프트가 바뀌어 `PAGE_PROMPT_VERSION`을 8로 올렸다.
- `verify-structured-profiles.mjs`는 생성에 실패한 프로필(`run.json` 없음)을 검사에서 빼고 `failed`로 기록한다.
- 첫 Claude 실행은 `modelTier`를 넘기지 않아 기본 티어 `opus`로 호출됐다. 결과를 `library-layout-opus-2026-10-09`로 옮겨 기록하고, 스크립트가 제품과 같은 `sonnet`을 넘기도록 고쳐 다시 실행했다.
- Sonnet 전체 경로 측정은 입력 정리 단계 실패로 결과 폴더를 남기지 못했다. 실패 내용은 문서에 기록했다.
