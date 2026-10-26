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
| `packages/portfolio-renderer/src/kit.tsx` · `kit-styles.ts` · `catalog.ts` · `renderer.tsx` · `design-tokens.ts` | 시각 부품 5종, 요소별 크기 · 배경 · 폭(`scale` · `surface` · `width`)과 색면 · 반전 대비 색, 청사진 CSS, 키트 스크립트 |
| `packages/portfolio-renderer/src/blueprint.ts`(새) | 경로 표지 내용 · 슬롯 치환 |
| `services/backend/src/modules/page/structured-generator.ts` · `design-first.ts`(새) | 설계 · 병렬 채움 · 단계 스트림 |
| `services/backend/src/modules/page/stream.ts` · `service.ts` · `routes.ts` | 사건 전달, 문서 헤더 |
| `services/backend/src/platform/ai/client.ts` | `page_design` · `page_fill` 계약 |
| `services/web/src/app/(app)/brew/[brewId]/design/LivePreview.tsx` · `site/[slug]/page.tsx` · `PagePreview.tsx` | 청사진 → 채움 → 디자인, iframe sandbox |
| `scripts/library/renderer/*` | 가상 프로필 새 구조 실행 · 비교 |
| `docs/architecture/portfolio-structured-pipeline-gaps.md` · `portfolio-visual-component-sources.md` | 진행 · 판정 |

## 작업 순서

1. 호출별 기록, 내용 계약 확장, `MetricStrip` · `CaseBeforeAfter`, 설계 · 병렬 채움 — 가상 프로필 3종 × 디자인 3종 새 구조 · 지금 구조 비교 이미지를 **사용자에게 보내 방향 확인**.
2. 청사진 렌더 · 스트림 사건 · `LivePreview` 단계 전환 — 브라우저에서 단계 순서 · 깜빡임 확인.
3. `CaseFlow` · `CaseShowcase` · `PullQuote`, 요소별 크기 · 배경 · 폭(설계안 → Spec props), 수치 값 모양 제한, ECharts SSR 판정 — 고정 자료 렌더와 실제 생성의 1440 · 390 비교 이미지로 섹션마다 리듬이 달라지는지 확인.
4. 키트 스크립트 · CSP · sandbox — 보안 브라우저 테스트.
5. 다듬기 스키마에 새 부품 — 검토 스키마는 `structuredModelSchema`라 새 부품 · 지면 변화 props가 함께 들어가고, `REVIEW_GUIDE` · Spec 프롬프트가 바꿀 수 있는 것으로 적는다.
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
