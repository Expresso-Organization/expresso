---
title: 디자인 시스템 토큰 기반 포트폴리오 섹션 키트
slug: portfolio-token-kit
stage: plan
status: accepted
intent: .intent/intent_portfolio-token-kit.md
spec: .intent/spec_portfolio-token-kit.md
date: 2026-10-16
---

# 디자인 시스템 토큰 기반 포트폴리오 섹션 키트 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/portfolio-renderer/src/design-tokens.ts` (새) | 토큰 변수, 웹폰트, 대비 계산·보정, `designQa` |
| `packages/portfolio-renderer/src/design-tokens.test.ts` (새) | 변수, 보정, 38종 QA는 백엔드 테스트에서 |
| `packages/portfolio-renderer/src/kit.tsx` · `kit-styles.ts` (새) | 키트 레지스트리와 CSS |
| `packages/portfolio-renderer/src/kit.test.ts` (새) | 섹션 대응, 변형, JS 없는 표시용 마크업 |
| `packages/portfolio-renderer/src/renderer.tsx` · `index.ts` | 경로 분기, `design` 옵션, 내보내기 |
| `packages/portfolio-renderer/package.json` | `@expresso/contracts` 디자인 시스템 타입 사용(이미 의존) |
| `packages/contracts/src/structured-portfolio.ts` (+ 테스트) | `NameIntro.variant`, 모델 스키마 |
| `packages/contracts/src/page.ts` | `PAGE_PROMPT_VERSION` |
| `services/backend/src/modules/design-systems/compiler.ts` | 토큰·글꼴 함수를 렌더러에서 가져옴(출력 동일) |
| `services/backend/src/modules/design-systems/generation-style.ts` · `index.ts` (+ 테스트) | `findPortfolioDesign`, 38종 `designQa` 테스트 |
| `services/backend/src/modules/page/generator.ts` · `service.ts` · `structured-generator.ts` (+ 테스트) | 문맥의 `design`, 렌더 호출, 프롬프트에서 수집 원본 제거, `NameIntro.variant` 지시, QA 반영 |
| `scripts/library/renderer/run-structured-profiles.ts` · `verify-structured-profiles.mjs` | 디자인 지정, 키트 재렌더, 검사 두 가지 |
| `docs/library/previews/portfolio/runs/token-kit-2026-10-16/` | 실행 기록·화면·검증 |
| `docs/architecture/portfolio-structured-pipeline.md` | 키트 경로 설명 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. `design-tokens.ts`로 컴파일러 함수를 옮기고 컴파일러가 가져다 쓴다 — 38종 `DESIGN.html` 해시가 옮기기 전과 같으면 끝.
2. 대비 보정과 `designQa` — 38종 통과 테스트가 돌면 끝.
3. 키트 CSS·컴포넌트와 경로 분기 — 렌더러 테스트와 기존 수집 원본 테스트가 함께 통과하면 끝.
4. 계약(`NameIntro.variant`)과 생성기·서비스 연결 — 백엔드 단위·통합 테스트가 통과하면 끝.
5. 검증 스크립트로 가상 프로필 3종 × 디자인 3종을 재렌더(모델 호출 없음)하고 브라우저 검사·화면을 남긴다 — 사용자에게 화면을 보내고 확인을 받으면 끝. 고칠 점이 나오면 3단계로 돌아간다.
6. 체험 서버에서 실제 생성 1회로 끝까지 확인한다.

## 가장 위험한 단계

3단계와 5단계입니다. 키트의 디자인 수준이 이번 작업의 결과를 정합니다. 5단계에서 화면을 사용자에게 먼저 보여 주고, 확인을 받기 전에는 6단계(실제 생성)로 넘어가지 않습니다. 키트가 기대에 못 미쳐도 경로 분기로 기존 렌더러가 남아 있어 되돌리기 쉽습니다(분기 조건만 바꾸면 됩니다).

## 검증

```
pnpm typecheck
pnpm test
pnpm test:infra integration.test.ts --maxWorkers=2
pnpm --filter @expresso/web build
```

화면: `docs/library/previews/portfolio/runs/token-kit-2026-10-16/` 비교 페이지, 체험 서버 생성 결과(편집기 미리보기).
