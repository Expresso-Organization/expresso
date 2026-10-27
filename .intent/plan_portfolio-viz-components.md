---
title: 포트폴리오 차트 부품 세 종 추가
slug: portfolio-viz-components
stage: plan
status: accepted
intent: .intent/intent_portfolio-viz-components.md
spec: .intent/spec_portfolio-viz-components.md
date: 2026-10-28
---

# 포트폴리오 차트 부품 세 종 추가 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/portfolio-renderer/src/viz/period.ts` (새) | 기간 글자 읽기 `parsePeriod` · `readablePeriods` |
| `packages/portfolio-renderer/src/viz/bars.tsx` (새) | `barScale`과 가로 막대 차트 부품 |
| `packages/portfolio-renderer/src/viz/period-chart.tsx` (새) | 작업 · 경력이 함께 쓰는 기간 차트 부품 |
| `packages/portfolio-renderer/src/viz/styles.ts` (새) | `VIZ_CSS` |
| `packages/portfolio-renderer/src/viz/viz.test.tsx` (새) | 기간 읽기 · 막대 비율 · 내림 그리기 · 숫자 없는 축 |
| `packages/contracts/src/structured-portfolio.ts` | `CaseBars` · form `bars` · 목차 `timeline` · 경력 `variant` · 검사 |
| `packages/contracts/src/structured-portfolio.test.ts` | 위 계약 검사 |
| `packages/portfolio-renderer/src/catalog.ts` | `CaseBars` 항목, 목차 · 경력 설명과 속성 |
| `packages/portfolio-renderer/src/kit.tsx` | 등록 줄, `KitContext.now`, `kitCss`에 `VIZ_CSS` |
| `packages/portfolio-renderer/src/renderer.tsx` | `now` 옵션, 수집 원본 쪽 `CaseBars` → 기사형 |
| `packages/portfolio-renderer/src/index.ts` | `readablePeriods` · `barScale` 내보내기 |
| `services/backend/src/modules/page/design-first.ts` | 설계 · 채우기 지침 줄, 기간 숫자 검사, 내림 규칙 |
| `services/backend/src/modules/page/design-first.test.ts` | 기간 검사 · 내림 규칙 |
| `services/web/src/app/(app)/edit/[portfolioId]/StructuredPageProperties.tsx` | `CaseBars` 이름표 한 줄 |

## 작업 순서

1. 계약: 사례 유형 · form · 목차 · 경력 선택지와 검사를 더합니다 — contracts 테스트 통과.
2. `viz/period.ts` · `viz/bars.tsx`: 읽기 · 비율 함수와 단위 테스트 — 렌더러 테스트 통과.
3. 부품 · CSS · 등록: `bars.tsx` 부품, `period-chart.tsx`, `styles.ts`, `catalog.ts` · `kit.tsx` · `renderer.tsx` 등록 — 고정 `now`로 그린 HTML 테스트 통과.
4. 생성 경로: `design-first.ts` 지침 줄 · 기간 검사 · 내림 규칙 — backend 테스트 통과.
5. 편집 화면 이름표, `pnpm typecheck` · `pnpm test` · `pnpm test:infra`.
6. 체험 서버 실제 생성: dev01로 새 지면을 만들고 1440 · 390 스크린샷과 `renderDefects`를 확인합니다. 모델이 새 부품을 고르지 않으면 디자인과 유형을 바꿔 다시 생성합니다. 그래도 고르지 않으면 설계 프롬프트의 지침 줄을 고칩니다.
7. origin/main 재병합 후 PR.

## 가장 위험한 단계

6단계입니다. 모델이 새 부품을 고르지 않거나, 고른 부품이 측정(`stretchedTags` · `escaped` · 대비)에 걸릴 수 있습니다. 측정에 걸리면 `viz/styles.ts`만 고칩니다. 지침을 고칠 때는 설계 프롬프트의 새 줄만 바꿉니다. 기존 줄은 그대로 두어 다른 부품의 선택 비율이 바뀌지 않게 합니다. 되돌릴 때는 해당 커밋을 되돌립니다. 저장 데이터 변경이 없어 되돌려도 옛 지면이 깨지지 않습니다.

## 검증

```bash
pnpm typecheck
pnpm test
pnpm test:infra
```

체험 서버는 웹 3202 · API 4202 · `viz.localhost` · 워커 `QUEUE_PREFIX=expresso-viz` · `AI_PROVIDER`는 Claude Code입니다. 확인 경로는 이렇습니다. dev01 로그인 → 포트폴리오 새로 만들기 → 생성 완료 → 공개 지면 `site/[slug]`. 스크린샷 두 장(1440 · 390)을 남기고, 생성 기록의 Spec에서 `CaseBars` · `timeline` · `chart` 중 무엇이 쓰였는지 적습니다.
