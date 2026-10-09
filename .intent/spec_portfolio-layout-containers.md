---
title: 모델이 구성하는 포트폴리오 지면 레이아웃
slug: portfolio-layout-containers
stage: spec
status: accepted
intent: .intent/intent_portfolio-layout-containers.md
date: 2026-10-09
---

# 모델이 구성하는 포트폴리오 지면 레이아웃 — 명세

## 요구사항

- [ ] R1. 카탈로그에 컨테이너 세 종류가 있다. `Columns`(두 열, `variant`=`even`·`wide-start`·`wide-end`), `Grid`(같은 폭 2–3열, `variant`=`even`), `Band`(배경이 있는 묶음, `variant`=`panel`·`accent`).
- [ ] R2. 트리 규칙: 깊이는 `page → 컨테이너 → 요소`까지다. 컨테이너 안에 컨테이너·`NameIntro`·`Contact`를 넣을 수 없다. 컨테이너 자식 수는 `Columns` 2개, `Grid` 2–3개, `Band` 1–3개다. 컨테이너는 최대 4개, 각각 `page.children`에서 한 번만 참조한다. 모든 요소는 트리에서 정확히 한 번 나타나고, 참조되지 않는 요소가 없다. `NameIntro`는 `page.children`의 첫 요소, `Contact`는 마지막 요소다.
- [ ] R3. `structuredModelSchema`는 선택적 컨테이너 키 `group-1`…`group-4`를 제공한다. `page.children`은 고정 길이 순열이 아니라 요소 ID·컨테이너 ID의 배열이다. R2는 `validateStructuredPortfolio`가 모델 출력과 직접 편집에 똑같이 적용한다.
- [ ] R4. 컨테이너가 없는 저장 Spec(`library-selection-rerender-2026-10-09` 세 개)을 다시 렌더링한 HTML이 PR #56 결과와 바이트 단위로 같다.
- [ ] R5. 컨테이너는 900px 이하에서 한 열이 되고, 390·926·1440px에서 가로 넘침이 없으며, JavaScript 없이 표시된다.
- [ ] R6. 편집 화면은 트리를 따라 모든 사례를 나열한다. 유형·원본 교체와 문장 편집은 컨테이너 안에서도 동작한다. 위·아래 이동은 같은 부모 안에서만 일어나고, 저장 후 컨테이너 구성이 보존된다.
- [ ] R7. 실행 스크립트가 `PORTFOLIO_AI=claude-code`로 Sonnet을 호출할 수 있다. qwen 실행(준비된 입력 3개)과 Sonnet 실행(입력 정리 포함 3개)이 각각 실행 기록으로 남는다.
- [ ] R8. 검증 기록과 비교 페이지가 프로필별 지면 구성(컨테이너 트리 표기), 서로 다른 구성 수, 토큰·시간을 적는다. 세 결과의 구성이 같아도 검증은 실패하지 않고 그 사실을 기록한다.

## 설계

**계약(`packages/contracts/src/structured-portfolio.ts`)** — `StructuredNodeSchema`에 컨테이너 세 종류를 추가한다. 자식은 json-render의 기본 slot인 `children`만 쓴다. 기존 `leaf()`와 `StructuredPortfolioSpecSchema`는 그대로 둔다. `validateStructuredPortfolio`는 지금의 `root.children` 검사를 트리 순회로 바꾼다. 루트에서 깊이 우선으로 요소를 모아 R2를 검사하고, 모은 요소 목록에 지금의 내용 검사(사례 참조, 갤러리 이미지, 과정 설명 수, 보조 섹션 수, 경력·근거 누락)를 그대로 적용한다. 요소 수 상한 25는 섹션 16개·보조 요소 5개·컨테이너 4개·페이지를 담도록 30으로 올린다.

**모델 계약** — `structuredModelSchema`의 `elements`에 `group-1`…`group-4`를 선택 키로 둔다. 컨테이너 `type`은 세 종류의 enum, `props.variant`는 다섯 값의 enum, `children`은 컨테이너에 넣을 수 있는 요소 ID의 enum 배열(1–3개)이다. `type`과 `variant`의 짝은 도메인 검사가 확인한다. 지금 모델 계약이 쓰는 문법(객체·enum·배열)만 사용하고 type별 union은 쓰지 않는다.

**렌더러(`packages/portfolio-renderer`)** — `structuredCatalog`에 세 컨테이너를 `slots: ["default"]`로 등록하고 설명을 단다. 이 설명이 그대로 프롬프트에 실린다. 레지스트리는 `div.sp-group[data-group][data-variant]`에 자식을 그린다. CSS는 `styles.ts`에 둔다. 기존 배치 규칙 중 `.sp-page[data-layout=…]>` 직계 선택자로 여백을 주는 규칙은 컨테이너 안에서 적용되지 않으므로, 컨테이너 안 요소의 여백·경계선 규칙을 따로 둔다.

**프롬프트(`structured-generator.ts`)** — 컨테이너 규칙과 짧은 예시 하나를 넣는다. "이 순서는 유효한 시작 예시" 문장에 컨테이너를 쓰는 경우를 더한다. 사용자 스타일로 고정되는 `design.layout`은 그대로 두고, 같은 배치 안에서 구성을 바꿀 수 있게 한다.

**편집 화면(`StructuredPageProperties.tsx`)** — 섹션 목록을 트리 순회로 만들고, 각 항목에 부모 요소 ID를 붙인다. 위·아래 이동은 부모의 `children` 배열 안에서 바꾼다. 최상위에서는 지금처럼 소개 앞·연락처 뒤로 가지 않는다. 컨테이너 안 항목에는 어느 묶음에 속하는지 표시한다.

**실행·검증 스크립트** — `run-structured-profiles.ts`에 `PORTFOLIO_AI=claude-code`를 추가해 `ClaudeCodeAiClient`를 쓴다. 이 경우 `model-record.json`의 `raw`에는 CLI가 돌려준 구조화 출력을 JSON으로 직렬화해 남긴다. `verify-structured-profiles.mjs`는 `sourceComposition`을 트리 표기(`Columns(even)[CaseTechnical:book, EvidenceGrid]`)로 바꾸고, 세 결과가 같다는 assertion을 서로 다른 구성 수 기록으로 바꾼다. `compare-runs.mjs`는 페이지 단위 측정값에 지면 구성을 추가한다.

## 버린 대안

- 이름 있는 slot(`slots: {start, end}`)으로 `Columns`를 표현하기 — React 렌더러만 지원하는 기능이고, 계약·모델 스키마·편집 화면이 모두 별도 필드를 다뤄야 한다. 기본 slot의 자식 순서로 같은 표현이 된다.
- 컨테이너별 props union — 공급자마다 JSON Schema 지원 범위가 달라 tuple을 공급자 공통 배열 문법으로 바꾼 적이 있다(커밋 `7058be93`). union도 공급자별 지원을 확인하지 않았으므로, 이미 쓰고 있는 enum과 도메인 검사로 같은 제약을 건다.
- 컨테이너 중첩 허용 — 모델 오류와 좁은 열의 넘침 위험이 커진다. 이번에는 한 단계만 연다.
- page 배치 프리셋(editorial·gallery·dossier) 추가 — 사용자 스타일이 있으면 배치가 고정되므로 다양성 문제를 풀지 못한다.

## 함정

- 수집 원본은 Tailwind 뷰포트 중단점(`md:`)을 쓴다. 1440px에서 `Grid` 세 열 안의 Feature 원본은 세 열 카드를 약 400px 폭에 그린다. 넘침 검사로 확인하고, 넘치면 원본이 있는 사례를 세 열 `Grid`에 넣지 못하게 도메인 검사로 막는다.
- 사용자 스타일이 있으면 `design.layout`이 고정된다(`fixedLayout`). editorial·dossier 배치는 페이지 자체가 두 열이므로 컨테이너가 본문 열 안에 들어간다.
- 편집 화면은 `root.children[0]`을 소개로 가정한다. 이 가정은 R2로 유지된다.
- 로컬 qwen이 컨테이너를 쓰지 않을 수 있다. 이것은 결과로 기록하고, 프롬프트를 계속 고쳐 원하는 결과를 만들지 않는다.
- Sonnet 실행은 이 Mac의 Claude 사용량을 쓴다. 실행 수는 프로필 3개 × 1회로 제한한다.

## 완료 기준

```bash
pnpm typecheck && pnpm test                   # 계약·렌더러·백엔드·웹 통과
pnpm test:infra structured.mongo.integration.test.ts --maxWorkers=1   # 중첩 Spec 저장·편집 포함
node scripts/library/renderer/check-collected-runtime.mjs --browser
PORTFOLIO_RUN_ID=library-layout-qwen-2026-10-09 services/backend/node_modules/.bin/tsx scripts/library/renderer/run-structured-profiles.ts
PORTFOLIO_AI=claude-code PORTFOLIO_NORMALIZE=1 PORTFOLIO_RUN_ID=library-layout-sonnet-2026-10-09 services/backend/node_modules/.bin/tsx scripts/library/renderer/run-structured-profiles.ts
node scripts/library/renderer/compare-runs.mjs library-selection-rerender-2026-10-09 library-layout-qwen-2026-10-09
node scripts/library/renderer/verify-structured-profiles.mjs library-layout-qwen-2026-10-09
node scripts/library/renderer/verify-structured-profiles.mjs library-layout-sonnet-2026-10-09
```

1440·390px 화면에서 컨테이너 배치, 편집 화면의 컨테이너 안 사례 편집·이동·저장을 확인한다.
