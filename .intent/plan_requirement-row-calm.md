---
title: 자격 요건 행 판정 신호 정리
slug: requirement-row-calm
stage: plan
status: draft
intent: .intent/intent_requirement-row-calm.md
spec: .intent/spec_requirement-row-calm.md
date: 2026-10-28
---

# 자격 요건 행 판정 신호 정리 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/app/(app)/jobs/[jobId]/page.module.css` | 행 · 근거 줄 modifier 다섯 개 삭제 |
| `services/web/src/app/(app)/jobs/[jobId]/page.tsx` | `COVERAGE`에서 `row` · `note` 제거, 없음 아이콘 중립화, 근거 줄 조건 변경 |
| `services/web/src/styles/tokens.css` | 두 토큰의 "06b 요건 행" 주석 삭제 |
| `docs/Expresso Screens.dc.html` | 06b 요건 행 지면색 셋을 같게, 근거 줄 색을 본문 보조색으로 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. `page.tsx`의 `COVERAGE`에서 `row` · `note` 칸을 지우고 `missing.color`를 `--ex-fg-subtle`로 바꾼다.
   `RequirementRow`의 근거 줄 조건을 `coveredBy.length === 0`으로 바꾼다 — `pnpm typecheck`가 통과한다.
2. CSS에서 `.requirementPartial` · `.requirementMissing` · `.requirementNoteCovered` ·
   `.requirementNotePartial` · `.requirementNoteMissing`을 지운다 —
   `grep -rn "requirementNote\|requirementPartial\|requirementMissing" services/web/src`가 `.requirementNote` 하나만 남긴다.
3. 토큰 주석을 지운다 — 값과 이름은 그대로 두고 `pnpm --filter @expresso/web test`가 통과한다.
4. 정의서 06b의 요건 행 지면색과 근거 줄 색을 고친다 — 브라우저로 06b를 열어 다섯 줄이 같은 지면인지 본다.
5. 개발 서버로 실제 화면을 확인한다 — 아래 검증 절차.

## 가장 위험한 단계

1번이다. `COVERAGE`는 우대 사항 블록도 쓴다. `row` · `note`를 지우면 그 블록이 함께 깨질 수 있다.
우대 사항은 `icon` · `weight` · `color` · `label`만 집으므로 배치는 그대로여야 하지만,
타입이 아니라 실제 화면에서 우대 사항이 전과 같은 자리에 서는지 확인한다. 깨지면 그 커밋만 되돌린다.
`missing.color`는 두 블록에서 함께 회색이 된다 — 이것은 의도한 변경이다.

## 검증

```
pnpm typecheck
pnpm test
```

화면 확인 — 앞 작업에서 쓴 검증 DB(`expresso_compare`)와 포트를 그대로 쓴다.
인프라 · API · 워커 · 웹을 띄우고 `compare.localhost:3100`으로 연다.

```
pnpm infra:up
pnpm dev:backend
AI_PROVIDER=off pnpm dev:worker
pnpm dev:web
```

1. 기록 1건으로 대조를 마친 공고 상세를 연다. 요건 다섯 줄의 `background-color`가 모두 같다.
2. 근거 줄이 있는 행은 충족 · 약함 둘뿐이고, 글자색이 셋 다 같다.
3. `document.body.innerText`에 "기록에 없습니다"가 없다.
4. 우대 사항 블록이 전과 같이 아이콘 · 이름 · 상태 레이블을 보인다. "없음"은 회색으로 선다.
5. 기록 0건 계정으로 대조해 자격 요건 · 우대 사항 어디에도 빨강이 남지 않은 것을 본다.
