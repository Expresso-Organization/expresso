---
title: 제작 흐름의 레시피 단계 제거
slug: remove-recipe-step
stage: spec
status: accepted
intent: .intent/intent_remove-recipe-step.md
date: 2026-10-27
---

# 제작 흐름의 레시피 단계 제거 — 명세

## 요구사항

- [ ] `WIZARD_STEPS`에 `outline`이 없다. `brew/[brewId]/outline/`이 없고 그 주소는 404다. `resumeStep("recipe")`는 `design`이다.
- [ ] AI 대화의 마지막 버튼은 `continueToDesignAction`이다. 레시피 잡을 맡기고(`brews.createRecipe`, 키 `recipe:{brewId}`) `/brew/{id}/design`으로 `redirect`한다. 같은 키는 같은 잡을 가리키고 성공한 잡은 다시 돌지 않는다.
- [ ] `SubmitGenerationSchema`는 `recipeId` 또는 `brewId` 가운데 하나를 받는다. `brewId`만 오면: 그 브루의 가장 최근 레시피가 있으면 그것으로 지금처럼 시작하고, 없으면 `recipeId: null`인 생성 잡을 `queued`로 저장하되 `portfolio.generate`는 내지 않는다(구성을 기다리는 생성).
- [ ] 구성 잡이 성공하면 워커가 `GenerationApi.attachRecipe(userId, brewId)`를 부른다. 그 브루의 `recipeId: null` · `queued` 생성 잡에 최근 레시피를 붙이고 `portfolio.generate`를 낸다. 같은 일을 두 번 해도 한 번만 붙는다(`recipeId: null` 조건).
- [ ] 생성 요청이 구성 잡 완료와 엇갈려 끼지 않도록, 구성을 기다리는 잡을 저장한 뒤 한 번 더 `attachRecipe`를 부른다.
- [ ] 구성 잡이 마지막으로 실패하면(다시 돌지 않는 실패이거나 시도를 다 쓴 경우) 워커가 `GenerationApi.failWaiting(userId, brewId, code)`로 기다리던 생성을 `failed`로 끝낸다. 코드는 구성 잡의 실패 코드다.
- [ ] `generation_jobs` validator에서 `recipeId`가 문자열 또는 null이다(마이그레이션 0021 — 다른 브랜치가 0013~0020을 쓴다).
- [ ] 레거시 MySQL 생성 서비스는 `recipeId`가 없으면 400이다.
- [ ] 웹 `startGenerationAction`: 폼에 `recipeId`가 없으면 먼저 `brews.createRecipe`(같은 키)를 부른 뒤 `brewId`로 생성을 요청한다. 디자인 화면의 만들기 버튼은 구성 상태와 상관없이 누를 수 있다. 구성 실패 · 구성을 기다리던 생성의 실패는 기존 실패 줄에 이유로 보인다.
- [ ] 구성을 기다리는 로딩 화면: 생성 잡이 `queued`이고 구성 잡이 `queued` · `running`이면 `GenerationWait`이 `recipePending`이다. 브루잉은 시간과 상관없이 가운데에 머물고, 잔 아래에서 구성 문장(고른 기록 읽는 중... · 기록을 공고 요건과 맞추는 중...(공고가 있을 때) · 담을 섹션 고르는 중... · 섹션 순서 정하는 중... · 섹션마다 핵심 메시지 고르는 중...)이 4.5초마다 돈다. 1.5초마다 다시 읽어, 구성이 끝나 `recipePending`이 풀리면 지금처럼 빈 지면이 올라온다.
- [ ] 사용자에게 보이는 "레시피" 문구는 "구성"으로 바꾼다.

## 설계

- **백엔드 `modules/generation/service.ts`:** `submit`이 `brewId` 경로를 받는다. `attachRecipe` · `failWaiting`을 서비스와 `GenerationApi`(진입점)에 둔다. 레시피는 지금처럼 이 모듈이 `db.recipes`를 직접 읽는다(브루당 최근 것: `createdAt` 내림차순). `GenerationJobDoc.recipeId`는 `string | null`이고, `process` · `prepareFreeHtml`은 null이면 거절한다.
- **워커 `processors/brew-jobs.ts`:** `createBrewJobProcessor`가 세 번째 인자로 `{ attachRecipe, failWaiting }`을 받는다. 레시피 잡이 성공하면 `attachRecipe`, 실패 오류를 다시 던지기 전에 마지막 실패면 `failWaiting`. 마지막인지는 분류의 `retryable`과 BullMQ `attemptsMade` · `opts.attempts`로 본다.
- **웹:** 다시 읽기는 `Waiting.tsx`의 1.5초 효과를 `brew/[brewId]/use-refresh-while.ts`로 꺼내 `Waiting` · `GenerationWait`이 함께 쓴다. `GenerationWait`의 브루잉 전환 타이머는 `recipePending` 동안 걸지 않는다.

## 버린 대안

- 레시피를 없애고 생성이 재료에서 바로 지면을 만들게 하는 방법: 생성 · 지면 설계가 레시피 섹션과 근거 연결을 읽고, 계약 · 저장소 · 통합 테스트가 그 데이터를 전제로 한다.
- 구성이 끝날 때까지 만들기를 막는 방법: 사용자가 미리 누를 수 있게 하기로 정했다(2026-10-27).
- 브라우저가 구성 완료를 기다렸다가 생성을 요청하는 방법: 화면을 닫으면 생성이 시작되지 않는다.
- 생성 잡에 새 단계 값(`waiting_recipe`)을 더하는 방법: 계약 · validator · 화면의 단계 표를 모두 넓혀야 한다. `recipeId: null` · `queued`로 같은 뜻을 낸다.

## 함정

- 구성 잡은 큐가 다시 돌 수 있는 실패도 낸다. 그때 기다리던 생성을 실패로 끝내면 다음 시도가 성공해도 생성이 없다 — 마지막 실패에서만 끝낸다.
- `prepareFreeHtml` · `process`가 `recipeId: null` 잡을 받으면 안 된다. `portfolio.generate`는 구성이 붙은 뒤에만 나간다.
- 이용량 확인(`entitlements`)은 생성이 끝날 때 차감하므로 기다리는 동안 바뀌지 않는다.

## 완료 기준

- `pnpm typecheck`, `pnpm test`, `pnpm test:infra`(생성 · 구성 잡 통합 테스트에 기다리는 생성 경로 추가) 통과.
- 체험 서버에서 새 제작: AI 대화 → 디자인 → 바로 만들기 → 구성 로딩 화면 → 빈 지면 → 편집 화면.
