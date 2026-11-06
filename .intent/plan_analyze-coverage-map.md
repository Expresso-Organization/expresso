---
title: 공고 분석 화면 충족 지도와 원문 근거 표시
slug: analyze-coverage-map
stage: plan
status: draft
intent: .intent/intent_analyze-coverage-map.md
spec: .intent/spec_analyze-coverage-map.md
date: 2026-11-07
---

# 공고 분석 화면 충족 지도와 원문 근거 표시 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/contracts/src/job-analysis.ts` | `sourceText` 추가 |
| `services/backend/src/modules/job-analysis/coverage.ts` | 키워드 판정 |
| `services/backend/src/modules/job-analysis/service.ts` | 키워드 전달, `sourceText` 채우기 |
| `services/backend/src/modules/job-analysis/job-analysis.test.ts` | 키워드 판정 시험 |
| `services/web/src/app/(app)/brew/[brewId]/analyze/source-marks.ts` | 새 파일: 원문 조각 나누기 |
| `services/web/src/app/(app)/brew/[brewId]/analyze/source-marks.test.ts` | 새 파일: 겹침 · 코드 포인트 시험 |
| `services/web/src/app/(app)/brew/[brewId]/analyze/CoverageMap.tsx` | 새 파일: 막대 · 요건 · 원문 |
| `services/web/src/app/(app)/brew/[brewId]/analyze/page.tsx` | 화면 재구성 |
| `services/web/src/app/(app)/brew/[brewId]/analyze/page.module.css` | 스타일 교체 |
| `services/web/src/app/(app)/brew/[brewId]/analyze/Reanalyze.tsx` | 안내 축소 |
| `services/web/src/app/(app)/brew/[brewId]/analyze/loading.tsx` | 새 배치에 맞춘 뼈대 |

## 작업 순서

1. 계약과 충족 계산을 고친다 — `job-analysis.test.ts` 통과.
2. 원문 조각 함수를 만든다 — `source-marks.test.ts` 통과.
3. 화면을 재구성한다 — 타입 검사 통과.
4. 로컬 서버에서 실제 분석으로 화면과 상호작용을 확인한다.
5. 전체 검증 후 PR을 올린다.

## 가장 위험한 단계

1단계. 인터뷰 질문 근거 수가 달라진다. 실제 흐름에서 인터뷰까지 지나가는지 4단계에서 확인한다. 문제가 생기면 `keywords` 인자만 넘기지 않으면 예전 판정으로 돌아간다.

## 검증

```
pnpm typecheck
pnpm test
pnpm test:infra
```

로컬 `/brew/<id>/analyze`를 1440px · 390px로 열어 막대, 요건 행 호버 · 클릭, 원문 강조를 확인한다.
