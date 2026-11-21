---
title: 첫 화면 그래픽은 기록에서 canvas로, 효과는 카탈로그에서 사용자가
slug: graphic-catalog
stage: spec
date: 2026-11-21
---

# 요구사항과 설계

## 계약
- `DesignGraphicSchema`: `"canvas"` 또는 효과 이름(`PAGE_EFFECT_CATALOG`). 앞판의 `"2d"` · `"3d"`는 `"canvas"`로 읽는다(검증 DB에 남은 장). 요청에서 빠지면 `"canvas"`.
- `AgentDesignDrawSchema.graphic`도 같은 스키마.
- `PAGE_SCRIPT_PROMPT`에서 효과 라이브러리 목록을 뺀다 — 직접 그리는 그림은 canvas 2D. `pageEffectPrompt(name)`가 효과 하나의 쓰는 법(부르는 법 · palette · values · 자리)을 낸다.

## 백엔드
- `graphicPrompt(graphic)`: 효과면 「사용자가 고른 그래픽 — {title}」과 `pageEffectPrompt`. canvas · 없음이면 싣지 않는다(기본 지침이 canvas다).
- `designRules("화면")`: 그래픽은 canvas 2D로 직접 짓는다. 형태는 기록(근거) · 지원하는 공고와 직무(설계안) · 담을 내용(섹션)에서, 계열은 스타일 · 그림 자리에서. 효과는 사용자가 골랐을 때만.
- `DESIGN_CHAT_PROMPT_VERSION` 13 · `PAGE_PROMPT_VERSION` 23.

## 웹
- `DesignChat`: 「그래픽」 줄(`proposalRow` · `specimen` 재사용). 카드: 기록에서 그림 + 효과마다 축소 화면(`/design-chat/effects/{name}.webp`). `picked.graphic` 기본 `"canvas"`. 짝 줄의 칩을 걷고 고른 그래픽 이름만 보인다.
