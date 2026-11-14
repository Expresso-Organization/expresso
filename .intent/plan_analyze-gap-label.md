---
title: 공고 분석 요건 행의 AI 대화 표시
slug: analyze-gap-label
stage: plan
date: 2026-11-14
---

# 공고 분석 요건 행의 AI 대화 표시 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/app/(app)/brew/[brewId]/analyze/CoverageMap.tsx` | 표시 글자 |
| `services/web/src/app/(app)/brew/[brewId]/analyze/page.module.css` | `.gapSlot` · 행 그리드 |

## 작업 순서

1. 표시 글자와 스타일
2. 웹 타입 검사 · 테스트, 브라우저에서 공고 분석 화면 확인

## 가장 위험한 단계

긴 요건 이름의 줄바꿈. 이름 열은 `minmax(0, 1fr)`이라 표시가 늘어난 만큼 이름이 줄바꿈된다.

## 검증

```
pnpm --filter @expresso/web typecheck
pnpm --filter @expresso/web test
```
