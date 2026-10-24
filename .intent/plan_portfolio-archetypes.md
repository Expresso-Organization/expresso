---
title: 포트폴리오 유형 선택과 포스터형 · 글 · 목록형
slug: portfolio-archetypes
stage: plan
status: accepted
intent: .intent/intent_portfolio-archetypes.md
spec: .intent/spec_portfolio-archetypes.md
date: 2026-10-22
---

# 포트폴리오 유형 선택과 포스터형 · 글 · 목록형 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/contracts/src/portfolio-archetype.ts` (새) · `index.ts` · `generation.ts` | 유형 상수 · 스키마, 생성 요청 `archetype` |
| `packages/contracts/src/structured-portfolio.ts` (+ 테스트) | 루트 `archetype` prop, `CaseRow`, `poster` · `sentence` 변형, `period`, 유형별 모델 스키마 |
| `packages/contracts/src/page.ts` | `PAGE_PROMPT_VERSION` 13 |
| `packages/database/src/documents/generation.ts` | 작업 · 포트폴리오 문서 `archetype`(브루 문서는 디자인 선택만 담아 고치지 않음) |
| `packages/portfolio-renderer/src/archetype.ts` (새) · `catalog.ts` · `kit.tsx` · `kit-styles.ts` · `index.ts` (+ 테스트) | 유형 문단, 새 컴포넌트 · 변형, 유형 CSS |
| `services/backend/src/modules/generation/service.ts` (+ 테스트) | `archetype`을 작업 → 포트폴리오 |
| `services/backend/src/modules/page/service.ts` · `generator.ts` · `structured-generator.ts` (+ 테스트) | 생성 문맥 `archetype`, 유형별 스키마 · 프롬프트 · 루트 prop, 내용 정리 `period` 규칙 |
| `services/web/src/app/(app)/brew/[brewId]/design/DesignCatalog.tsx` · `.module.css` · `design-actions.ts` (+ 테스트) | 유형 선택과 전송. API 클라이언트는 계약 타입(`SubmitGeneration`)을 그대로 써서 고칠 것이 없음 |
| `scripts/library/renderer/run-structured-profiles.ts` | `PORTFOLIO_ARCHETYPE`, `period` 채움, 디자인 폴더 재렌더 원본 |
| `docs/library/previews/portfolio/runs/archetype-*-2026-10-24/` | 생성 · 38종 재렌더 기록. 38종 실행은 전체 페이지 스크린샷(`*-1440.png` · `*-390.png`, 약 55MB)을 커밋하지 않고 검사 결과 · HTML · 첫 화면 스크린샷만 남김 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 계약 · DB 문서 타입 — 계약 테스트(유형별 모델 스키마, 옛 저장본 통과)가 돌면 끝.
2. 키트: 새 컴포넌트 · 변형 · 유형 CSS, `describeArchetype` — 키트 테스트와 손으로 만든 Spec 3종을 디자인 3종으로 그린 화면 확인이 끝나면 끝.
3. 백엔드: 생성 서비스 · 페이지 서비스 · 생성기 — 단위 · 통합 테스트 통과하면 끝.
4. 웹: 유형 선택 — 웹 테스트 · 빌드, 개발 서버 화면 확인.
5. 가상 프로필 모델 생성(유형 2 × 디자인 3 × 프로필 3 = 18회) → 검사 → 디자인 38종 재렌더 → 검사 → 유형 3개 비교 화면을 사용자에게 보냄.
6. 체험 서버 실제 생성 1회, 전체 검증, 커밋 · 푸시 · PR.

## 가장 위험한 단계

2단계입니다. 포스터 · 글 화면의 완성도가 이번 결과를 정하고, 행동색을 바탕으로 쓰는 포스터는 디자인마다 명도가 크게 달라 38종 모두에서 보기 좋게 나오는지는 그려 봐야 압니다. 2단계 끝에 손으로 만든 Spec으로 먼저 화면을 보고, 5단계 모델 생성 전에 사용자에게 한 번 보여 줍니다. 되돌릴 때는 유형 선택을 숨기면 사례 상세형만 남습니다.

## 검증

```
pnpm typecheck
pnpm test
pnpm test:infra integration.test.ts --maxWorkers=2
pnpm --filter @expresso/web build
node scripts/library/renderer/verify-token-kit.mjs archetype-poster-2026-10-24
node scripts/library/renderer/verify-token-kit.mjs archetype-list-2026-10-24
node scripts/library/renderer/verify-token-kit.mjs archetype-poster-matrix-2026-10-24
node scripts/library/renderer/verify-token-kit.mjs archetype-list-matrix-2026-10-24
```
