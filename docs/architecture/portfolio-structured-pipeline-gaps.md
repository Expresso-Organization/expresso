# 구조화 생성 파이프라인의 구조적 결함

2026-10-20 기준, `feat/portfolio-token-kit`(2249581c)의 코드와 체험 서버 실측으로 정리했습니다. 동작 설명은 [구조화 포트폴리오 생성](./portfolio-structured-pipeline.md)에 있고, 이 문서는 그 구조에서 화면 품질을 떨어뜨리는 결함과 해결 순서를 다룹니다.

치명 결함은 둘입니다. **모델이 디자인을 모르고 배치하고, 그린 결과를 보지 않습니다.** 컴포넌트를 늘리는 것만으로는 둘 다 해결되지 않으므로 컴포넌트 보강보다 먼저 고칩니다.

## 현재 구조

생성은 모델 호출 두 번입니다.

1. **내용 정리** — 출처 자료(커리어 기록·답변·공고 요건)를 `StructuredContentModelSchema`로 정리합니다. 섹션마다 제목·요약·본문·`pattern`·항목(`details`)·이미지·근거 ID를 냅니다.
2. **Spec 생성** — 정리된 내용을 보고 json-render Spec(요소 트리)을 냅니다. 사례 유형, 첫 화면 구도, 목차 형태, 컨테이너 배치를 고릅니다. 프롬프트는 [`structuredSpecPrompt`](../../services/backend/src/modules/page/structured-generator.ts)가 만듭니다.

Spec 생성 호출이 받는 정보는 세 가지입니다.

- **카탈로그 설명**: 컴포넌트마다 한 줄씩([catalog.ts](../../packages/portfolio-renderer/src/catalog.ts)의 `description`). 예: CaseEssay "문장과 판단을 읽는 기사형. 설명이 긴 자료에 적합합니다."
- **입력 특징**: 섹션의 원문이 아니라 요약입니다. 제목·요약·`pattern`, 본문 글자 수, 이미지 수와 대체 텍스트, 항목 이름과 항목 내용 앞 160자, 경력·근거 개수, 연락처 유무([structured-generator.ts:74](../../services/backend/src/modules/page/structured-generator.ts)).
- **규칙문**: 이미지 없는 섹션에 CaseGallery 금지, CaseProcess는 항목 두 개 이상, ProjectIndex 필수, 첫 화면 구도 선택 기준.

출력 스키마(`structuredModelSchema`, [structured-portfolio.ts:300](../../packages/contracts/src/structured-portfolio.ts))는 이미지가 없으면 CaseGallery와 첫 화면 `media`를 빼고, `design.layout`을 한 값으로 고정합니다. 생성 뒤 검사(`validateStructuredPortfolio`)는 구조만 봅니다 — 모든 섹션이 한 번씩 나오는지, 소개가 처음이고 연락처가 끝인지, 참조가 맞는지, 컨테이너 자식 수가 맞는지. 어긋나면 오류를 붙여 다시 요청합니다.

## 결함

### 1. 디자인을 모르고 배치한다 (치명)

Spec 프롬프트가 디자인에 대해 알리는 것은 한 문장입니다([structured-generator.ts:75](../../services/backend/src/modules/page/structured-generator.ts)).

> 색·서체·간격은 사용자가 고른 디자인 시스템이 정합니다.

고른 판이 단일 열(Clarity)인지, 촘촘한 격자(Linear Midnight)인지, 섹션 머리를 왼쪽 단에 두는 넓은 여백(Monochrome)인지 모델은 모릅니다. 컴포넌트 규칙(chrome · marker · emphasis · divider)과 본문 폭도 모릅니다. 그래서 같은 Spec이 디자인에 따라 좋게도 나쁘게도 그려지고, 모델은 그 차이를 고려할 수 없습니다.

렌더러에도 같은 원인의 불일치가 있습니다. 넓은 여백 배치 규칙은 컨테이너 밖 블록에만 적용됩니다([kit-styles.ts:150](../../packages/portfolio-renderer/src/kit-styles.ts), 선택자 `.xp-inner>.xp-block`). 모델이 사례를 Columns에 넣으면 그 사례만 디자인의 배치를 잃어, 한 페이지 안에서 배치가 섞입니다.

### 2. 그린 결과를 보지 않는다 (치명)

재시도는 계약 위반일 때만 일어납니다([structured-generator.ts:244](../../services/backend/src/modules/page/structured-generator.ts) "모델이 고칠 수 있는 Spec 검사 실패만 다시 요청합니다. 렌더링은 검사를 통과한 뒤 한 번만 합니다"). 렌더링 뒤에는 넘침·한 글자 줄바꿈·좁은 칸·겹침을 아무도 재지 않고 그대로 저장합니다. 디자인 정적 검사(`designQa`)는 토큰 값만 보고 화면은 보지 않습니다.

가상 프로필 재렌더 검증(`scripts/library/renderer/verify-token-kit.mjs`)에서 실제로 나온 결함 — 행동 버튼 글자색 소실, 사례 번호 중복, 390px에서 접히지 않는 2단, 첫 화면 집중 분야 누락 — 은 모두 브라우저에서 재야만 보이는 것이었습니다. 이 검사는 지금 개발용 스크립트에만 있고 생성 경로에는 없습니다.

### 3. 자료 내용과 컴포넌트를 잇는 기준이 없다

카탈로그 설명이 한 줄씩이고, "수치가 둘 이상이면 강조한다", "전후 비교면 막대로 보여 준다" 같은 연결이 없습니다. 그런 컴포넌트 자체도 아직 없습니다. 지난 실제 생성의 선택 이유(rationale)는 근거가 이미지 유무와 항목 모양뿐이었습니다.

> 이미지가 전혀 없는 자료라 전시형 대신 서술형 구성을 택했다. … 소개와 스킬 섹션은 항목표 위주라 ContentPanel로 …

### 4. Spec 단계는 원문을 보지 않는다

본문은 글자 수만, 항목은 앞 160자만 봅니다. 수치나 단계가 본문에 있어도 선택에 반영되기 어렵습니다. 같은 자료로 만든 자유 생성(모델이 HTML을 직접 작성)은 원문의 수치를 첫 화면에 세우고 흐름도와 전후 막대를 그렸습니다. 구조화 생성은 그 판단에 필요한 정보를 Spec 단계 전에 잃습니다.

### 5. `pattern`이 기준 없이 정해진다

내용 정리 계약의 `pattern`은 `z.enum(["project", "about", "skills", "career"])` 하나이고 설명(`describe`)이 없습니다([structured-portfolio.ts:36](../../packages/contracts/src/structured-portfolio.ts)). 내용 정리 시스템 프롬프트에도 판정 기준이 없습니다. 모델은 enum 이름만 보고 고르는데, 이 값이 Spec 단계의 판단과 키트 표시(역량이면 태그)를 함께 바꿉니다. 실제 생성에서 역량 섹션의 태그가 기술 이름 대신 항목 이름(언어 · 워크플로 · 스트리밍)으로 나온 것이 여기서 이어졌습니다.

### 6. 쓰이지 않는 Spec 값이 남아 있다

- `design.palette` · `design.font`는 키트가 읽지 않습니다. `design.layout`도 디자인 판의 `composition.layout`이 대신합니다. 모델은 쓰이지 않는 값을 고르는 데 판단을 씁니다.
- `PortfolioPage` 설명에 "library=수집 원본의 전면 구도"가 남아 있습니다([catalog.ts:32](../../packages/portfolio-renderer/src/catalog.ts)). 새 생성은 수집 원본을 쓰지 않습니다.

## 자유 생성과의 실측 비교 (2026-10-16)

같은 체험 브루·레시피, 같은 Linear Midnight 판, 같은 모델(claude-sonnet-5)로 한 번씩 생성했습니다. 둘 다 첫 시도에 성공했습니다.

| | 구조화 생성(토큰 키트) | 자유 생성(`PAGE_GENERATION_FORMAT=html`) |
|---|---|---|
| 모델 호출 | 2회 | 1회 |
| 작업 생성 → 완료 | 3분 52초 | 6분 25초 |
| 출력 토큰 | 25,058 | 28,293 |
| 캐시 생성 / 읽기 토큰 | 188,148 / 0 | 86,996 / 233,612 |
| 비용(Claude Code CLI `total_cost_usd`) | $1.00 | $1.74 |

- **시각 품질은 자유 생성이 앞섰습니다.** 수치 강조, 파이프라인 흐름도, 전후 막대, 장애 추적 타임라인을 자료에서 골라 그렸습니다.
- **정확성과 일관성은 구조화 생성이 앞섰습니다.** 자유 생성은 지원자 이름이 없고(출처 없는 "evt / log"가 들어감), 경력·근거 섹션과 근거 링크가 빠졌고, 1440px에서 글자 겹침, 좁은 칸의 단어 단위 줄바꿈, 제목이 본문 뒤에 오는 읽기 순서가 있었습니다.
- **출력 토큰 대부분은 결과물이 아닙니다.** 저장된 결과물의 UTF-8 바이트 수(토큰 수의 상한)는 구조화 약 10,500, 자유 약 12,400입니다. 나머지는 사고(thinking) 토큰과 거절된 도구 호출입니다. 자유 생성의 캐시 읽기는 한 호출 안에서 턴이 이어졌다는 뜻이고, 시간 차이도 여기서 나온 것으로 보입니다. 호출별 사고 토큰과 턴 수는 기록하지 않아 확인하지 못했습니다.
- **표본이 한 번씩입니다.** 비용은 CLI 경로의 값이라 CLI 자체 시스템 프롬프트가 입력에 포함됩니다. API를 직접 부르는 경로의 절댓값과 다릅니다.

10월 초 비교([portfolio-generation-comparison.md](./portfolio-generation-comparison.md))도 같은 양상이었습니다 — 구조화 생성이 더 정돈됐고, 자유 생성이 사례와 근거를 더 풍부하게 표현했습니다.

## 방향

json-render 방식을 유지합니다. 자유 생성이 잘한 것은 대부분 "자료를 어떤 표현에 담을지"의 판단이고, 그 판단은 카탈로그 선택으로 표현할 수 있습니다. 자유 생성은 새 표현 방식을 찾는 실험 도구로 씁니다. 근거는 다음과 같습니다.

- 직접 편집(`editComposition`)은 구조화 지면에서만 됩니다.
- 디자인 판을 렌더링 시점에 받으므로 디자인을 바꿔 다시 그리는 데 모델 호출이 필요 없습니다.
- 이름·전체 섹션·근거 연결이 계약으로 보장됩니다.

페이지 짜임새 자체의 한계(어떤 디자인을 골라도 "문서"로 보이는 문제)와 레퍼런스 사이트 81곳의 유형 분류는 [포트폴리오 사이트 유형 조사](./portfolio-archetype-research.md)에 있습니다.

## 해결 순서

1. **디자인 배치 범위** — 디자인 판(`composition.layout` · `density` · `componentKit` · `contentWidth`)에서 칸 수, 칸별 실제 폭, 쓸 수 있는 컨테이너·변형, 머리 위치를 계산하는 함수를 렌더러 패키지에 하나 둡니다. 출력 스키마는 이 결과로 선택지를 좁히고(칸 폭이 사례 최소 폭보다 좁아지는 조합 제외), 프롬프트는 같은 결과를 문장으로 받고, 키트는 같은 값으로 그립니다. 컨테이너 안 사례의 배치 불일치를 함께 고칩니다. 쓰이지 않는 `palette` · `font` · library 설명을 걷어냅니다.
2. **생성 루프 안의 브라우저 측정** — Spec 생성 → 렌더 → 390 · 926 · 1440px 측정 → 결함이 있으면 측정값을 모델이 읽을 문장으로 붙여 Spec 재요청. 측정 항목은 `verify-token-kit.mjs`의 검사(가로 넘침, 한 글자 줄바꿈, 열 이탈, 대비, 서체 적용, 좁은 칸)를 제품 코드로 옮긴 것입니다. 재요청은 구성(변형·사례 유형·컨테이너)만 바꾸고 1~2회로 제한하며, 측정값이 나아진 판만 채택합니다. 측정 기록은 `qaReport`에 남깁니다.
3. **내용 계약 확장** — 내용 정리가 원문에서 수치(값 · 단위 · 비교 기준), 단계, 전후 값을 따로 뽑아 계약에 담고, 각 값의 출처를 숫자 출처 대조로 검사합니다. `pattern`에 판정 기준을 넣습니다. 반복 문장과 "하지 않은 일"(기록 없음 · 미기록 영역) 노출도 여기서 고칩니다.
4. **자료 모양에 따른 선택지** — Spec 입력 특징에 자료 모양(수치 n개, 전후 비교, 단계 n개)을 넣고, 출력 스키마가 자료 모양에 맞는 컴포넌트만 선택지에 넣습니다. 지금 이미지가 없으면 CaseGallery가 빠지는 것과 같은 방식입니다.
5. **컴포넌트 보강** — 수치 강조 줄, 단계 흐름, 차트(전후 비교 막대·비율 막대·sparkline). 차트는 서버 렌더링·JS 없음·디자인 토큰 재색칠 조건 때문에 라이브러리보다 자체 SVG·HTML 원시 부품이 맞습니다. 수집 후보와 판정은 [수치 강조 · 단계 흐름 · 차트 컴포넌트 수집 후보](./portfolio-visual-component-sources.md)에 있습니다.
6. **자유 생성과 재비교** — 같은 브루와 가상 프로필 3종, 디자인 3종으로 나란히 비교합니다. 그래도 자유 생성이 뚜렷하게 앞서면 방향을 다시 정합니다.
7. **화면을 보는 수선 에이전트** — 2의 브라우저 기반 위에서 측정으로 잡히지 않는 위계·균형을 보고 Spec을 고칩니다. HTML이 아니라 Spec을 고치므로 수선 뒤에도 계약 보장이 유지됩니다.

## 진행: 1단계 디자인 배치 (2026-10-20, `feat/portfolio-design-layout`)

- 렌더러 패키지의 `designLayout`이 디자인 판에서 배치 종류 · 본문 폭 · 제목 칸/본문 칸 폭 · 쓸 수 있는 컨테이너를 계산하고, 키트 CSS가 같은 상수로 만들어집니다. Spec 프롬프트는 `describeDesignLayout` 문단으로 고른 디자인의 배치를 알립니다.
- 넓은 여백 디자인은 출력 스키마에서 컨테이너를 고를 수 없습니다. 묶음 안에도 제목 칸을 두는 안과 묶음을 본문 칸에 넣는 안을 화면으로 비교했고, 둘 다 칸이 좁아지거나 빈 자리가 생겨 버렸습니다.
- 모델은 `design`(배치 이름 · 색 묶음 · 서체 종류)을 고르지 않습니다. 생성기가 저장 계약의 배치 이름을 채웁니다.
- 실측: 가상 프로필 3종 × 디자인 3종 모델 생성(`docs/library/previews/portfolio/runs/design-layout-2026-10-20/`)이 키트 브라우저 검사를 통과했고, Monochrome 3건은 컨테이너 0개입니다. 근거 문장에 "좌우 241/675 고정 배치", "컨테이너에 넣으면 그림과 항목표가 위아래로 쌓여 좌우 분할을 잃으므로" 같은 배치 언급이 나옵니다.
- 이 과정에서 토큰 키트 결함 두 개를 고쳤습니다. 과정형 사례(CaseProcess)가 사례 이미지를 그리지 않던 것, 넓은 여백에서 긴 섹션 제목이 본문 첫 행 높이를 늘려 태그가 키 큰 빈 상자로 보이던 것. 검증 스크립트에 이미지 누락 · 늘어난 태그 검사를 더했습니다.
- 남은 관찰:
  - Clarity(단일 열) 생성 일부에서 모델이 "단일 열이라 컨테이너를 쓰지 않는다"고 해석했습니다. 단일 열도 컨테이너를 쓸 수 있으므로 문단 표현을 다듬을 여지가 있습니다.
  - 9건 모두 첫 화면 구도가 split이었습니다. 이미지가 있는데도 media를 고르지 않았습니다. 구도 선택 기준은 3단계(내용 계약)와 함께 다룹니다.
  - 체험 서버 실제 생성(Monochrome)은 지면이 `ready`로 저장됐지만, 체험 계정의 생성 횟수 한도 소진으로 작업 상태가 `GENERATION_REJECTED`가 됐습니다. 생성 경로의 결함이 아니라 사용량 확정 단계의 한도입니다.

## 결정: 측정 브라우저 (2026-10-20)

2와 7은 운영 서버 워커에 실제 레이아웃 엔진이 있는 브라우저가 있어야 합니다. 지금 운영 서버 · 배포 스크립트 · 백엔드 의존성에는 브라우저가 없습니다.

**Playwright Chromium의 chrome-headless-shell을 워커에 설치해 씁니다.**

- 설치: `npx playwright install --with-deps --only-shell`. shell은 Playwright가 headless 실행 시 기본으로 쓰는 빌드이고, Chrome 문서가 자동 화면 캡처용으로 권합니다([Chrome headless shell](https://developer.chrome.com/blog/chrome-headless-shell), [Playwright browsers](https://playwright.dev/docs/browsers)).
- 운영: 워커마다 브라우저 프로세스 하나를 상주시키고 작업마다 context를 새로 만듭니다. `--single-process`는 Chromium이 지원하지 않아 쓰지 않습니다. 컨테이너에서는 `--disable-dev-shm-usage`를 씁니다.
- 폰트: 한 글자 줄바꿈 측정은 실제로 쓰인 폰트에 따라 결과가 바뀝니다. 서버에 한국어 대체 폰트(Noto Sans CJK 등)를 설치하고, 워커가 Google Fonts에 접근할 수 있게 하거나 폰트를 자체 호스팅합니다.
- 보조: Safari 확인이 필요해지면 Playwright WebKit을 보조 검사로 붙입니다.

검토하고 쓰지 않는 것:

| 대안 | 이유 |
|---|---|
| Lightpanda | README에 "No graphical rendering engine". 크기 측정 · 줄바꿈 검출 · 화면 캡처가 안 됩니다. AGPL-3.0 |
| jsdom · happy-dom · linkedom | 레이아웃이 없어 크기 값이 0입니다. DOM 사전 검사에만 쓸 수 있습니다 |
| Servo · Ladybird | 성숙도 부족(Servo 임베딩 crate 첫 릴리스 2026-04, Ladybird alpha 이전) |
| Playwright Firefox | Chromium보다 무겁고 이득이 없습니다 |
| Cloudflare Browser Rendering · Browserless · Browserbase · Steel(호스팅) | 엔진은 Chromium이고, 사용자 커리어 데이터가 외부로 나가며 네트워크 왕복이 더해집니다 |

아직 재지 않은 것: 작업당 context · page 생성 시간, 페이지당 메모리, 생성 1회당 늘어나는 시간. 2단계 구현에서 실측해 이 문서에 적습니다.
