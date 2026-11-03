# 수치 강조 · 단계 흐름 · 차트 컴포넌트 수집 후보

2026-10-20 조사. [구조적 결함 문서](./portfolio-structured-pipeline-gaps.md)의 해결 순서 5단계(컴포넌트 보강)에서 쓸 원본 후보입니다. 라이선스는 LICENSE 원문으로, 레지스트리 주소는 실제 요청 응답(200 등)으로 확인했습니다. 패키지를 설치해 렌더링해 보는 실험은 2026-10-26에 ECharts 하나만 했습니다(아래 「ECharts SSR 실측」).

## 판정 기준

- **서버 렌더링, JS 없음**: `renderToStaticMarkup`로 만든 HTML을 저장해 내보냅니다. 화면을 볼 때 클라이언트 JS가 돌지 않으므로 훅·`useEffect`·DOM 측정으로 내용이 정해지는 컴포넌트는 그대로 쓸 수 없습니다. 모션은 CSS만 씁니다.
- **토큰 재색칠**: 색·서체가 디자인 판의 CSS 변수에서 와야 38종 디자인에 똑같이 맞습니다. Tailwind 클래스 원본은 옮겨 적는 것을 전제로 받습니다.
- **390px**: 가로 흐름은 세로로 바뀌어야 하고, 글자가 읽을 수 있는 크기로 남아야 합니다.
- **허용형 라이선스**: MIT · Apache-2.0 · BSD · ISC. 유료 등급과 조건이 불분명한 라이선스는 뺍니다.

## 이미 수집한 원본

| 원본 | 해당 항목 | 판정 |
|---|---|---|
| Watermelon(MIT) | `stats-1`~`stats-4` | 1–3은 훅 없이 렌더링됨. 4는 hover 효과에만 훅. rgba 그러데이션이 하드코딩되어 토큰으로 옮길 양이 많음 |
| Watermelon | `chart`, `chart-2` | Recharts 의존. 아래 차트 판정에 따라 쓰지 않음 |
| Watermelon | `step-indicator`, `step-pager`, `pop-stepper`, `stepper`, `timeline` | 모두 `motion` 애니메이션이나 입력·끌어 놓기 부품. 단계 흐름 용도에 맞지 않음 |
| diagram-design(MIT) | data-flow · process · flowchart · architecture · swimlane · timeline | 좌표를 고정한 SVG라 390px에서 세로로 바뀌지 않음. 시각 기준으로만 씀 |
| Componentry | — | 단계·흐름 부품 없음(`aurora-flow`는 배경 효과) |

## 수치 강조 줄

| 순위 | 원본 | 라이선스 | 수집 경로 | 판정 |
|---|---|---|---|---|
| 1 | Tremor Blocks KPI Cards 29종 | MIT ([LICENSE.md](https://github.com/tremorlabs/tremor-blocks/blob/main/LICENSE.md)) | 레지스트리 없음. GitHub 원본 파일 | 01–16 · 20–29는 훅 없이 렌더링. 17–19는 `useState`·AreaChart라 제외. `kpi-card-05`가 현재값 + "from 이전값" + 증감 구조라 "15분 → 4분"과 같은 모양 |
| 2 | shadcn/ui `dashboard-01`의 `section-cards.tsx` | MIT ([LICENSE.md](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md)) | `https://ui.shadcn.com/r/styles/new-york-v4/dashboard-01.json` | 훅 없음. 항목 전체를 받으면 의존 항목 19개가 함께 들어오므로 이 파일 하나만 추출 |
| 3 | HyperUI stats(application 6종, marketing 1–3) | MIT ([LICENSE](https://github.com/markmead/hyperui/blob/main/LICENSE)) | 레지스트리 없음 | Tailwind 클래스만 쓴 HTML. 옮길 양이 가장 적음 |
| 참고 | daisyUI `stat` | MIT | 레지스트리 없음 | 순수 CSS. `stat-title` / `stat-value` / `stat-desc` 마크업 구조 참고 |

제외: Magic UI `number-ticker`(서버에서 0이 렌더링되고 최종 값은 `useEffect`로만 나옴), shadcnblocks(라이선스 페이지가 AI 사이트 빌더 배포를 금지 사례로 명시), Shadcn Studio(Commons Clause), Preline(Fair Use License의 경쟁 제품 금지·권리 종료 조항), ReUI stats(개별 항목 401), Aceternity(자체 라이선스 · 유료 항목), Kibo UI(shadcnblocks와 같은 코드로 판단).

## 단계 흐름

| 순위 | 원본 | 라이선스 | 수집 경로 | 판정 |
|---|---|---|---|---|
| 1 | Origin UI(coss.com/origin) stepper 17종, timeline 12종 | `apps/origin`만 MIT ([LICENSE.md](https://github.com/cosscom/ui/blob/main/apps/origin/LICENSE.md)). 저장소 기본은 AGPL-3.0 | `https://coss.com/origin/r/stepper.json`, `/r/timeline.json` | `useState` 초기값으로 정적 렌더링됨. `orientation` 속성이 있어 세로 전환은 미디어 쿼리로 추가 |
| 2 | ReUI stepper · timeline(c-stepper 44종, c-timeline 12종) | MIT ([LICENSE.md](https://github.com/keenthemes/reui/blob/main/LICENSE.md)) | `https://reui.io/r/timeline.json` | 1과 같은 구조, 변형이 가장 많음. `@base-ui/react` 의존 |
| 3 | daisyUI steps · timeline | MIT ([LICENSE](https://github.com/saadeghi/daisyui/blob/master/LICENSE)) | 레지스트리 없음 | CSS만으로 `steps-vertical lg:steps-horizontal` 전환. 가로 파이프라인(수집 → 집계 → 적재)의 반응형 구조 기준 |
| 4 | HyperUI steps · timelines | MIT | 레지스트리 없음 | HTML + Tailwind |
| 5 | Flowbite stepper · timeline | MIT(공개 코드), Pro는 EULA | 레지스트리 없음 | 정적 마크업만 가져옴 |

노드·화살표 아키텍처 그림이 필요해지면 dagre(MIT)로 좌표만 계산하고 SVG는 직접 그리는 방식이 맞습니다. 제외: beautiful-mermaid(전이 의존성 elkjs가 EPL-2.0), React Flow(정적 렌더링은 되나 viewport 변환으로 세로 전환 불가), Mermaid CLI(puppeteer 필요, 요청 경로에 부적합), D2(MPL-2.0, Go 바이너리), Aceternity timeline · Magic UI animated-beam(DOM 측정 필요), Preline. Stepperize는 package.json에 MIT로 적혀 있으나 저장소에 LICENSE 파일이 없어 보류합니다.

## 차트

**라이브러리 대신 자체 SVG·HTML 원시 부품을 만듭니다.** 고정 viewBox SVG는 390px에서 글자까지 함께 줄어듭니다(600 너비 viewBox의 12px 라벨이 약 8px). 이 문제는 아래 모든 SVG 라이브러리에 공통입니다.

- **전후 비교 · 비율 · 진행 막대**: HTML/CSS 퍼센트 너비 막대. 값("15분 → 4분")은 막대 옆 HTML 글자로 둡니다. 참고: Tremor Raw `BarList` · `ProgressBar` · `CategoryBar`(div + CSS), Charts.css의 `--size` 방식.
- **sparkline**: 글자 없는 inline SVG(`viewBox` + `preserveAspectRatio="none"`), 좌표는 직접 계산, 색은 디자인 변수. `role="img"`와 `<title>`을 붙이고 수치는 HTML로 함께 표시합니다.

| 선택지 | 서버 렌더링, JS 없음 | 라이선스 | 판정 |
|---|---|---|---|
| Charts.css | 됨. 순수 CSS 표(5.9kb gz) | MIT | 막대 구조와 접근성(표로 읽힘) 참고 |
| Apache ECharts 6.1 | 됨. `ssr:true` + `renderToSVGString()` | Apache-2.0 | 축이 있는 차트가 필요해지면 후보. `var()` 색은 그대로 나가 칠해짐(실측). 이번 부품에는 쓰지 않음 |
| `@nivo/static` | 됨 | MIT | 무거움. `var()` 색 보정 미검증 |
| visx | 부분. `@visx/text` 폭 계산과 `ParentSize`가 DOM 의존 | MIT | 축·글자 부품을 빼면 가능 |
| Observable Plot | 부분. jsdom 등 가상 DOM 필요 | ISC | 축·라벨 규칙 참고 |
| Chartist 2.1 | 서버 API가 Experimental | MIT | 보류 |
| Recharts 2.15(고정 크기) | 부분. `ResponsiveContainer` 불가 | MIT | 구 메이저에 묶임 |
| Recharts 3.x · shadcn/ui charts · Tremor 차트 | 안 됨. 3.0–3.1에서 빈 출력([#5997](https://github.com/recharts/recharts/issues/5997)), shadcn chart가 Recharts 3 + `ResponsiveContainer` | MIT | 제외. shadcn의 `<style>`로 `--color-KEY` 주입하는 방식만 참고 |
| unovis · Frappe Charts | 프리릴리스 / DOM 대상 필요 | — | 제외 |

### ECharts SSR 실측

2026-10-26, `echarts@6.1.0`을 저장소 밖 폴더에 설치해 그렸습니다. 자료는 체험 브루의 전후 수치 두 개(LCP 3.8초 → 1.9초, 클라이언트 JS 420KB → 180KB)이고, 같은 자료를 토큰 키트의 전후 막대(`CaseBeforeAfter`, HTML/CSS)와 비교했습니다. 색은 옵션에 `var(--action)` · `var(--border)` · `var(--text)` · `var(--xp-muted)` · `var(--xp-accent-text)` 문자열을 넣었고, 디자인은 Clarity 변수입니다.

| 항목 | ECharts 고정 폭(`width:390`) | ECharts viewBox(`width:720`, `useViewBox`) → 390px | 키트 HTML/CSS 막대 |
|---|---|---|---|
| `var()` 색 | SVG `fill="var(--action)"` 그대로 출력. 변수를 가진 문서에 인라인으로 넣으면 디자인 색으로 칠해짐 | 같음 | 디자인 변수 |
| 390px 글자 | 지정한 13px 그대로 | 7–8px로 줄어 읽기 어려움 | 값 16px · 이름표 13.76px |
| 폭 대응 | 서버가 정한 폭 하나. 1440 · 390을 함께 맞추려면 판을 둘 그리거나 viewBox로 줄여야 함 | 폭은 따라가지만 글자도 함께 줄어듦 | 컨테이너 폭을 따라가고 글자 크기는 그대로 |
| 서체 | `font-family:sans-serif`가 글자마다 인라인. 디자인 서체를 쓰려면 `textStyle.fontFamily`에 변수를 따로 넣어야 함 | 같음 | 디자인 서체 |
| 용량(전후 두 쌍) | 2,776B · gzip 748B | 2,798B · gzip 762B | 985B · gzip 276B |
| 의존성 | 서버에 `echarts`(dist min 1.1MB). 브라우저에는 싣지 않음 | 같음 | 없음 |

**판정: 이번 부품(전후 막대 · 수치 강조 줄 · 과정 흐름 · 큰 인용 · 이미지 전시)은 HTML/CSS로 그립니다.** 막대 길이와 값 글자, 단계 연결선은 퍼센트 너비와 CSS 선으로 충분하고, 390px에서 글자가 줄지 않으며, 용량이 약 3분의 1입니다. ECharts는 `var()` 색 조건을 통과했으므로 축 · 눈금 · 여러 계열이 있는 시계열 차트가 필요해질 때 다시 후보로 둡니다. 그때는 폭마다 판을 따로 그리는 방식과 서체 변수 지정이 함께 필요합니다.

시각 참고로 모을 것: shadcn `chart-bar-*` 블록, bklit `stat-card-line-01`, livedocs `sparkline` · `comparison-chart` · `usage-meter`(livedocs 라이선스 미확인), Tremor `BarList` · `ProgressBar` · `CategoryBar` · `SparkChart` 화면.

## 확인하지 못한 것

- Recharts 3.10.1의 실제 SSR 출력, Nivo 출력 SVG의 `var()` 색 적용
- livedocs · ssych 차트 레지스트리의 라이선스
- Flowbite 블록별 무료 여부, Preline KPI 카드의 무료/Pro 구분
- HyperUI 단계 컴포넌트의 변형 개수
