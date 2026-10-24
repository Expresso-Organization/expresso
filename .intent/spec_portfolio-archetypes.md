---
title: 포트폴리오 유형 선택과 포스터형 · 글 · 목록형
slug: portfolio-archetypes
stage: spec
status: accepted
intent: .intent/intent_portfolio-archetypes.md
date: 2026-10-22
---

# 포트폴리오 유형 선택과 포스터형 · 글 · 목록형 — 명세

## 요구사항

- [ ] 계약 `PORTFOLIO_ARCHETYPES = ["case-study", "poster", "list"]`. `SubmitGenerationSchema.archetype`(선택, 없으면 `case-study`)를 받아 생성 작업과 포트폴리오에 남긴다. 저장 Spec의 `PortfolioPage.props.archetype`(선택)에 생성기가 채우고, 없으면 사례 상세형으로 그린다.
- [ ] 유형마다 모델 출력 스키마가 다르다.
  - `case-study`: 지금과 같다.
  - `poster`: `NameIntro.variant`는 `poster` 하나, `ProjectIndex.variant`는 `poster` 하나, 사례 유형은 지금과 같고(이미지 규칙 유지), 컨테이너는 쓰지 않는다.
  - `list`: `NameIntro.variant`는 `sentence` 하나, 목차(ProjectIndex)는 없고, 모든 사례는 `CaseRow`, 컨테이너는 쓰지 않는다.
- [ ] Spec 프롬프트에 유형 문단(`describeArchetype`)이 들어가고, 유형에 없는 컴포넌트 설명은 빠진다.
- [ ] 키트에 포스터 첫 화면, 포스터 목차, `CaseRow`, 글 첫 화면(`sentence`), 유형별 사례 · 경력 · 근거 · 연락 스타일이 있다. 모두 JavaScript 없이 보이고 토큰 변수만 쓴다.
  - 포스터 첫 화면: 행동색(`--action`) 바탕에 행동 글자색(`--xp-action-text`), 이름을 화면 폭에 맞춰 크게(이름 글자 수에 따라 `data-name-length` 단계), 직무 한 줄, 집중 분야를 흐르는 글자 띠로. 무늬는 토큰 색을 섞은 CSS 그라디언트.
  - 포스터 목차: 번호와 프로젝트 제목을 큰 글자 행으로.
  - `CaseRow`: "기간 · 제목 · 요약" 한 줄이고, 펼치면(`<details>`) 본문 · 항목 · 그림이 보인다. 항목표(`dl`)를 쓰지 않는다.
  - 글 첫 화면: 이름과 직무를 작게 위에, 소개(headline + intro)를 큰 문장으로. 태그 · 버튼 없음.
- [ ] 내용 계약 `StructuredSection.period`(선택, 최대 60자). 내용 정리가 출처에 기간이 있을 때만 채운다. 없으면 `CaseRow`는 기간 칸을 비우지 않고 빼서 그린다.
- [ ] 디자인 선택 화면 카탈로그 위에 유형 선택(세 칸, 설명과 CSS로 그린 짜임새 견본)이 있고, "이 디자인으로 만들기"가 고른 유형을 함께 보낸다.
- [ ] `PAGE_PROMPT_VERSION` 13.
- [ ] 가상 프로필 3종 × 디자인 3종 × 새 유형 2개를 모델로 생성해 키트 검사를 통과한다. 프로필 하나의 두 유형 Spec을 디자인 38종으로 다시 그려 검사를 통과한다. 같은 프로필 · 같은 디자인 × 유형 3개 비교 화면을 사용자에게 보낸다. 체험 서버 실제 생성 1회.

## 설계

- `packages/contracts`: `portfolio-archetype.ts`(새, 상수 · 스키마), `generation.ts`, `structured-portfolio.ts`(`archetype` prop, `CaseRow`, 변형 추가, `period`, `structuredModelSchema(content, choices)`의 `choices.archetype`).
- `packages/database`: `documents/generation.ts` · `brew.ts`의 생성 작업 · 포트폴리오 문서에 `archetype?: string | null`. 컬렉션 검증기가 없어 마이그레이션은 없다.
- `packages/portfolio-renderer`: `catalog.ts`(CaseRow, 변형 설명), `kit.tsx`(루트 `data-archetype`, 새 컴포넌트), `kit-styles.ts`(유형 규칙), `archetype.ts`(새, `describeArchetype`).
- `services/backend`: 생성 서비스가 `archetype`을 작업 → 포트폴리오로 옮기고, 페이지 서비스가 생성 문맥에 넣고, 생성기가 스키마 · 프롬프트 · 루트 prop을 정한다. 내용 정리 프롬프트에 `period` 규칙.
- `services/web`: 디자인 선택 화면(`DesignCatalog.tsx` · `design-actions.ts`)과 API 클라이언트.
- 스크립트: `run-structured-profiles.ts`에 `PORTFOLIO_ARCHETYPE`, 재렌더 원본 `<실행>/<디자인>/<프로필>` 지원(수집 원본이 없으면 Spec을 그대로 씀).

## 버린 대안

- 유형을 모델이 고르게 하기: 취향은 사용자가 정해야 한다(intent).
- 유형마다 별도 렌더러: 카탈로그 · 검증 · 저장 경로가 둘이 된다. 같은 카탈로그에 컴포넌트를 더하고 스키마로 고를 수 있는 것을 나눈다.
- 이름 크기를 인라인 `style`로: 글자 수 단계 속성과 CSS로 충분하고, 인라인 스타일을 만들 이유가 없다.

## 함정

- 목차 필수는 모델 스키마에만 있다(저장 검사는 최대 1개만 본다). 글 · 목록형은 스키마에서 목차를 빼면 된다.
- 포스터 바탕을 행동색으로 쓰면 디자인마다 명도가 크게 다르다. 글자는 `readableColors`의 행동 글자색(4.5:1 보장)만 쓴다.
- 편집 화면은 `design.layout`만 읽는다. `archetype`은 화면에 영향이 없다.
- 가상 프로필 입력 준비(`run-structured-profiles.ts`)는 프로젝트 기간을 항목 "기간"에 넣는다. `period`에도 채운다.

## 완료 기준

```
pnpm typecheck && pnpm test
pnpm test:infra integration.test.ts --maxWorkers=2
pnpm --filter @expresso/web build
# 유형마다 실행 ID 하나(폴더 구조 <실행>/<디자인>/<프로필>)
node scripts/library/renderer/verify-token-kit.mjs archetype-poster-2026-10-24
node scripts/library/renderer/verify-token-kit.mjs archetype-list-2026-10-24
node scripts/library/renderer/verify-token-kit.mjs archetype-poster-matrix-2026-10-24
node scripts/library/renderer/verify-token-kit.mjs archetype-list-matrix-2026-10-24
```
