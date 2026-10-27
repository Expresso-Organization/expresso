---
title: 포트폴리오 첫 화면 배경 오브젝트와 인터랙티브 장면
slug: portfolio-backdrop-objects
stage: plan
status: accepted
intent: .intent/intent_portfolio-backdrop-objects.md
spec: .intent/spec_portfolio-backdrop-objects.md
date: 2026-10-28
---

# 포트폴리오 첫 화면 배경 오브젝트와 인터랙티브 장면 — 구현 계획

작업은 두 묶음입니다. 묶음 A(정적 배경)는 그것만으로 PR이 됩니다. 묶음 B(스크립트 허용 · 장면)는 A 위에 쌓습니다.

## 바뀌는 파일

| 파일 | 묶음 | 무엇을 |
|---|---|---|
| `packages/contracts/src/structured-portfolio.ts` · `.test.ts` | A · B | `STRUCTURED_BACKDROPS`, 저장 칸(선택) · 모델 칸(필수). B에서 `STRUCTURED_SCENES` 추가 |
| `packages/contracts/src/page.ts` | A · B | A: `PAGE_PROMPT_VERSION` 15. B: `pageDocumentPolicy()`, `pageDocument`의 런타임 `<script>` |
| `packages/portfolio-renderer/src/backdrop.tsx` (새) | A | 정적 일곱 종 · `BACKDROP_CSS` · `describeBackdrops()` |
| `packages/portfolio-renderer/src/design-tokens.ts` | A | `backdropColors()`, `designQa` 배경 쌍 |
| `packages/portfolio-renderer/src/kit.tsx` · `kit-styles.ts` · `catalog.ts` · `index.ts` | A · B | 첫 화면 배경 층, 포스터 줄무늬 이전, NameIntro 칸. B에서 `data-scene` 표식 · `SCENE_FALLBACK` · `--xp-bd-base` |
| `packages/portfolio-renderer/src/kit.test.ts` | A · B | 구도 × 배경 렌더, 새 색 없음, 모션 조건, 장면 표식 |
| `packages/portfolio-renderer/src/scene-runtime/*` (새) · `scripts/build-scene.mjs` (새) · `tsconfig.build.json` | B | 진입점 · 공통 루프 · 장면 여섯 · `inkMix()` · 테스트, esbuild 묶기, 런타임은 tsc 산출물에서 뺌 |
| `packages/portfolio-renderer/package.json` | B | `three@0.186.1` · `esbuild` 의존성, `build:scene` 스크립트 |
| `services/web/package.json` · `.gitignore` · `next.config.ts` · `src/lib/page-document.ts` (새) | B | `dev` · `build` 앞에 `build:scene`, `public/scene-runtime/` 제외, 런타임 CORS 헤더, 문서 응답 공용 함수 |
| `services/web/src/app/site/[slug]/page.tsx` · `document/route.ts` (새) | B | iframe `src` 전환, 공개 문서 라우트 |
| `services/web/src/app/(app)/edit/[portfolioId]/preview/route.ts` | B | 공유 정책으로 교체 |
| `services/backend/src/modules/page/routes.ts` | B | `/document` 공유 정책 + `APP_BASE_URL` 런타임 주소 |
| `services/backend/src/modules/page/design-first.ts` · `structured-generator.ts` · `design-first.test.ts` · `structured-generator.test.ts` · `structured.mongo.integration.test.ts` | A | 프롬프트 한 줄씩, 테스트(가짜 모델 출력에 필수가 된 배경 칸 추가) |
| `services/backend/src/modules/design-systems/design-qa.test.ts` | A | 38종 배경 세기 유지 |
| `services/backend/src/api/build-app.ts` · `page.integration.test.ts` · `stream-route.integration.test.ts` · `packages/contracts/src/page-document.test.ts` (새) | B | 문서 라우트에 웹 출처 전달, 정책 테스트. 배포 · CI는 웹 `build`가 런타임을 묶으므로 고치지 않음 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

**묶음 A — 정적 배경**
1. 계약(정적 값) — `pnpm --filter @expresso/contracts test`.
2. 색 계산 — `backdropColors()` · `designQa`. 백엔드 `design-qa.test.ts` 38종 통과.
3. 정적 부품 — `backdrop.tsx`. 견본 HTML을 스크래치패드에 그려 headless Chrome 1440 · 390으로 보고 세기를 맞춤.
4. 키트 연결 — `kit.tsx` · `catalog.ts`, 포스터 이전은 별도 커밋. 포스터 전후 스크린샷 비교.
5. 생성 연결 — 프롬프트 두 줄, `PAGE_PROMPT_VERSION` 15. `design-first.test.ts` 통과.

**묶음 B — 스크립트 허용 · 장면**
6. 정책 — `pageDocumentPolicy()`, 세 라우트, 공개 사이트 iframe 전환. 브라우저에서 인라인 스크립트가 막히고 CSP 위반이 기록되는지 확인.
7. 런타임 골격 — 공통 루프 · `inkMix()` · 빌드 파이프라인. `inkMix` 단위 테스트, 웹 `pnpm dev`에서 `/scene-runtime/v1/main.js` 200 확인.
8. 장면 여섯 — 2D 셋, 3D 셋. 견본에서 포인터 이동 전후 스크린샷, headless 픽셀 표본으로 바탕 · 잉크 사이 색인지 확인.
9. 키트 · 계약 연결 — 장면 값, `data-scene` 표식, `pageDocument` 스크립트 태그.

**마무리**
10. 전체 검사 — `pnpm typecheck`, `pnpm test`, `pnpm infra:up` 뒤 `pnpm test:infra`.
11. 실제 생성 · 배포 — 체험 설정 복사, API 4204 · 워커(`QUEUE_PREFIX=expresso-backdrop`, 페이지 생성 공급자 `claude-code` 명시) · 웹 3204(`backdrop.localhost`). dev01로 생성 · 배포 → 공개 지면 1440 · 390 스크린샷, 390 · CPU 4배 감속 프레임 시간, 런타임 gzip 크기, 움직임 줄이기 확인.
12. origin/main 다시 병합, 커밋 · 푸시, PR(분할은 게이트 답을 따름).

## 가장 위험한 단계

6단계 스크립트 허용 정책입니다. 공개 지면의 보안 경계를 바꾸고, 공개 사이트를 `srcdoc`에서 주소 방식으로 옮깁니다. 정책을 잘못 쓰면 장면이 안 돌거나(너무 좁음), 소독기 한 겹만 남습니다(너무 넓음). 확인 방법은 두 가지입니다. 하나는 인라인 스크립트 문서로 실행 차단을 보는 것이고, 다른 하나는 옛 배포 스냅샷 하나를 새 라우트로 열어 그대로 보이는지 보는 것입니다. 정책 변경은 단독 커밋으로 두어 그 커밋만 되돌리면 이전 상태(스크립트 전면 금지, 대체 그림 표시)로 돌아갑니다.

## 검증

```
pnpm typecheck
pnpm test
pnpm infra:up && pnpm test:infra
pnpm --filter @expresso/web build:scene && for f in services/web/public/scene-runtime/v1/*.js; do gzip -c $f | wc -c; done
```

화면 확인:
- 견본: 열세 종 × Clarity(밝음) · 어두운 기본 디자인 하나, 1440 · 390.
- 실제: `http://backdrop.localhost:3204`에서 dev01 → 생성 → 배포 → `/site/<slug>` 1440 · 390, 포인터 이동 전후.
- headless Chrome: `prefers-reduced-motion: reduce` 흉내에서 루프가 멈추는지, CPU 4배 감속 390px 프레임 시간.
