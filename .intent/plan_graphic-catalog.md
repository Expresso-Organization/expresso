---
title: 첫 화면 그래픽은 기록에서 canvas로, 효과는 카탈로그에서 사용자가
slug: graphic-catalog
stage: plan
date: 2026-11-21
---

# 구현 계획

1. 계약 — `design-chat.ts` 스키마 · `agent-chat.ts` · `page.ts` 지침 분리(`pageEffectPrompt`). 테스트: 옛 값 읽기, 지침에 목록 없음.
2. 백엔드 — `prompts.ts`의 `graphicPrompt` · `design-rules.ts` · 판 올리기 · `brew-start.ts` 타입. 테스트: 효과 고르면 그 효과만, 없으면 효과 없음.
3. 웹 — 그래픽 줄 · 축소 화면 네 장 · 칩 제거 · 에이전트 카드 타입.
4. 검사 — typecheck · test, 실제 그리기(기본 둘 · 효과 하나), 보드 갱신, 커밋 · 푸시.
