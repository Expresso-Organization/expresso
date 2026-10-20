---
title: 고른 디자인의 배치를 아는 Spec 생성
slug: portfolio-design-layout
stage: plan
status: accepted
intent: .intent/intent_portfolio-design-layout.md
spec: .intent/spec_portfolio-design-layout.md
date: 2026-10-20
---

# 고른 디자인의 배치를 아는 Spec 생성 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/portfolio-renderer/src/design-layout.ts` (새) · `design-layout.test.ts` (새) | 배치 계산·문단, 넓은 여백 상수 |
| `packages/portfolio-renderer/src/kit-styles.ts` | 넓은 여백 규칙을 상수로 생성 |
| `packages/portfolio-renderer/src/catalog.ts` · `index.ts` | PortfolioPage 설명, 내보내기. `renderer.tsx`는 `palette`·`font`가 없으면 속성을 쓰지 않아 고칠 것이 없음 |
| `packages/contracts/src/structured-portfolio.ts` (+ 테스트) | 모델 스키마 `groups` 선택지·`design` 제거, 저장 계약 `palette`·`font` 선택 |
| `packages/contracts/src/page.ts` | `PAGE_PROMPT_VERSION` 12 |
| `services/backend/src/modules/page/structured-generator.ts` (+ 테스트, `structured-spec-format.test.ts`) | 배치 문단, 컨테이너 조건부, `design.layout` 주입, 스타일 보존 검사 제거 |
| `services/backend/src/modules/design-systems/design-layout.test.ts` (새) | 38종 문단 수치 = `designLayout` 결과 |
| `scripts/library/renderer/run-structured-profiles.ts` · `verify-token-kit.mjs` | 모델 생성 경로 `PORTFOLIO_DESIGN`, 디자인별 폴더, 검증이 모델 실행도 받음 |
| `packages/portfolio-renderer/src/kit.tsx` · `kit-styles.ts` · `kit.test.ts` | 과정형 사례(CaseProcess)에 사례 이미지 표시, 사례 본문 묶음(넓은 여백에서 제목 칸 높이가 본문 행을 늘리던 결함). 4·5단계에서 발견한 토큰 키트 결함 |
| `docs/library/previews/portfolio/runs/design-layout-2026-10-20/` | 3종 × 3 생성 기록·화면 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. `design-layout.ts`와 키트 CSS 상수화 — 기존 가상 프로필 재렌더 HTML이 바이트 단위로 같으면 끝.
2. 계약: 모델 스키마 `groups`·`design` 제거, 저장 계약 선택 값 — 계약 테스트(옛 저장본 통과, 넓은 여백 스키마에 컨테이너 없음) 통과하면 끝.
3. 생성기·카탈로그 설명·프롬프트 문단 — 백엔드 단위·통합 테스트, 38종 문단 테스트 통과하면 끝.
4. 스크립트 확장 후 가상 프로필 3종 × 디자인 3종 모델 생성(Spec 호출만, 약 9회) → `verify-token-kit.mjs` 통과, Monochrome 3종 컨테이너 없음 확인 → 화면을 사용자에게 보냄.
5. 체험 서버 실제 생성 1회, 전체 검증, 커밋·푸시·PR(#98 위).

## 가장 위험한 단계

4단계입니다. 모델이 새 문단을 읽고 구성을 바꾸는지는 실제 호출로만 알 수 있고, 9회 호출에 시간(회당 2~4분)과 비용이 듭니다. 결과가 나빠도 되돌림은 프롬프트 문단만 빼면 됩니다. 넓은 여백의 컨테이너 금지는 스키마로 강제되므로 모델과 무관하게 보장됩니다.

## 검증

```
pnpm typecheck
pnpm test
pnpm test:infra integration.test.ts --maxWorkers=2
pnpm --filter @expresso/web build
node scripts/library/renderer/verify-token-kit.mjs design-layout-2026-10-20
```
