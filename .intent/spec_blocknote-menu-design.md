---
title: 커리어 문서 본문 편집 메뉴 디자인 정합
slug: blocknote-menu-design
stage: spec
status: accepted
intent: .intent/intent_blocknote-menu-design.md
date: 2026-11-21
---

# 커리어 문서 본문 편집 메뉴 디자인 정합 — 명세

## 요구사항

- [ ] `.bn-ak-menu` · `.bn-ak-popover` · `.bn-ak-toolbar`의 배경 · 테두리 · 모서리 · 그림자가 `views.module.css`의 `.cellPopout`과 같다(`--ex-bg`, `--ex-border`, 10px, `--ex-elevation-overlay`).
- [ ] `.bn-ak-menu-item`의 `:hover` · `[data-active-item]` · `[aria-selected=true]` · `[aria-expanded=true]` · `:active`가 `--ex-bg-tint-strong` 배경, `--ex-fg-strong` 글자다. `#007acc` · `#0062a3`이 계산된 스타일에 남지 않는다.
- [ ] 메뉴 항목은 최소 34px, 모서리 7px, `--ex-text-sm`, `--ex-fg-body`이고 눌러도 위아래 여백이 흔들리지 않는다.
- [ ] `.bn-side-menu .bn-ak-button`은 투명 배경 · 그림자 없음 · `--ex-fg-subtle`, 아이콘 18px, 올리면 `--ex-bg-tint` · `--ex-fg-strong`이다.
- [ ] `/` 메뉴: 왼쪽 아이콘 칸 32px 테두리 상자(`--ex-border-soft`, `--ex-radius-control`), 설명이 붙은 항목 최소 44px, 제목 `--ex-text-sm` 500, 설명 `--ex-text-2xs` `--ex-fg-muted`, 묶음 이름 `--ex-text-xs` 600 `--ex-fg-muted`.
- [ ] `/` 메뉴 항목에 단축키 표시(`badge`)가 없다. `BlockNoteBody.tsx`의 `slashItems`가 기본 항목에서 `badge`를 뺀다. 「콜아웃」 항목은 `icon`(Phosphor `lightbulb`)을 가진다.
- [ ] 서식 툴바 단추는 투명 · 그림자 없음, 고른 단추는 `--ex-bg-tint-strong`. 툴팁은 `--ex-bg-inverse` · `--ex-fg-on-inverse`.
- [ ] 빈 줄 안내(`.bn-block-content:has(.ProseMirror-trailingBreak:only-child)::after`)가 `font-style: normal`이다.
- [ ] `tokens.test.ts` 통과(곡률 역할: `button`이 든 선택자는 `--ex-radius-control`).

## 설계

- **덮어쓰기 위치(바뀜)**: `features/career-editor/editor/BlockNoteBody.module.css`. 메뉴는 BlockNote가 `.bn-root` 안의 `bn-portal-anchor`에 그리므로(2026-11-21 DOM 확인) 기존 `.body :global(...)` 범위로 닿는다. 전역 CSS를 새로 두지 않는다.
- **명시도**: ariakit 규칙은 `.bn-ak-menu-item[data-active-item]`(0,2,0)과 `:where(.dark …)`(더하지 않음)이다. `.body` 접두로 (0,3,0)이 되어 테마 분기 없이 이긴다. 어두운 테마는 역할 토큰이 값을 바꾼다.
- **재사용**: 값은 `.cellPopout` · `.cellPopoutTitle` · `.propertyCreateIcon`(아이콘 상자)의 기존 값과 역할 토큰을 그대로 쓴다.
- **BlockNote 테마 변수(바뀜)**: `--bn-colors-menu-background`를 `--ex-bg-chrome`에서 `--ex-bg`로 바꿔 팝업 표면과 맞춘다.

## 버린 대안

- `@blocknote/mantine` 테마로 바꾼다: 의존성이 늘고 Mantine 색 체계를 다시 덮어써야 한다.
- 메뉴를 BlockNote 컴포넌트 교체(`SideMenu`, `SuggestionMenu` 사용자 정의)로 다시 만든다: 키보드 · 위치 동작을 다시 구현해야 하고 요청은 모양이다.
- 색 메뉴의 강조색을 토큰으로 바꾼다: 토큰에 그런 단계가 없고, 기록에 이미 저장된 색 표시가 바뀐다.

## 함정

- ariakit은 `:active`에 `padding-top: 9px; padding-bottom: 7px`을 준다. 같은 여백으로 덮지 않으면 누를 때 글자가 움직인다.
- `.bn-ak-menu:not(:focus) .bn-ak-menu-item:not(:focus)[aria-expanded=true]`는 명시도가 (0,4,0)이다. 같은 선택자에 `.body`를 붙여 덮는다.
- 툴바의 `overflow: scroll`은 AI 메뉴 위치 처리와 얽혀 있으니 건드리지 않는다.

## 완료 기준

- `pnpm typecheck`, `pnpm test` 통과.
- 1440 밝은 · 어두운 테마에서 블록 단추, 블록 메뉴, 색 메뉴, `/` 메뉴, 서식 툴바를 전후 캡처하고, 고른 항목의 계산된 배경색이 `--ex-bg-tint-strong` 값인지 JS로 확인.
- `e2e/career-editor.spec.ts`가 로컬에서 통과(본문 `/` 메뉴 사용 경로 포함).
