---
title: 텍스트 입력 포커스 테두리 제거
slug: input-focus-border
stage: spec
status: accepted
intent: .intent/intent_input-focus-border.md
date: 2026-11-07
---

# 텍스트 입력 포커스 테두리 제거 — 명세

## 요구사항

- [ ] 텍스트 입력 요소(`input`의 텍스트 계열 type, `textarea`, `contenteditable`)는 포커스 때 전역 `--ex-focus-ring`을 받지 않는다.
- [ ] 텍스트 입력과 그 감싸개의 `:focus` · `:focus-within` · `:focus-visible` 규칙이 `border-color` · `outline` · 링 `box-shadow`를 바꾸지 않는다.
- [ ] `checkbox` · `radio` · `range` · `color` · `file` · 버튼 계열 `input`과 `select` · `button` · `a`는 기존 포커스 표시를 유지한다.
- [ ] 포커스 때의 `background` 변화, `:hover` 테두리, 오류 상태 테두리는 그대로이다.
- [ ] 입력 칸에 포커스 테두리 규칙을 다시 추가하면 `tokens.test.ts`가 실패한다.

## 설계

**전역 규칙.** `styles/global.css`의 `:focus-visible`을 둘로 나눈다. `outline: none`은 모든 요소에 유지하고, 링은 텍스트 입력을 뺀 요소에만 그린다.

```css
:focus-visible { outline: none; }
:focus-visible:not(:where(
  input:not([type="checkbox"], [type="radio"], [type="range"], [type="color"], [type="file"],
            [type="button"], [type="submit"], [type="reset"], [type="image"]),
  textarea,
  [contenteditable]
)) { box-shadow: var(--ex-focus-ring); }
```

`:where()`의 명시도는 0이다. 새 규칙의 명시도가 기존 `:focus-visible`과 같아 화면별 규칙과의 우선순위가 바뀌지 않는다.

**화면별 규칙.** 다음 규칙에서 테두리 선언만 지우고 다른 선언은 남긴다.

- 지우는 자리: `home` · `jobs`의 `.searchBar`, `DesignCatalog`의 `.searchField`, `views`의 `.searchField` · `.popoverField>input` · `.columnMenuNameRow>input` · `.filterValue` · `.tabMenuName` · `.cellPopoutInput`, `properties`의 `.propertyCreateNameRow input` · `.input` · `.formulaSource`, `AiRecordInterview`의 `.question input`, `auth`의 `.input`, `brew/new`의 `.entrySearch` · `.input` · `.textarea`, `AgentChat`의 `.search` · composer shell, `RecordDraftCard` · `PlanCards`의 `.field input`.
- 배경을 남기는 자리: `properties .input`, `views .cellPopoutInput`, `brew/new .input` · `.textarea`, `AgentChat .browserTabs .search`.
- `select`를 남기는 자리: `RecordDraftCard` · `PlanCards`의 `.field select:focus-visible`.

**Tailwind 클래스.** `components/ui/textarea.tsx`의 `focus-visible:border-ring` · `ring-3` · `ring-ring/50`과 `thread.aui.tsx` composer의 `focus-within:border-*`를 지운다. `aria-invalid` 링은 유지한다.

**프레임워크 CSS.** `agent-chat-framework.css`의 `[data-aui="input"]`과 `[data-aui="datepicker"]`는 포커스 때 `outline: none`을 쓴다. `select`의 outline은 남긴다.

**쓸모없어진 규칙.** 전역 링을 지우려고만 있던 규칙을 삭제한다. `.aui-composer-input:focus-visible`과 `brew/new`의 `.searchInput:focus`가 대상이다. `AgentChat`의 `.search input:focus-visible` 3건은 `outline: none` 한 건으로 합친다. Firefox에서 `agent-chat-preflight.css`의 `:-moz-focusring`이 `outline: auto`를 켜므로, 채팅 범위의 입력 칸에는 `outline: none`을 남긴다. `home` · `jobs` `.searchBar`와 `brew/new` `.entrySearch`의 `transition`도 바뀌는 상태가 없어지므로 지운다.

**재발 방지.** `styles/tokens.test.ts`가 필수 상태 검사 `웹 검사`에서 돈다. 검사 범위는 다음과 같다.

- 전역 CSS를 포함한 모든 `*.css`. 다른 검사가 쓰는 `cssFiles` 목록과 따로 둔다.
- `:focus` · `:focus-within` 셀렉터, `input` · `textarea` · `[contenteditable]`의 `:focus-visible`, tsx에서 `<input>` · `<textarea>`에 붙은 모듈 클래스의 `:focus-visible`.
- 위 셀렉터의 `border*` · `outline*` · `box-shadow`는 `none` · `0` · `transparent` 같은 없애는 값만 허용한다.
- `<input>` · `<textarea>` 태그의 Tailwind `focus*:border|ring|outline`과 모든 tsx의 `focus-within:border|ring|outline`.
- 태그 검색이 깨져 검사가 빈 목록으로 통과하지 않도록 알려진 입력 칸 클래스를 찾는지 함께 확인한다.

## 버린 대안

- 전역 `input:focus { border-color: ... !important }`: 감싸개의 `:focus-within`을 막지 못하고, 입력 칸마다 다른 휴지 상태 테두리 색을 하나로 덮어쓴다.
- `--ex-focus-ring` 토큰을 투명으로 변경: 버튼과 링크의 키보드 포커스 표시까지 사라진다.

## 함정

- 텍스트 입력은 마우스 클릭에도 `:focus-visible`에 걸린다. 버튼은 걸리지 않는다. 그래서 `:focus-visible`만 고치면 입력 칸만 바뀌고 버튼은 그대로이다.
- `.titleEditor input:focus`와 `.cellInput:focus`는 값을 `none`으로 고정하고 배경과 테두리까지 다루므로 그대로 둔다.
- `.composer:focus-within`(커리어 AI)의 값은 휴지 상태의 `.composer`와 같아 효과가 없다. 규칙 전체를 지운다.
- `.rowCheckbox:focus-within>span`과 `.archetypeOption:has(input:focus-visible)`은 체크박스 · 라디오의 포커스 표시이다. 재발 방지 검사에서 제외한다.

## 완료 기준

- `pnpm --filter @expresso/web test`와 `pnpm typecheck`가 통과한다.
- 브라우저에서 `/home`, `/jobs`, `/login`의 입력 칸을 클릭한 뒤 계산된 `border-color` · `box-shadow` · `outline`이 클릭 전과 같다.
- 같은 화면의 버튼에 Tab 키로 이동하면 `box-shadow`에 포커스 링이 있다.
