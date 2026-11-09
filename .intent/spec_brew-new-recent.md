---
title: 새 포트폴리오 첫 화면 최신 공고 기본 표시
slug: brew-new-recent
stage: spec
status: draft
intent: .intent/intent_brew-new-recent.md
date: 2026-11-09
---

# 새 포트폴리오 첫 화면 최신 공고 기본 표시 — 명세

## 요구사항

- [ ] `ModeHome`이 건수만 읽던 `jobs.postings({ limit: 1 })`을 `jobs.postings({ sort: "recent", limit: 6 })`로 바꿔 줄과 전체 건수를 함께 쓴다.
- [ ] 공고 칸은 `JobsPanel` 묶음 배열이다 — `pickJobsPanel`(관심 · 추천) 결과가 있으면 먼저, 최신 공고가 있으면 다음.
- [ ] 위 묶음에 선 공고 id는 최신 공고에서 뺀다.
- [ ] 관심 공고와 최신 공고 줄은 같은 변환 `postingRow`를 쓴다(마감 표시 · 이어서 만들기).

## 설계

재사용: `JobsPanel`, `deadlineMeta`, `resumeStep`, `analyzePostingAction`. 새 CSS는 묶음을 세로로 쌓는 `.main` 하나.

## 버린 대안

- 관심 · 추천이 없을 때만 최신 공고: 요청이 "기본으로"다.

## 함정

- 최신 공고 요청이 전체 건수(`summary.total`)도 맡으므로 검색 칸 건수가 같은 값을 쓴다.

## 완료 기준

- `pnpm --filter @expresso/web typecheck` · `test` 통과, 브라우저에서 관심 없음 상태 확인.
