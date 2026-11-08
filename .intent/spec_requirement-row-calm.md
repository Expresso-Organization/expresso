---
title: 자격 요건 행 판정 신호 정리
slug: requirement-row-calm
stage: spec
status: draft
intent: .intent/intent_requirement-row-calm.md
date: 2026-10-28
---

# 자격 요건 행 판정 신호 정리 — 명세

## 요구사항

- [ ] `.requirementPartial` · `.requirementMissing`이 사라지고 모든 요건 행이 `.requirement`의 지면을 쓴다.
- [ ] `COVERAGE.missing.color`가 `--ex-fg-subtle`이 된다. 아이콘 모양(`circle-dashed`)은 그대로다.
- [ ] 우대 사항 블록의 "없음" 아이콘과 레이블도 같은 회색으로 선다. 두 블록이 `COVERAGE` 한 표를 함께 본다.
      "있음"의 초록과 "약함"의 황색은 그대로 둔다.
- [ ] 근거 줄은 `coveredBy`가 있을 때만 그린다. 비어 있으면 `null`이다.
- [ ] `.requirementNoteCovered` · `.requirementNotePartial` · `.requirementNoteMissing`이 사라지고
      근거 줄은 `--ex-fg-muted` 하나를 쓴다.
- [ ] "기록에 없습니다 · 질문 3개로 채울 수 있습니다" 문자열이 저장소에서 사라진다.
- [ ] `--ex-warning-surface` · `--ex-danger-surface-deep`의 "06b 요건 행" 주석이 사라진다.
      두 토큰은 06 목록 칩과 편집 · 배포 · 로그인 화면이 함께 쓰므로 값과 이름은 남긴다.
- [ ] 화면 정의서 06b의 요건 행 세 줄이 모두 `#FCFDFF`를 쓴다.

## 설계

`COVERAGE` 표(`page.tsx:22`)에서 `row`와 `note` 칸을 없앤다. 남는 것은 `icon` · `weight` · `color` · `label`이고,
`label`은 우대 사항 블록이 계속 쓴다. 행과 근거 줄은 클래스를 하나씩만 쓰므로
`RequirementRow`에서 템플릿 문자열 결합이 사라진다.

`RequirementRow`의 근거 줄 조건이 `state === null`에서 `requirement.coveredBy.length === 0`으로 바뀐다.
대조 전(판정 없음)과 대조 후 덮는 기록 없음이 같은 모습이 된다 — 둘 다 요건 글만 남는다.
둘을 구분하는 것은 아이콘이다. 대조 전은 `circle`(`--ex-fg-faint`), 없음은 `circle-dashed`(`--ex-fg-subtle`).

CSS에서 `.requirementPartial` · `.requirementMissing` · `.requirementNote*` 세 modifier를 지운다.

정의서는 `docs/Expresso Screens.dc.html`의 06b 요건 행 두 줄(`#FBF4E2` · `#FCEEEA`)을 `#FCFDFF`로 바꾸고,
근거 줄 색도 본문 보조색(`#5A6B87`)으로 맞춘다. 06c는 이미 지면색을 쓰지 않으므로 그대로다.

## 버린 대안

- **지면색을 옅게 조정한다** — 같은 뜻을 세 번 말하는 구조가 남는다. 값을 바꾸면 다음에 또 바꾼다.
- **충족·약함·없음 순으로 정렬한다** — 요건 순서는 공고 원문의 순서이고 공고가 중요하게 여긴 차례다.
  그것을 내 사정으로 다시 세우면 공고를 읽는 일이 어려워진다.
- **없음 요건을 블록 끝에 묶어 한 줄로 요약한다** — 요건 글 자체가 사라져 공고를 읽을 수 없다.

## 함정

- `styles.requirementPartial ?? ""` 처럼 CSS Modules 키를 옵셔널로 집는 자리가 있다.
  클래스를 지우면 그 자리도 함께 지워야 한다. 남겨 두면 타입은 통과하고 빈 문자열이 붙는다.
- 두 토큰은 지우지 않는다. `--ex-status-warning-surface`는 06 목록의 `.stackChipMissing` ·
  `.missingWarning`과 제작 개요 · 도구 카드가, `--ex-status-danger-surface-deep`은
  06 목록의 `.missingDanger`와 편집 · 배포 · 로그인 화면이 쓴다. 주석만 고친다.
- 06b 정의서는 한 줄이 매우 길다. 요건 행의 `background` 값만 바꾸고 다른 속성은 건드리지 않는다.
- 우대 사항 블록은 `COVERAGE[item.coverage]`의 `icon` · `color` · `label`만 쓴다.
  `row` · `note`를 지워도 그 블록의 배치는 바뀌지 않는다. 지우고 나서 확인한다.
  `missing.color`는 함께 바뀐다 — 의도한 변경이고, 화면에서 눈으로 확인한다.

## 완료 기준

```
pnpm typecheck
pnpm test
```

화면 확인 — 기록 1건으로 대조를 마친 공고 상세에서
요건 행 다섯 줄의 `background-color`가 모두 같고, 근거 줄이 있는 행은 충족·약함 둘뿐이며,
`document.body.innerText`에 "기록에 없습니다"가 없다.
우대 사항의 "없음" 아이콘과 레이블이 회색이다.
