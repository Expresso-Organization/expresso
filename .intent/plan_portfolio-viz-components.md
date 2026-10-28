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
| `services/backend/src/modules/page/design-first.ts` | 설계 · 채우기 지침 줄, 기간 숫자 검사, 내림 규칙, 설계 트리 연결 검사(6단계에서 추가) |
| `services/backend/src/modules/page/design-first.test.ts` | 기간 검사 · 내림 규칙 |
| `services/web/src/app/(app)/edit/[portfolioId]/StructuredPageProperties.tsx` | `CaseBars` 이름표 한 줄, `comparableMetrics`일 때만 고를 수 있게 거르는 줄 |

## 작업 순서

1. 계약: 사례 유형 · form · 목차 · 경력 선택지와 검사를 더합니다 — contracts 테스트 통과.
2. `viz/period.ts` · `viz/bars.tsx`: 읽기 · 비율 함수와 단위 테스트 — 렌더러 테스트 통과.
3. 부품 · CSS · 등록: `bars.tsx` 부품, `period-chart.tsx`, `styles.ts`, `catalog.ts` · `kit.tsx` · `renderer.tsx` 등록 — 고정 `now`로 그린 HTML 테스트 통과.
4. 생성 경로: `design-first.ts` 지침 줄 · 기간 검사 · 내림 규칙 — backend 테스트 통과.
5. 편집 화면 이름표, `pnpm typecheck` · `pnpm test` · `pnpm test:infra`.
6. 체험 서버 실제 생성: dev01로 새 지면을 만들고 1440 · 390 스크린샷과 `renderDefects`를 확인합니다. 모델이 새 부품을 고르지 않으면 디자인과 유형을 바꿔 다시 생성합니다. 그래도 고르지 않으면 설계 프롬프트의 지침 줄을 고칩니다.
   - 2026-10-28 실행: 설계 모델이 목차 · 컨테이너를 정의만 하고 트리에 연결하지 않아 두 번 연속 `page.generation_failed`가 났습니다. 설계 호출의 `check`가 섹션 목록만 보고 트리 연결은 보지 않았기 때문입니다. `treeViolations`로 연결하지 않은 요소를 같은 대화에서 `page.children`만 고쳐 받고(처음에 elements 전체를 고쳐 받게 했다가 긴 값의 JSON 문법이 깨져 생성이 실패해 좁혔습니다), 고쳐도 남으면 `fitToContent`가 선택 요소는 지우고 나머지는 페이지에 붙입니다.
   - 같은 실행에서 다듬기 판이 단위가 다른 수치("1.9초" · "180KB") 섹션에 `CaseBars`를 골랐습니다. 다듬기 경로는 `fitToContent`를 지나지 않습니다. 그래서 같은 단위 판정을 계약(`comparableMetrics`)으로 옮겨 모델 스키마 · 저장 검사 · 편집 화면이 함께 씁니다. 채우기 지침에는 프로젝트 섹션의 기간 칸을 적었습니다.
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
