---
title: 곡률 단계 토큰 · 버튼 · 칩 · 입력 · 카드 통일
slug: radius-scale
stage: spec
status: accepted
intent: .intent/intent_radius-scale.md
date: 2026-11-10
---

# 곡률 단계 토큰 · 버튼 · 칩 · 입력 · 카드 통일 — 명세

## 요구사항

- [ ] `tokens.css` 치수 절에 `--ex-radius-control: 8px` · `--ex-radius-card: 14px`가 `--ex-radius-pill` 옆에 있다.
- [ ] 버튼: 채움이나 테두리가 있는 버튼, 이름에 Button · Btn · Cta가 든 버튼의 곡률이 `var(--ex-radius-control)`이다. 원형(50%) · 칩 모양 버튼은 제외한다.
- [ ] 입력 칸: input · select · textarea와 그 테두리를 그리는 감싸개, 메시지 입력 상자(`--composer-radius`, `ai.module.css .composer`, `.inputBox`)가 `var(--ex-radius-control)`이다. 이름에 search가 든 검색 칸은 pill로 남는다.
- [ ] 칩 · 배지: 상태 · 분류 · 필터 · 제안 토큰처럼 주 동작이 아닌 작은 표시와 선택지(999px였던 것 포함)가 `var(--ex-radius-pill)`이다. 높이가 아니라 역할로 가른다 — 34px 예시 질문 칩도 칩이고, 26px 「비교」 버튼은 버튼이다.
- [ ] 카드: 지면 위 테두리 · 채움 컨테이너(카드 · 패널 · 표 틀 · 자리표시 카드)가 `var(--ex-radius-card)`이다.
- [ ] `agent-chat-framework.css`: 버튼 · 입력의 `calc(var(--radius) - 2px)`가 control 토큰, 카드의 `var(--radius)`가 card 토큰, 배지 9999px가 pill 토큰이다. `@theme inline`에 `--radius-lg: var(--ex-radius-control)`이 있어 Tailwind `rounded-lg`도 같은 값을 쓴다.
- [ ] `tokens.test.ts` 「역할별 곡률」: 랜딩 · 공개 포트폴리오를 뺀 앱 CSS에서 마지막 복합 선택자의 클래스 이름이 칩 · 배지(chip · badge · tag · pill) → pill, card → card, Button · Btn · Cta → control 또는 50%, input · select · textarea · textInput → control인지 본다. 한쪽 모서리만 둥근 값(`8px 0 0 8px`)은 0이 아닌 값이 모두 기대 토큰이면 통과한다. 예외는 이유와 함께 목록에 둔다(카드형 기록 칸 `.recordChip`, 색 견본 `.swatchChip`, 팝오버 `.parsedChipPop`, 세그먼트 항목 `.viewportButton` · `.alignButton`, 레일 · 도구 막대 `.railButton` · `.toolButton`, 13px 미세 버튼 `.sectionMoveButton` 등).

## 설계

대상 목록은 조사로 정했다. `rules.mjs`가 모듈 CSS의 곡률 규칙 638개를 꺼내고, 이름 · 속성 · 화면 측정으로 역할을 붙인 뒤 사람이 확인했다. 결과는 `radius-edits.tsv`(파일 · 줄 · 선택자 · 예전 값 · 새 토큰)다. 적용 스크립트는 줄 번호와 선택자로 규칙을 찾고, 그 규칙의 `border-radius`가 예전 값과 같을 때만 바꾼다. 하나라도 맞지 않으면 아무것도 쓰지 않는다.

재사용: 앞 커밋의 `--ex-radius-pill`과 「검색 칸 곡률」 검사 방식(규칙 단위로 선택자를 쪼개 마지막 복합 선택자를 본다)을 그대로 넓힌다.

토큰 위치는 `:root` 치수 절이다. 테마마다 값이 같기 때문이다.

## 버린 대안

- 숫자만 일괄 치환(예: 7 · 9 · 10px → 8px): 팝오버 · 알림 상자 · 선택 타일까지 바뀐다. 요청자가 정한 네 역할이 아니다.
- 역할마다 공용 컴포넌트로 묶기: 화면마다 마크업과 동작이 달라 이번 범위(곡률)보다 크다.

## 함정

- `.slugInput`과 그 짝 버튼은 한쪽 모서리만 둥글다(`9px 0 0 9px` · `0 9px 9px 0`). 토큰을 그 자리에 넣는다.
- `.cardHitTarget:focus-visible`은 `.designCard` 위에 겹치므로 같은 card 토큰이어야 포커스 링이 맞는다.
- 표 틀(`.tableViewport`)은 모바일 미디어 쿼리에서 8px로 한 번 더 적힌다. 둘 다 card 토큰으로 바꾼다.
- 칩 이름이 든 팝오버(`.parsedChipPop`)와 카드형 기록 칸(`.recordChip`), 색 견본(`.swatchChip`)은 칩이 아니다. 검사 예외에 넣는다.
- `.inputSend`처럼 입력 상자 안 버튼은 버튼 규칙(8px)을 따른다.

## 완료 기준

- `pnpm typecheck`, `pnpm --filter @expresso/web test` 통과.
- 「역할별 곡률」이 칩 하나를 5px로 되돌리면 실패한다(확인 뒤 원복).
- 조사 스크립트를 다시 돌려 주요 화면의 버튼 8px · 칩 pill · 카드 14px이 측정된다.
