---
title: 포트폴리오 제작 흐름의 설계서 6단계 복원
slug: portfolio-six-step-flow
stage: spec
status: accepted
intent: .intent/intent_portfolio-six-step-flow.md
date: 2026-10-15
---

# 포트폴리오 제작 흐름의 설계서 6단계 복원 — 명세

## 요구사항

- [ ] 사이드바·상단 메뉴·홈·편집기 레일의 "새 포트폴리오"와 온보딩 "첫 포트폴리오"가 `/brew/new`를 가리킨다. `/portfolio/new`는 브루를 만들지 않고 `/brew/new`로 보낸다(이전 주소 호환).
- [ ] "목표 없이"(`createFreeBrewAction`)로 만든 브루는 `/brew/{id}/analyze`에서 시작한다.
- [ ] 위저드의 단계 정의는 하나다. 공고 분석 · 재료 고르기 · AI 대화 · 레시피 · 디자인 선택 · 다듬기. `portfolio-v2` 단계 정의와 `flow` 분기를 웹에서 없앤다. 레시피 화면은 디자인 선택 여부와 관계없이 "레시피" 단계로 표시한다.
- [ ] 편집기(04 다듬기)에도 같은 단계 표시줄이 있고, 현재 단계는 "다듬기"다. 지난 단계는 그 포트폴리오의 브루 화면으로 돌아가는 링크다.
- [ ] 디자인 선택 화면은 38종 카탈로그를 보여 준다. 레시피가 있으면 "이 디자인으로 만들기"가 선택을 저장하고 생성을 시작한다. 레시피가 없으면 레시피 단계로 가는 링크를 보여 준다. 생성 한도를 넘었으면 버튼을 막고 이유를 보여 준다.
- [ ] 생성 중·완료 화면(`Generating`)과 "포트폴리오 열기" → `/edit/{portfolioId}`는 그대로 쓴다. "디자인을 바꿔 다시 뽑기"는 카탈로그로 돌아간다.
- [ ] `POST /v1/generation-jobs`는 `{recipeId, templateId, styleOverrides?}` 또는 `{recipeId, designSystemRevisionId}`를 받는다. 둘 중 정확히 하나여야 하고, 아니면 400이다. 없는 판 ID는 404다.
- [ ] 디자인 시스템 판으로 요청하면, 생성 작업과 포트폴리오에 `designSystemRevisionId`를 저장한다. `templateId`와 `styleOverrides`(배경·글자·강조 색, 서체 계열, 밀도, 배치)는 그 판의 토큰에서 정한다.
- [ ] 토큰 변환 규칙:
  - 배경 = `colors.canvas`, 글자 = `colors.text`, 강조 = `colors.accent`
  - 서체 계열 = `typography.display.fallback`의 일반 글꼴 이름(monospace → mono, serif → serif, 그 밖 → sans)
  - 밀도 = `composition.density`, 배치 = `composition.layout`
  - 템플릿 = 판의 `legacyTemplateId`. 없으면(Refero 5종) 내장 Clarity 템플릿
- [ ] 테스트로 확인한다. 기존 템플릿과 연결된 디자인 시스템(35종)을 변환하면 그 템플릿의 스타일 6개 값과 같아야 한다. 다르면 차이를 기록한다.
- [ ] 생성 문맥(`PageService`)의 스타일 이름·설명은 포트폴리오에 디자인 시스템이 있으면 그 디자인 시스템의 이름·설명이다.
- [ ] 웹에서 닿을 수 없는 레거시 템플릿 선택 화면(`DesignPicker`, `TemplateThumb`, `design-filters`, 해당 테스트)과 `?legacy=1` 분기를 지운다. 백엔드 `templates.previews` API는 남긴다.
- [ ] 마이그레이션은 없다. `generation_jobs`·`portfolios` validator는 추가 필드를 허용한다(0001 schema, `additionalProperties` 없음).

## 설계

- **입구.** `SidebarNav`·`ShellNav`·`home/page.tsx`·`Editor.tsx`의 링크와 온보딩 링크를 `/brew/new`로 바꾼다. `portfolio/new/page.tsx`는 `redirect("/brew/new")`만 한다.
- **단계 정의.** `WizardShell.tsx`의 `LEGACY_WIZARD_STEPS`를 유일한 `WIZARD_STEPS`로 두고 `PORTFOLIO_V2_STEPS`·`WizardFlow`·`flow` 인자를 지운다. `BrewFrame`·`outline/page.tsx`·`design/page.tsx`의 `flow` 전달을 지운다. 편집기는 `toolbar` 아래에 `WizardSteps brewId={portfolio.brewId} current="edit"`를 둔다.
- **7단계 생성.** `design-actions.ts`의 `startGenerationAction`을 디자인 시스템 기준으로 바꾼다. 받는 값은 `brewId`·`recipeId`·`designSystemRevisionId`다. 순서는 (1) `designSystems.select` (2) `generation.submit({recipeId, designSystemRevisionId})` (3) `revalidatePath`. `DesignCatalog` 하단 버튼이 이 액션을 쓴다. `design/page.tsx`는 `recipeId`와 `entitlements.check`의 `allowed`를 카탈로그에 넘긴다.
- **백엔드 변환.** `design-systems/index.ts`(새 진입점)에 순수 함수 두 개를 둔다.
  - `findDesignSystemRevision(id)`: 메모리 카탈로그에서 판을 찾는다.
  - `generationStyleFor(revision)`: `{templateId, styleOverrides}`를 돌려준다.
  - `generation/service.ts`의 `submit`은 판 ID가 오면 이 결과로 템플릿 존재를 검사하고, 작업에 `designSystemRevisionId`와 함께 저장한다. `prepareFreeHtml`의 포트폴리오 삽입도 `designSystemRevisionId`를 옮긴다.
  - `page/service.ts`는 포트폴리오에 `designSystemRevisionId`가 있으면 `findDesignSystemRevision`의 이름·설명을 쓴다. 다른 모듈 내부를 직접 가져오지 않고 진입점만 쓴다.
- **계약.** `SubmitGenerationSchema`는 `templateId`·`designSystemRevisionId`를 선택 필드로 두고 `refine`으로 정확히 하나를 강제한다. `GenerationJobDoc`·`PortfolioDoc` 타입에 `designSystemRevisionId?: string | null`을 더한다.

## 버린 대안

- **웹에서 `legacyTemplateId`와 토큰을 `styleOverrides`로 바꿔 보내기.** 도메인 규칙이 화면에 들어가고, 어떤 디자인 시스템으로 만들었는지 기록이 남지 않는다.
- **브루에 저장된 디자인 선택을 생성 작업이 읽게 하기.** 요청만 보고는 무엇으로 생성했는지 알 수 없고, 선택이 바뀌는 시점과 생성이 엇갈릴 수 있다.
- **레거시 `DesignPicker`를 7단계에 쓰기.** 2026-10-15 결정으로 카탈로그를 쓴다.
- **v2 화면 코드 전체 삭제.** 2026-10-15 결정으로 남긴다.

## 함정

- `SubmitGenerationSchema`는 strict 객체다. `refine`을 붙여도 OpenAPI 생성(`contracts/src/openapi.ts`)이 깨지지 않는지 확인한다.
- 자유 제작 브루는 공고 분석이 요건 0개인 "완료" 상태다. 분석 화면은 "공고 없이 시작한 제작"을 이미 그린다.
- `loading.tsx`의 골격(`BrewSkeleton`)도 단계 정의를 쓴다. 정의를 하나로 줄이면 같이 맞춰진다.
- `WizardSteps`의 지난 단계 링크는 `/brew/{id}/{segment}`다. 편집기에서도 지난 단계가 브루 화면으로 가야 한다. "다듬기"(`edit`) 자체는 지난 단계가 될 일이 없다.
- 생성 한도(402·403) 문구는 기존 `submitFailure`를 그대로 쓴다.

## 완료 기준

- `pnpm typecheck`, `pnpm test`, `pnpm test:infra integration.test.ts --maxWorkers=2` 통과.
- 새 테스트가 통과한다.
  - 계약: 정확히 하나 규칙
  - 생성 서비스: 판 ID 요청 시 저장 필드
  - 변환 함수: 35종 템플릿 일치, Refero는 Clarity 대체
  - 웹: 단계 정의 하나, 입구 링크, `startGenerationAction`의 저장 → 제출 순서
- 체험 서버에서 새 포트폴리오 → 공고 분석 → 재료 → AI 대화 → 레시피 → 디자인 선택(카탈로그) → 생성 → 다듬기를 실제로 진행한다. 생성된 지면 CSS의 `--sp-bg`·`--sp-ink`·`--sp-accent`가 고른 디자인 시스템의 토큰과 같은지 확인한다.
