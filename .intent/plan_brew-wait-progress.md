---
title: 생성 기다림 진행 막대 · 지면 순환 멈춤
slug: brew-wait-progress
stage: plan
status: accepted
intent: .intent/intent_brew-wait-progress.md
spec: .intent/spec_brew-wait-progress.md
date: 2026-11-10
---

# 생성 기다림 진행 막대 · 지면 순환 멈춤 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/app/(app)/brew/[brewId]/design/wait-timing.ts` | `RECIPE_WAIT_MS` · `fakeProgress()` · `waitedMs()`(잡을 만든 뒤 지난 시간, `brewingLeftMs`도 이것을 씀) 추가 |
| `services/web/src/app/(app)/brew/[brewId]/design/wait-timing.test.ts` (새 파일) | `fakeProgress` 성질 검사 |
| `services/web/src/app/(app)/brew/[brewId]/design/GenerationWait.tsx` | `BrewProgress` · `waitedMs` 속성 · `useSheetBuild` 멈춤 |
| `services/web/src/app/(app)/brew/[brewId]/design/GenerationWait.module.css` | 막대 · 접힘 · `data-settled` 스크롤 막대, 비우기 규칙 삭제 |
| `services/web/src/app/(app)/brew/[brewId]/design/GenerationWait.test.tsx` | 막대 · 멈춤 테스트 추가 |
| `services/web/src/app/(app)/brew/[brewId]/design/Generating.tsx` | `waitedMs` 전달 |
| `services/web/src/app/(app)/brew/[brewId]/design/page.tsx` | `waitedMs` 계산 |

## 작업 순서

1. `fakeProgress` 와 테스트 — `wait-timing.test.ts` 통과
2. `useSheetBuild` 멈춤 · CSS `data-settled` — 동작 켠 테스트에서 네 구역 뒤 비워지지 않음
3. `BrewProgress` · `waitedMs` 연결 — 타입 검사 통과, 테스트에서 막대 값이 늘고 1 미만
4. 로컬 웹에서 기다림 화면 확인 — 브루잉 막대 · 넘어갈 때 채움 · 멈춘 지면 스크롤

## 가장 위험한 단계

2단계. `useSheetBuild`의 스크롤 처리(사람이 움직였는지 판정)를 바꾸면 자동 이동이 사람 스크롤로 읽혀 쌓기가 바로 끝날 수 있다. 판정식(`written`과 1px 차이)은 그대로 두고 재개만 없앤다. 깨지면 이 커밋만 되돌린다.

## 검증

```
pnpm --filter @expresso/web test -- GenerationWait wait-timing
pnpm typecheck
```

화면: 로컬 복사 DB에서 brew의 구성 잡을 `running`, 생성 잡을 `queued`로 두고 `/brew/<id>/design`을 연다 → 막대 확인. 구성 잡을 `succeeded` · `recipeId` 설정 · 생성 잡 `running`으로 바꾼다 → 지면이 쌓이고 멈추는지, 스크롤 막대가 보이는지 확인.
