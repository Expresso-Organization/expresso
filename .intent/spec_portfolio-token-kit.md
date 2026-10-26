---
title: 디자인 시스템 토큰 기반 포트폴리오 섹션 키트
slug: portfolio-token-kit
stage: spec
status: accepted
intent: .intent/intent_portfolio-token-kit.md
date: 2026-10-16
---

# 디자인 시스템 토큰 기반 포트폴리오 섹션 키트 — 명세

시각 기준: 디자인 카탈로그 `DESIGN.html`의 섹션 예시(2026-10-16 결정). 히어로·프로젝트·사례·경력·스킬·연락 예시의 구성과 컴포넌트 규칙을 페이지 섹션으로 옮긴다.

## 요구사항

- [ ] 렌더러가 디자인 시스템 스펙(`DesignSystemSpecV2`)을 받는다. `renderStructuredPortfolio(spec, content, { design, theme })`이다. 키트 경로는 `design`만 쓰고(사용자 색은 `design`에 이미 반영), `theme`은 수집 원본으로 그리는 저장된 판의 사용자 색에만 쓴다. `design`이 없으면 저장된 판의 렌더러로 그린다.
- [ ] Spec의 어떤 요소에도 `sourceId`가 없으면 키트 경로로 그린다. 하나라도 있으면 지금 렌더러로 그린다(저장된 판 호환).
- [ ] 키트 경로의 CSS 맨 앞에 그 디자인의 Google Fonts `@import`를 넣는다. 서체 변수는 라틴 서체 → 한글 대체 서체 순서다. 고정 서체(Pretendard·JetBrains Mono·Outfit)는 키트 CSS에 쓰지 않는다.
- [ ] 키트 CSS는 토큰 변수만 쓴다.
  - 색 9개
  - 서체 3종과 글자 크기 단계·행간·자간·행 길이
  - 간격 5종, 모서리·테두리·그림자
  - 모션 시간·곡선
  
  컴포넌트 규칙 4종은 페이지 루트의 `data-chrome` · `data-marker` · `data-emphasis` · `data-divider`가 바꾸고, 배치·밀도는 `data-layout`(단일 열 · 촘촘한 격자 · 넓은 여백) · `data-density`가 바꾼다.
- [ ] 대비 보정 토큰을 렌더링 시점에 계산한다.
  - 보조 글자: 바탕·면 위 각각 4.5 이상
  - 강조색 글자: 바탕 위 4.5 이상
  - 행동 글자: 행동색 위 4.5 이상
  
  모자라면 글자색 쪽으로 가장 적게 섞은 값을 쓴다. 원래 토큰이 기준을 넘으면 그대로 쓴다.
- [ ] 섹션 대응. 컴포넌트 이름과 props는 유지하고 그리는 방식만 바꾼다.

  | 요소 | 키트 섹션(DESIGN.html 예시) |
  | --- | --- |
  | NameIntro | `variant` = `statement`(큰 문장) · `split`(좌우 분할) · `media`(이미지 중심, 이미지가 있을 때만). 이름이 가장 크고 바로 아래 한 문장 |
  | ProjectIndex | `rows` 번호 목록 · `mosaic` 카드 격자 · `rail` 측면 목차 |
  | CaseEssay | 긴 사례 연구 |
  | CaseTechnical | 문제-행동-결과 항목표 |
  | CaseProcess | 번호 단계 |
  | CaseGallery | 이미지 갤러리와 설명 |
  | ContentPanel | 본문. `pattern=skills`면 태그·숙련 근거 |
  | CareerTimeline | 세로 타임라인 |
  | EvidenceGrid | 근거 목록(펼침) |
  | Contact | 연락 블록 |
  | Columns · Grid · Band | 유지 |
- [ ] 계약: `NameIntro.props.variant`(선택)를 추가한다. 모델 스키마는 이미지가 없으면 `media`를 빼고 고르게 한다. 내용 정리 이후 Spec 생성 프롬프트에서 수집 원본 선택지와 `sourceId`를 뺀다. `PAGE_PROMPT_VERSION`을 올린다.
- [ ] 디자인 해석: `findPortfolioDesign({ designSystemRevisionId, templateId, styleOverrides })`가 순서대로 스펙을 정한다.
  1. 판 ID가 있으면 그 판
  2. 없으면 템플릿과 연결된 판(33종)
  3. 둘 다 없으면 Clarity
  
  `styleOverrides`의 배경·글자·강조 색은 스펙 색에 덮어쓴다. 생성기와 직접 편집(`editComposition`)이 같은 함수를 쓴다.
- [ ] 정적 품질 검사 `designQa(design)`를 `qaReport`에 넣는다.
  - 보정 뒤 대비 4종
  - 본문 단계 15px 이상
  - display·body 서체가 웹폰트 목록이나 시스템 서체에 있음
  
  하나라도 실패하면 `qaReport.status`가 `failed_qa`다. 38종 전부 통과하는 것을 테스트로 고정한다.
- [ ] 단일 출처: `cssVariables` · `WEB_FONTS` · `fontLink` · 대비 계산은 렌더러 패키지로 옮기고, 설계 문서 컴파일러가 가져다 쓴다. `DESIGN.html` 출력은 바이트 단위로 같아야 한다.
- [ ] 모든 키트 섹션은 JavaScript 없이 보이고, `prefers-reduced-motion`과 인쇄에서 모션이 꺼진다. 390px에서 한 열, 가로 넘침 없음.

## 설계

- `packages/portfolio-renderer/src/design-tokens.ts`(새 파일): `designTokenCss` · `fontImport` · `contrastRatio` · `ensureContrast` · `designQa` · `WEB_FONTS`. 컴파일러의 `cssVariables`와 `fontLink`를 옮겨 온다.
- `packages/portfolio-renderer/src/kit.tsx` · `kit-styles.ts`(새 파일): 키트 레지스트리와 CSS. 카탈로그는 기존 것을 공유하고 레지스트리만 둘로 나눈다(json-render 카탈로그 = 계약, 레지스트리 = 구현).
- `renderer.tsx`: 경로 분기, `design` 옵션, 크기 제한 검사는 그대로.
- 백엔드: `design-systems/index.ts`에 `findPortfolioDesign`. `page/service.ts`의 생성 문맥과 `editComposition`이 스펙을 넘긴다. 생성 문맥에 `design`을 추가한다(`PageGenerationContext.design`). 지면 스타일 문법(`PageStyleGrammar`)은 그대로 둔다.
- 생성기: Spec 프롬프트에서 수집 라이브러리 문단과 `sourceId` 지시를 뺀다. `structuredModelSchema`는 선택지가 비면 `sourceId`를 넣지 않는다(기존 동작). `NameIntro.variant` 지시를 넣는다.
- 검증 스크립트: `run-structured-profiles.ts`에 `PORTFOLIO_DESIGN=<code>`와 키트 재렌더(`PORTFOLIO_RERENDER_FROM` + `sourceId` 제거)를 더한다. `verify-structured-profiles.mjs`에 검사 두 가지를 더한다(한 글자 줄바꿈, 계산된 서체가 디자인 서체인지).

## 버린 대안

- **DESIGN.html이 실제 키트 컴포넌트를 그리게 바꾸기.** 카탈로그 미리보기와 결과가 완전히 같아지지만, 38종 문서와 해시가 모두 바뀌고 범위가 커진다. 후속 작업으로 둔다.
- **대비가 모자란 토큰을 카탈로그에서 고치기.** 디자인 원본을 바꾸는 일이라 이번 범위 밖이다. 렌더링 시점 보정만 한다.
- **글꼴을 `pageDocument`에 링크로 넣기.** 계약과 문서 래퍼를 바꿔야 한다. CSS `@import`는 지금 CSP(`style-src`에 Google Fonts 허용)에서 바로 동작한다.

## 함정

- `@import`는 스타일시트의 맨 앞이어야 한다. `pageDocument`는 지면 CSS를 별도 `<style>`에 넣으므로 키트 CSS 첫 줄이면 된다.
- 서체 이름 스택은 따옴표가 없다(계약 정규식). `cssFamily`로 감싼다.
- 생성 중 미리보기(`LivePreview`)는 `sink.delta`로 HTML·CSS를 받는다. 같은 CSS라 글꼴도 함께 온다.
- 저장된 판은 렌더링 결과(HTML·CSS)가 저장돼 있다. 키트는 새 생성과 다시 그리기부터 적용된다.

## 완료 기준

- `pnpm typecheck`, `pnpm test`, `pnpm test:infra integration.test.ts --maxWorkers=2`, 웹 빌드 통과.
- 새 테스트 통과:
  - 경로 분기
  - 토큰 변수
  - 대비 보정
  - 38종 `designQa` 통과
  - `DESIGN.html` 바이트 동일
  - NameIntro 변형
  - 디자인 해석 순서
- 가상 프로필 3종 × 디자인 3종(Clarity · Linear Midnight · Monochrome)을 1440·926·390px에서 그린다. 브라우저 검사(넘침, 한 글자 줄바꿈, 열 이탈, 대비, 서체 적용, JS 없는 표시)를 통과하고, 전후 화면을 `docs/library/previews/portfolio/runs/token-kit-2026-10-16/`에 남겨 사용자 확인을 받는다.
