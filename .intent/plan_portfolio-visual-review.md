---
title: 초안 먼저 전달과 스크린샷으로 지면 다듬기
slug: portfolio-visual-review
stage: plan
status: accepted
intent: .intent/intent_portfolio-visual-review.md
spec: .intent/spec_portfolio-visual-review.md
date: 2026-10-25
---

# 초안 먼저 전달과 스크린샷으로 지면 다듬기 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/contracts/src/page.ts` | `refinement` · `visualReview` |
| `packages/database/src/documents/*` | 지면 문서 `refinement` 필드 |
| `services/backend/src/platform/ai/client.ts` · `claude-code.ts` · `codex.ts` · 테스트 | 이미지 입력, `page_review` 계약 |
| `services/backend/src/platform/browser/page-measurer.ts` · 테스트 | 스크린샷 |
| `services/backend/src/modules/page/structured-generator.ts` · 테스트 | 초안 / `refine` 분리 |
| `services/backend/src/modules/page/service.ts` · `index.ts` | 다듬기 예약 · 저장 |
| `services/backend/src/worker/main.ts` · `processors/page-refine.ts` | `page.refine` 처리 |
| `services/web/src/app/(app)/edit/[portfolioId]/Editor.tsx` · `page.module.css` | 다듬는 중 표시 · 새로 읽기 |
| `docs/architecture/portfolio-structured-pipeline-gaps.md` | 진행 · 실측 |

## 작업 순서

1. 계약 · 문서 타입.
2. AI 이미지 입력 — Claude Code 실호출 1회로 확인.
3. 측정기 스크린샷 — 실제 Chromium 테스트.
4. 생성기 분리와 `refine`, 가짜 AI · 측정기 테스트.
5. 서비스 · 워커, 통합 테스트.
6. 웹 표시.
7. 전체 검증, 체험 서버 실제 생성, 비교 이미지, 문서, 커밋 · PR #104 갱신.

## 가장 위험한 단계

4. 생성기 루프를 옮기면서 기존 2단계 테스트의 기대(생성 안에서 재요청)가 바뀐다. 테스트를 `refine` 쪽으로 옮겨 같은 규칙을 계속 확인한다.

## 검증

```
pnpm typecheck
REQUIRE_BROWSER=1 pnpm test
pnpm test:infra
```

체험 서버에서 생성 → 편집 화면 다듬는 중 표시 → 새 판 확인.
