---
title: 생성 중 브라우저 측정과 구성 재요청
slug: portfolio-render-measure
stage: plan
status: accepted
intent: .intent/intent_portfolio-render-measure.md
spec: .intent/spec_portfolio-render-measure.md
date: 2026-10-25
---

# 생성 중 브라우저 측정과 구성 재요청 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/portfolio-renderer/src/measure.ts` · `.test.ts` · `index.ts` | 측정 함수 · 판정 · 문장 |
| `packages/contracts/src/page.ts` | 검사 이름 두 개, manifest `renderMeasure` |
| `services/backend/src/platform/browser/page-measurer.ts` · `.test.ts` | Chromium 측정기 |
| `services/backend/src/modules/page/structured-generator.ts` · `.test.ts` | 측정 · 재요청 루프 |
| `services/backend/src/worker/main.ts` | 측정기 주입 · 종료 |
| `services/backend/package.json` · `pnpm-lock.yaml` | `playwright` |
| `scripts/library/renderer/verify-token-kit.mjs` | 렌더러 측정 함수 사용 |
| `scripts/operations/deploy.sh` · `.github/workflows/backend-ci.yml` · `docs/operations/DEPLOYMENT.md` | 브라우저 설치 |
| `docs/architecture/portfolio-structured-pipeline-gaps.md` | 진행 기록 · 실측 |

## 작업 순서

1. 렌더러 측정 모듈과 테스트 — 렌더러 테스트.
2. 계약 필드 — contracts 테스트.
3. 백엔드 측정기와 실제 Chromium 테스트.
4. 생성기 루프와 가짜 측정기 테스트, 워커 주입.
5. 스크립트 전환 — 기존 실행 하나 재검사.
6. 배포 · CI · 문서, 전체 검증, 체험 서버 실제 생성, 커밋 · PR(base `feat/portfolio-archetypes`).

## 가장 위험한 단계

3. 측정 함수가 dist에서 페이지로 직렬화될 때 외부 참조가 섞이면 페이지 안에서 깨진다. 실제 Chromium 테스트로 바로 잡는다.

## 검증

```
pnpm typecheck
pnpm test
pnpm test:infra
node scripts/library/renderer/verify-token-kit.mjs archetype-poster-2026-10-24
```

체험 서버(4007 · 3107 · 워커)에서 dev01로 생성 1회, `generated_pages`의 `qaReport` · `manifest.renderMeasure` 확인.
