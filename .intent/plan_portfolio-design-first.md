---
title: 디자인 먼저 생성과 단계별 화면 전달
slug: portfolio-design-first
stage: plan
status: accepted
intent: .intent/intent_portfolio-design-first.md
spec: .intent/spec_portfolio-design-first.md
date: 2026-10-26
---

# 디자인 먼저 생성과 단계별 화면 전달 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/contracts/src/structured-portfolio.ts` · `page.ts` · `page-stream.ts` | `metrics` · `steps`, 설계 출력 · 칸 예산, 호출별 기록, 스트림 사건 |
| `packages/portfolio-renderer/src/kit.tsx` · `kit-styles.ts` · `catalog.ts` · `renderer.tsx` | 시각 부품 5종, 청사진 CSS, 키트 스크립트 |
| `packages/portfolio-renderer/src/blueprint.ts`(새) | 표지 → 글 자리 치환, 청사진 CSS |
| `services/backend/src/platform/ai/claude-code.ts` · `client.ts` | 구조화 출력 재시작 알림, 돌려보낸 구조화 출력 기록 |
| `services/backend/src/worker/main.ts` | 다듬기(`page.refine`)를 별도 큐 · 워커로 분리 — 생성이 직전 판의 다듬기 뒤에 서지 않게 |
| `services/backend/src/modules/page/structured-generator.ts` · `design-first.ts`(새) | 설계 · 병렬 채움 · 단계 스트림 |
| `services/backend/src/modules/page/stream.ts` · `service.ts` · `routes.ts` | 사건 전달, 문서 헤더 |
| `services/backend/src/platform/ai/client.ts` | `page_design` · `page_fill` 계약 |
| `services/web/src/app/(app)/brew/[brewId]/design/LivePreview.tsx` · `site/[slug]/page.tsx` · `PagePreview.tsx` | 청사진 → 채움 → 디자인, iframe sandbox |
| `scripts/library/renderer/*` | 가상 프로필 새 구조 실행 · 비교 |
| `docs/architecture/portfolio-structured-pipeline-gaps.md` · `portfolio-visual-component-sources.md` | 진행 · 판정 |

## 작업 순서

1. 호출별 기록, 내용 계약 확장, `MetricStrip` · `CaseBeforeAfter`, 설계 · 병렬 채움 — 가상 프로필 3종 × 디자인 3종 새 구조 · 지금 구조 비교 이미지를 **사용자에게 보내 방향 확인**.
2. 청사진 렌더 · 스트림 사건 · `LivePreview` 단계 전환, 설계 · 채움 기본 모델과 생각량 — 체험 서버 실제 생성을 headless Chromium으로 녹화해 단계 순서 · 깜빡임 확인.
3. `CaseFlow` · `CaseShowcase` · `PullQuote`, ECharts SSR 판정.
4. 키트 스크립트 · CSP · sandbox — 보안 브라우저 테스트.
5. 다듬기 스키마에 새 부품.
6. 전체 검증 · 체험 서버 실제 생성 · 녹화 · 문서 · 커밋 · 푸시 · PR(base `feat/portfolio-render-qa`).

## 가장 위험한 단계

1. 설계가 고른 시각 형태와 채운 내용이 어긋나면(수치 칸인데 원문에 수치가 없음) 계약 검사에 걸린다. 채움이 수치를 못 찾으면 그 섹션을 글 부품으로 내리는 규칙을 둔다.

## 검증

```
pnpm typecheck
REQUIRE_BROWSER=1 pnpm test
pnpm test:infra
node scripts/library/renderer/verify-token-kit.mjs <새 구조 실행 ID>
```
