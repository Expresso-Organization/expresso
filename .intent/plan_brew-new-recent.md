---
title: 새 포트폴리오 첫 화면 최신 공고 기본 표시
slug: brew-new-recent
stage: plan
status: draft
intent: .intent/intent_brew-new-recent.md
spec: .intent/spec_brew-new-recent.md
date: 2026-11-09
---

# 새 포트폴리오 첫 화면 최신 공고 기본 표시 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/app/(app)/brew/new/page.tsx` | 최신 공고 요청 · 묶음 배열 · `postingRow` |
| `services/web/src/app/(app)/brew/new/page.module.css` | `.main` |

## 작업 순서

1. `page.tsx` · CSS — 타입 검사
2. 브라우저 확인(dev01, 관심 없음)
3. 테스트 · 커밋 · PR · 머지

## 가장 위험한 단계

없음에 가깝다. 화면만 바뀌고 되돌리기는 커밋 되돌림이다.

## 검증

```
pnpm --filter @expresso/web typecheck
pnpm --filter @expresso/web test
```
