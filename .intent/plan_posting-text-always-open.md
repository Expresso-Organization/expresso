---
title: 공고 원문 상시 펼침
slug: posting-text-always-open
stage: plan
status: draft
intent: .intent/intent_posting-text-always-open.md
spec: .intent/spec_posting-text-always-open.md
date: 2026-10-28
---

# 공고 원문 상시 펼침 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/app/(app)/jobs/[jobId]/page.tsx` | `hasStructure` 삭제, `<details>`를 `<div>`로, 보충 문구 삭제, 주석 고침 |
| `services/web/src/app/(app)/jobs/[jobId]/page.module.css` | `.rawSummary` → `.rawTitle`, 접기 관련 규칙과 `.rawNote` 삭제 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. `page.tsx`에서 `hasStructure`와 그 주석을 지우고 원문 블록을 `<div>`로 바꾼다 — `pnpm --filter @expresso/web typecheck`가 통과한다.
2. CSS에서 접기 규칙과 `.rawNote`를 지우고 `.rawSummary`를 `.rawTitle`로 고친다 —
   `grep -rn "rawSummary\|rawNote\|hasStructure" services/web/src`가 비어 있다.
3. 루트에서 `pnpm typecheck` · `pnpm test`를 돌린다.
4. 개발 서버(`compare.localhost:3100`)에서 요건이 뽑힌 공고 상세를 열어 아래를 본다.

## 검증 절차

1. 요건 분석을 마친 공고 `a7753d49-…`를 연다. 원문 본문이 스크롤 아래에 펼쳐져 있다.
2. `document.querySelector("details")`가 `null`이다.
3. "공고 원문" 제목의 `getComputedStyle(...).cursor`가 `auto`다. 제목 옆에 다른 글자가 없다.
4. 화면을 스크린숏으로 남긴다.

## 가장 위험한 단계

없다고 본다. `hasStructure`는 `page.tsx:85`에서 선언되고 원문 블록에서만 읽힌다(`grep` 확인).
지우는 규칙은 모두 `.rawSection` · `.rawSummary`에만 걸려 있다.
