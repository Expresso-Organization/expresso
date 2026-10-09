---
title: 생성 포트폴리오의 원본 렌더링 결함 수정
slug: portfolio-render-quality
stage: plan
status: accepted
intent: .intent/intent_portfolio-render-quality.md
spec: .intent/spec_portfolio-render-quality.md
date: 2026-10-09
---

# 생성 포트폴리오의 원본 렌더링 결함 수정 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `scripts/library/renderer/build-collected-registry.mjs` | Feature 변환을 `bindFeatureFields`로 분리, `runtime.boundDetails` 기록 |
| `packages/portfolio-renderer/src/collected/inventory.json` · `summary.json` | 빌드 재생성 결과(`boundDetails`, 해시) |
| `packages/portfolio-renderer/src/library.ts` | `collectedBoundDetails`, 블러 판 CSS |
| `packages/portfolio-renderer/src/source-jsx.tsx` | 빈 샘플 요소 판정, 소개 이름 판 래퍼 |
| `packages/portfolio-renderer/src/renderer.tsx` | `Details` 공유, 원본 경로 유형 클래스, 근거 제목 context |
| `packages/portfolio-renderer/src/library.test.ts` | R1·R2·R4·R5·R7 테스트 |
| `scripts/library/renderer/check-collected-runtime.mjs` | 사례 원본 잔여 요소·`dd` 검사 |
| `scripts/library/renderer/verify-structured-profiles.mjs` | R1·R2·R4·R5 측정, 사례 이미지 높이 |
| `scripts/library/renderer/run-structured-profiles.ts` | `PORTFOLIO_RERENDER_FROM` 재렌더링 모드 |
| `docs/library/previews/portfolio/runs/library-selection-rerender-2026-10-09/` | 재렌더링 결과·검증 기록·비교 페이지 |
| `docs/architecture/portfolio-library-selection.md` | 샘플 제거 규칙·히어로 이름 판·재렌더링 절차 |

## 작업 순서

1. 빌드 스크립트 분리 후 재빌드 — `components.mjs`·`styles.mjs`는 그대로이고 `inventory.json`에 `boundDetails`(feature-1=5, feature-4=3)만 추가됐는지 `git diff`로 확인.
2. `library.ts`·`renderer.tsx` — `Details` 공유, 유형 클래스, 근거 제목, `boundDetails` 사용. 감사 스크립트로 `dd` 0개, 링크 제목 확인.
3. `source-jsx.tsx` — 빈 샘플 요소 판정과 이름 판. 감사 스크립트로 사례 원본 잔여 요소 0, 히어로 32개의 잔여 요소 수가 변경 전 대비 줄기만 하는지 확인하고 히어로 화면을 대조.
4. 테스트 추가 — `pnpm --filter @expresso/portfolio-renderer test`.
5. 검증 스크립트 보강 — 변경 전 렌더링에서 실패하고 변경 후 통과하는지 확인.
6. 재렌더링 모드 추가와 실행 — 세 프로필 결과와 `verify-structured-profiles.mjs` 통과.
7. 문서 갱신, 전체 `pnpm typecheck` · `pnpm test`, 커밋·푸시·PR.

## 가장 위험한 단계

3단계. 판정이 너무 넓으면 히어로의 버튼·내비게이션·카드 원본의 설명이 사라진다. 원본 38개를 변경 전·후로 렌더링해 텍스트 길이와 화면을 비교하고, 입력 값이 빠지는 원본이 있으면 판정 조건을 좁힌다. 되돌리기는 `source-jsx.tsx` 한 파일 커밋을 되돌리면 된다.

## 검증

```bash
node scripts/library/renderer/build-collected-registry.mjs && git diff --stat packages/portfolio-renderer/src/collected
pnpm --filter @expresso/portfolio-renderer build && pnpm --filter @expresso/portfolio-renderer test
node scripts/library/renderer/check-collected-runtime.mjs --browser
PORTFOLIO_RERENDER_FROM=library-selection-2026-10-07 PORTFOLIO_RUN_ID=library-selection-rerender-2026-10-09 pnpm exec tsx scripts/library/renderer/run-structured-profiles.ts
python3 -m http.server 8942 -d docs   # 별도 프로세스
node scripts/library/renderer/verify-structured-profiles.mjs library-selection-rerender-2026-10-09
pnpm typecheck && pnpm test
```

화면: 재렌더링한 세 프로필의 첫 화면(이름 판), 사례 지면(항목표·관련 자료 제목)을 1440px·390px에서 확인한다.
