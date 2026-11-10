---
title: 생성 기다림 진행 막대 · 지면 순환 멈춤
slug: brew-wait-progress
stage: spec
status: accepted
intent: .intent/intent_brew-wait-progress.md
date: 2026-11-10
---

# 생성 기다림 진행 막대 · 지면 순환 멈춤 — 명세

## 요구사항

- [ ] `GenerationWait`이 `phase === "brewing"`인 동안 잔(`Brewing`) 아래, 문구(`Caption`) 위에 진행 막대를 그린다.
- [ ] 막대 값은 `fakeProgress(waitedMs, expectedMs)` 순수 함수가 정한다. 같은 입력이면 같은 값이고, 시간에 대해 줄지 않으며, 항상 1 미만이다.
- [ ] 값은 불규칙한 길이(0.3~2.2초)의 구간마다 한 번 바뀌고 구간 안에서는 그대로다.
- [ ] 기준 시간(`expectedMs`)은 구성을 기다리면 151초(2026-11-10 운영 실측 중앙값), 아니면 브루잉 10초(`BREWING_MS`)다. 기준 시간에 값이 0.8이다.
- [ ] 경과 시간은 서버가 생성 잡을 만든 시각(`generation.createdAt`)에서 잰다(`page.tsx` → `Generating` → `GenerationWait`의 `waitedMs`). 렌더 중에 `Date.now()`를 부르지 않는다.
- [ ] `reading`으로 넘어가면 막대가 1로 찬 뒤 사라지고 그 자리가 접힌다.
- [ ] 막대는 `role="progressbar"`이고 `aria-valuenow`를 두지 않는다(값이 실제 진행률이 아니다).
- [ ] `useSheetBuild`는 마지막 구역을 올리고 남은 카드 줄까지 보인 뒤 멈추고 `data-settled`를 단다. `data-turning` · `data-resetting` 단계를 없앤다.
- [ ] 쌓는 도중 사용자 스크롤이 읽히면 모든 구역을 보이고 곧바로 `data-settled`로 끝낸다(`scrollend`로 재개하지 않는다).
- [ ] 동작 줄이기 설정이면 처음부터 모두 보이고 `data-settled`다.
- [ ] `.feed[data-settled]`에서 스크롤 막대를 보인다.

## 설계

- 재사용: 막대 모양은 `brew/[brewId]/Waiting.module.css`의 `.progress` · `.progressFill`(높이 5px · `--ex-border` 바탕 · `--ex-accent` 채움 · 둥근 끝)과 같은 값을 쓴다. 움직임은 `--ex-motion-glide`(값 바뀔 때) · `--wait-rise`(접힘)다.
- `wait-timing.ts`에 `RECIPE_WAIT_MS`(151초)와 `fakeProgress()`를 둔다. 구간 길이는 구간 번호의 해시(`fract(sin(i)·43758.5453)`)로 정해 서버 렌더와 브라우저가 같은 값을 낸다. 값은 `1 - exp(-t / τ)`, `τ = expectedMs / ln 5`를 구간 시작 시각 `t`에서 잰 것이다.
- `GenerationWait` 안에 `BrewProgress` 컴포넌트: 처음 값은 `waitedMs`로 계산하고, 마운트 때 `performance.now()`를 기준점으로 잡아 200ms마다 다시 계산한다. `done`이면 1로 채우고 `data-done`으로 사라진다. 막대는 `phase`와 상관없이 그려 두고 `done = phase === "reading"`으로 넘긴다.
- `useSheetBuild` 3단계를 `settle()`로 바꾼다: 타이머·스크롤 리스너 해제, `data-settled`.

## 버린 대안

- `Math.random()`으로 흔들기: 서버 렌더와 첫 화면 값이 달라 하이드레이션 경고가 나고, 새로고침마다 같은 시간에 다른 값이 된다.
- `aria-valuenow`에 가짜 값 싣기: 화면 읽기 사용자에게 사실이 아닌 진행률을 알린다.
- 구성 잡의 실제 단계로 막대 움직이기: 구성 잡은 진행 신호를 보내지 않는다(`use-refresh-while.ts` 주석).

## 함정

- `router.refresh()`가 1.5초마다 `waitedMs`를 새로 보낸다. 컴포넌트는 처음 받은 값만 기준으로 쓰고 이후 값은 무시한다(시계 두 개를 섞지 않는다).
- `recipePending`이 도중에 꺼지면 기준 시간이 10초로 바뀌지만 그 순간 `reading`으로 넘어가므로 값이 튀는 모습은 보이지 않는다.
- jsdom에는 레이아웃이 없어 `useSheetBuild`의 1단계(카드 줄 올리기)가 돌지 않는다. 테스트는 구역 올리기와 멈춤만 본다.

## 완료 기준

- `pnpm --filter @expresso/web test -- GenerationWait wait-timing` 통과, `pnpm typecheck` 통과.
- 로컬 기다림 화면에서 막대가 불규칙하게 차고, 지면이 기록 구역까지 쌓인 뒤 멈추며 스크롤 막대가 보인다.
