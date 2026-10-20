---
title: 고른 디자인의 배치를 아는 Spec 생성
slug: portfolio-design-layout
stage: spec
status: accepted
intent: .intent/intent_portfolio-design-layout.md
date: 2026-10-20
---

# 고른 디자인의 배치를 아는 Spec 생성 — 명세

## 요구사항

- [ ] 렌더러 패키지에 `designLayout(spec: DesignSystemSpecV2)`가 있고, 배치 종류(`composition.layout`), 본문 폭(`spacing.contentWidth`), 섹션 머리 위치, 넓은 여백일 때 제목 칸·본문 칸 폭, 쓸 수 있는 컨테이너를 돌려준다. 넓은 여백 칸 비율·최소 폭은 이 모듈의 상수이고 키트 CSS가 같은 상수로 만들어진다.
- [ ] `describeDesignLayout(layout)`이 그 결과를 모델이 읽을 문단으로 만든다. Spec 프롬프트는 "색·서체·간격은 …" 문장과 `design.layout='…', design.font='…'` 지시 대신 이 문단을 넣는다. 38종마다 문단의 수치가 `designLayout` 결과와 같음을 테스트한다.
- [ ] 넓은 여백 디자인이면 출력 스키마에 컨테이너(Columns · Grid · Band)가 없고, 프롬프트에서 컨테이너 문단·예시가 빠진다(열린 질문 ③안, 2026-10-20 화면 비교로 결정). 단일 열 · 촘촘한 격자는 지금처럼 쓸 수 있다.
- [ ] 모델 출력 스키마의 `PortfolioPage.props`에 `design`이 없다. 생성기가 검사 전에 `design: { layout }`을 채운다(`layout`은 지금 `fixedLayout` 대응 그대로, 편집 화면이 읽는 값). 저장 계약의 `palette` · `font`는 선택 값이 되고, 기존 저장본은 그대로 통과한다.
- [ ] `PortfolioPage` 카탈로그 설명에서 editorial · gallery · dossier · library 구도 설명을 빼고, 배치는 고른 디자인이 정한다고 쓴다.
- [ ] `PAGE_PROMPT_VERSION` 12.
- [ ] 가상 프로필 3종 × 디자인 3종을 모델로 새로 생성해 키트 브라우저 검사를 통과하고, Monochrome 3종은 컨테이너가 없다. 체험 서버 실제 생성 1회가 성공한다.

## 설계

- `packages/portfolio-renderer/src/design-layout.ts`(새): `WIDE_MARGIN = { head: 1, body: 2.8, minHead: 150 }`와 열 간격(`componentGap * 2`)을 두고, `designLayout`·`describeDesignLayout`을 낸다. 제목 칸 폭 = `max(minHead, (contentWidth − gap) × head / (head + body))`, 본문 칸 = `contentWidth − gap − 제목 칸`. `kit-styles.ts`의 넓은 여백 규칙은 이 상수로 문자열을 만든다(지금 하드코딩된 `minmax(150px,1fr) minmax(0,2.8fr)`).
- `packages/contracts` `structuredModelSchema(content, choices)`: `choices.groups?: readonly StructuredGroupType[]`. 빈 배열이면 컨테이너 ID와 노드를 만들지 않는다. 페이지 props에서 `design`을 뺀다. `StructuredDesignSchema`의 `palette` · `font`를 `.optional()`로.
- `services/backend` `structured-generator.ts`: `context.design`이 있으면 `designLayout`으로 groups와 프롬프트 문단을 정한다. 없으면(디자인 없는 테스트 문맥) 지금 동작. 모델 출력에 `design: { layout: fixedLayout ?? "library" }`를 넣은 뒤 `validateRenderableSpec`. 스타일 보존 검사(`design.layout`·`font` 비교)는 지운다.
- 수집 원본 렌더러(`renderer.tsx`)는 `palette` · `font`가 없으면 속성을 쓰지 않는다(기존 저장본은 값이 있다).
- 검증 스크립트 `run-structured-profiles.ts`: 모델 생성 경로에도 `PORTFOLIO_DESIGN`을 받아 `design`을 문맥에 넣는다.

## 버린 대안

- ①안(묶음 안에도 제목 칸): 칸이 좁아져 "선택한 작업" 같은 제목이 꺾인다.
- ②안(묶음을 본문 칸 안에): 경계는 맞지만 묶인 사례가 좁아지고 왼쪽에 빈 자리가 생긴다.
- 모델이 `design`을 계속 내고 생성기가 덮어쓰기: 모델이 쓰이지 않는 값을 고르는 문제가 남는다.

## 함정

- 편집 화면(범위 밖)은 `root.props.design.layout`을 읽는다. 생성기가 `layout`을 채우므로 깨지지 않는다.
- `describeSpecSchema`는 스키마에서 요소 목록을 만든다. 컨테이너가 없을 때 `format.optional`이 비므로 `groupId` 기본값과 예시 문장을 함께 빼야 한다.
- 촘촘한 격자의 목차 두 칸은 키트 CSS 규칙이다. 문단 설명과 CSS가 어긋나지 않게 같은 모듈 설명을 쓴다.

## 완료 기준

```
pnpm typecheck && pnpm test
pnpm test:infra integration.test.ts --maxWorkers=2
PORTFOLIO_AI=claude-code PORTFOLIO_DESIGN=<code> PORTFOLIO_RUN_ID=design-layout-2026-10-20 … run-structured-profiles.ts   # 디자인 3종마다, 결과는 <실행 ID>/<code>/<프로필>
node scripts/library/renderer/verify-token-kit.mjs <실행 ID>
```
