---
title: 생성 기다림 10초 뒤 지면 전환과 섹션 늦게 올리기
slug: brew-wait-sections-live
stage: plan
status: draft
intent: .intent/intent_brew-wait-sections-live.md
spec: .intent/spec_brew-wait-sections-live.md
date: 2026-11-10
---

# 생성 기다림 10초 뒤 지면 전환과 섹션 늦게 올리기 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/app/(app)/brew/[brewId]/design/GenerationWait.tsx` | 10초 전환 조건 · 문구 · 막대 · `useSheetBuild`의 늦게 오는 구역 |
| `services/web/src/app/(app)/brew/[brewId]/design/GenerationWait.test.tsx` | 구성 대기 중 전환과 늦게 오는 섹션 시험 |
| `services/web/src/app/(app)/brew/[brewId]/design/Generating.tsx` | 주석만(구성 대기 설명) |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 시험 먼저 — 구성 대기 중 10초 뒤 세 구역, 다시 그리면 섹션이 제자리에 `data-shown`으로 들어오고 기록은 그대로 보인다(동작 켠 경우 · 동작 줄인 경우 · 손으로 멈춘 경우).
2. `GenerationWait` 전환 조건 · 문구 · 막대 — 시험의 구역 목록 · 문구 단언이 통과.
3. `useSheetBuild`를 DOM에서 다음 차례를 읽게 바꾸고 `resume` 추가 — 늦게 오는 섹션 시험 통과, 기존 쌓기 · 스크롤 시험 통과.
4. 주석 정리 — `GenerationWait` · `Generating` 설명을 새 동작에 맞춘다.
5. 검증 — 타입 검사 · 웹 시험 · 브라우저.

## 가장 위험한 단계

3단계. 쌓기 상태를 개수에서 DOM으로 바꾸며 기존 쌓기 순서나 스크롤 판정이 어긋날 수 있다. 기존 시험 두 개(마지막 구역까지 올리고 멈춤 · 손으로 스크롤하면 모두 보임)가 그대로 통과해야 하고, 어긋나면 이 파일만 되돌리면 된다.

## 검증

```
pnpm --filter @expresso/web test -- GenerationWait
pnpm --filter @expresso/web typecheck
```

브라우저: 로컬 웹 · API · 워커를 띄우고 AI 대화를 마친 직후(구성 진행 중) 디자인을 골라 만들기 → 10초 뒤 공고 · 디자인 · 기록 구역 → 구성 완료 뒤 섹션 구역이 디자인 아래에 나타나는지 본다. 구성 잡이 끝나는 시점은 fixture 워커로 맞춘다.
