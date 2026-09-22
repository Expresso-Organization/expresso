# 포트폴리오 컴포넌트 레퍼런스 조사

## 조사 결론

**오픈소스 코드와 디자인 사례를 함께 활용해, 실제 레시피로 검증한 포트폴리오 컴포넌트를 확보합니다.**

- 코드 확보는 Watermelon UI를 먼저 검토하고, 기술 설명은 diagram-design, 아이콘은 Rune Icons로 보완합니다.
- 히어로·사례·연락처의 표현은 Supahero, Unsection, Navbar Gallery, footer.design, Bento Grids에서 조사합니다.
- CodedVisuals 상용 라이선스는 AI 빌더 사용을 제한합니다. OriginKit·Kobra도 생성 결과와 소스 배포 방식에 맞춘 이용 범위 확인이 필요합니다.
- 완성된 컴포넌트는 json-render에 등록합니다. AI는 승인된 컴포넌트, 변형, 순서와 데이터 참조를 선택합니다.

조사일은 2026-09-22입니다. 사이트의 공식 소개·예제·저장소·약관과 일부 실제 브라우저 화면을 확인했습니다. 아래의 기능·이용 조건은 확인 사실이며, 적용 대상·우선순위·컴포넌트 이름은 익스프레소를 위한 제안입니다. 품질·속도·접근성은 실제 레시피를 넣은 구현 시험으로 확인해야 합니다.

- 작성자: Expresso · Codex
- 조사일: 2026-09-22
- 문서 버전: v1.1
- 상태: 조사 완료

조사 범위: 제공 자료의 성격, 이용 조건과 익스프레소의 json-render 기반 생성 파이프라인 적용 방안

실행 계획: [포트폴리오 컴포넌트·레퍼런스 수집 계획](./portfolio-component-collection-plan.md)

## 사이트별 활용 비교

| 사이트 | 제공 자료 | 우선순위 | 활용 경로 |
| --- | --- | --- | --- |
| [Watermelon UI](#watermelon-ui) | React 코드 · 블록 · 페이지 구성 | 우선 | 코드 이식 |
| [OriginKit](#originkit) | 애니메이션 코드 · 섹션 · 템플릿 | 조건부 | 코드 이식 · 모션 참고 |
| [CodedVisuals](#codedvisuals) | 코드 기반 시각 요소 · 장식용 일러스트 | 별도 허용 | 시각 참고 · 조건부 이식 |
| [Kobra](#kobra) | React UI · 모션 · 에이전트 UI | 조건부 | 편집기 UI 중심 |
| [Rune Icons](#rune-icons) | SVG · JSX 아이콘 | 보조 | 자산 이식 |
| [Motion / motionin.design](#motion--motionindesign) | 프롬프트 · 인터랙티브 섹션 참고 | 선별 | 새 컴포넌트 제작 참고 |
| [diagram-design](#diagram-design) | 에이전트 스킬 · HTML/SVG 다이어그램 | 우선 | SVG 컴포넌트 제작 |
| [Shoogle](#shoogle) | shadcn registry 검색 | 우선 | 후보 탐색 |
| [Navbar Gallery](#navbar-gallery) | 내비게이션 사례 갤러리 | 우선 | 배치 참고 |
| [Supahero](#supahero) | 히어로 사례 갤러리 | 우선 | 히어로 디자인 참고 |
| [404s.design](#404sdesign) | 404 페이지 사례 갤러리 | 후순위 | 서비스 오류 화면 참고 |
| [footer.design](#footerdesign) | 푸터 사례 갤러리 | 우선 | 마무리 섹션 참고 |
| [CTA.gallery](#ctagallery) | 행동 유도 영역 사례 갤러리 | 보조 | 연락·다운로드 표현 참고 |
| [Unsection](#unsection) | 섹션 단위 웹 디자인 참고 | 우선 | 섹션 구성 참고 |
| [Bento Grids](#bento-grids) | 그리드 사례 · 외부 템플릿 링크 | 선별 | 성과·기술 그리드 참고 |
| [60fps.design](#60fpsdesign) | 앱 모션 영상 · 동작 분석 | 보조 | 모션 사양 작성 |
| [Design Spells](#design-spells) | 디자인 세부 동작 갤러리 | 보조 | 상호작용 참고 |

우선순위는 생성할 포트폴리오의 섹션을 확보하는 목적을 기준으로 정했습니다. 편집기 개선에서는 Kobra와 모션 자료의 우선순위가 높아질 수 있습니다.

## 코드와 아이콘

### Watermelon UI

**우선** · React 코드 · 블록 · 페이지 구성 · 코드 이식

**확인한 내용.** 공식 사이트와 llms.txt는 컴포넌트, 블록, 대시보드, 템플릿, 여러 블록을 결합한 Showcases를 구분합니다. 연결된 Registry 저장소는 React 19·TypeScript·Tailwind CSS 4와 shadcn registry를 사용합니다. 공개 API와 MCP도 안내합니다.

**익스프레소 활용.** Hero, 프로젝트 소개, 성과 카드, 연락처, 푸터의 구현 후보를 찾습니다. Showcases에서는 여러 섹션을 결합했을 때의 여백과 위계를 함께 확인합니다. 범용 입력 UI는 레시피 편집기에서 활용할 수 있습니다.

**컴포넌트 연결.** 원본 파일과 의존성을 확인한 뒤 내용과 스타일을 props로 분리합니다. 앱 UI에는 기존 `--ex-*` 토큰을 연결하고, 공개 포트폴리오에는 선택한 디자인 토큰을 전달합니다. json-render에는 PortfolioHero나 ProjectSection처럼 의미가 있는 단위로 등록합니다.

**이용 조건.** 공식 watermellon-registry 저장소의 MIT LICENSE를 확인했습니다. 채택 파일에 별도 출처·라이선스가 있는지 추가 확인하고 고지를 보존합니다. 샘플 사진·폰트는 별도 자산으로 취급합니다.

**첫 검증 작업.** Blocks와 Showcases에서 히어로·프로젝트·연락처 후보를 골라 실제 한국어 레시피로 렌더합니다. 공개 API는 안내를 확인했으나 이번 직접 호출에서는 403을 받아 자동 수집 가능 여부를 확정하지 않았습니다.

**근거.** [사이트](https://ui.watermelon.sh) · [공식 탐색 안내](https://ui.watermelon.sh/llms.txt) · [Registry와 기술 스택](https://github.com/WatermelonCorp/watermellon-registry) · [MIT 라이선스](https://github.com/WatermelonCorp/watermellon-registry/blob/main/LICENSE)

### OriginKit

**조건부** · 애니메이션 코드 · 섹션 · 템플릿 · 코드 이식 · 모션 참고

**확인한 내용.** 브라우저에서 이미지 갤러리, 텍스트, 배경, 버튼 등의 분류와 컴포넌트 상세 진입을 확인했습니다. 공식 소개는 React·Next.js·TypeScript·Tailwind 코드 복사, Framer, 변수 편집기, AI 편집기와 MCP를 설명합니다. 별도의 Sections와 Templates도 제공합니다.

**익스프레소 활용.** 프로젝트 이미지 갤러리, 제목 등장, 성과 수치 강조를 보완하는 후보입니다. Gallery Tunnel, Blob Text Reveal 등의 표현을 참고하되 읽는 시간을 방해하지 않는 동작을 선택합니다.

**컴포넌트 연결.** 원본 코드의 외부 CDN·Framer 의존성, Canvas·WebGL 사용 여부를 먼저 확인합니다. motionPreset과 정적 표시를 분리하고 모션 감소 설정을 지원합니다. 정적 HTML 배포에는 정지 상태를 제공하고 동적 동작은 별도 런타임에서 검증합니다.

**이용 조건.** 자체 라이선스입니다. 일반 상업 앱과 내부 디자인 시스템 사용을 허용하지만 템플릿·키트 배포, 카탈로그 재배포·노출을 제한합니다. 익스프레소의 생성형 카탈로그 편입과 소스 내보내기 범위는 개별 확인 대상으로 둡니다.

**첫 검증 작업.** 필요한 컴포넌트를 소수 선정한 뒤 호스팅된 결과 제공과 코드 내보내기 시나리오를 구분해 허용 범위를 확인합니다. 라이선스 확인과 병행해 정적 상태의 디자인 적합성을 평가합니다.

**근거.** [소개](https://www.originkit.dev/intro) · [사용 조건](https://www.originkit.dev/docs/licensing) · [텍스트 모션 예시](https://www.originkit.dev/components/blob-text-reveal) · [섹션 예시](https://www.originkit.dev/sections/features-01)

### CodedVisuals

**별도 허용** · 코드 기반 시각 요소 · 장식용 일러스트 · 시각 참고 · 조건부 이식

**확인한 내용.** 공식 문서는 각 시각 요소를 React·TypeScript·Tailwind CSS 4·Motion으로 만든다고 설명합니다. Browser, Devices, Charts, Connections, AI Retrieval, Metrics 등의 분류와 shadcn registry 설치를 제공합니다. 일반 조작 UI와 함께 설명용 시각 요소가 중심입니다.

**익스프레소 활용.** 기술 프로젝트의 시스템 설명, 실제 스크린샷을 넣는 기기 프레임, 전후 성과 비교의 표현을 참고합니다. 라이브 데모처럼 보이는 장식용 데이터는 실제 프로젝트 성과와 구분합니다.

**컴포넌트 연결.** 도입이 허용된 범위에서 ProjectScreenshotFrame, ArchitectureIllustration, EvidenceMetric으로 감쌉니다. 무료 샘플은 장식용 aria-hidden 처리가 명시돼 있어 실제 근거를 전달할 때는 별도 접근 가능한 텍스트·표가 필요합니다.

**이용 조건.** 상용 라이선스는 사이트 빌더·AI 빌더·MCP 서버 등에서 사용자가 웹사이트나 파생 결과를 생성하는 용도를 명시적으로 제한합니다. 생성기 편입에는 별도 허용이 필요합니다. 공개 샘플 5개 파일은 별도 Free License이며 라이브러리 재배포 제한이 있습니다. 샘플 저장소 전체에 같은 권한이 적용되지는 않습니다.

**첫 검증 작업.** 초기에는 표현 참고로 사용합니다. 익스프레소 생성기에는 별도 계약을 확인한 항목만 넣습니다. 브라우저 프레임·수치 비교 같은 일반 패턴은 자체 컴포넌트로 설계할 수 있습니다.

**근거.** [분류](https://codedvisuals.com/visuals) · [기술 문서](https://codedvisuals.com/docs) · [상용 라이선스](https://codedvisuals.com/license) · [무료 샘플 범위](https://github.com/pixelcave/codedvisuals-free/blob/main/LICENSE)

### Kobra

**조건부** · React UI · 모션 · 에이전트 UI · 편집기 UI 중심

**확인한 내용.** 제공된 Input OTP 페이지에 TSX와 prompt.md 탭이 있습니다. Navigation, Carousel, Inline Citations, File Diff, Plan Card 등도 목록에 있습니다. 공식 가격 페이지는 Tailwind와 Base UI, shadcn API 호환을 설명합니다.

**익스프레소 활용.** 레시피 편집, 근거 표시, AI 수정 제안, 생성 상태와 같은 앱 화면에 적합한 후보입니다. OTP 자체는 인증 화면용입니다. 공개 포트폴리오의 큰 섹션 구성을 확보하는 목적에서는 우선순위가 낮습니다.

**컴포넌트 연결.** 기존 앱 레이아웃과 디자인 토큰에 맞춰 필요한 제어 컴포넌트만 검토합니다. 소리·모션 의존성을 분리하고 키보드 동작을 확인합니다. 포트폴리오 데이터 접근은 화면 어댑터에서 담당합니다.

**이용 조건.** 가격 페이지는 무료 항목을 개인 용도로 안내합니다. 유료 라이선스는 좌석 기반 상업 이용을 제공하며 소스의 공개 배포, 템플릿·컴포넌트 라이브러리 재배포를 제한합니다. 무료 표시만으로 상업 사용을 확정하지 않고 생성 결과·소스 내보내기는 별도 확인합니다.

**첫 검증 작업.** Inline Citations와 수정 비교 UI를 우선 검토합니다. 공개 포트폴리오용 카탈로그와 앱 편집기용 컴포넌트 목록을 구분해 견적·좌석·배포 범위를 확인합니다.

**근거.** [제공된 OTP 페이지](https://kobra.systems/components/input-otp) · [가격과 기술 안내](https://kobra.systems/pricing) · [이용 약관](https://kobra.systems/terms)

### Rune Icons

**보조** · SVG · JSX 아이콘 · 자산 이식

**확인한 내용.** 사이트에서 outline, duotone, fill, pixel, glass 스타일과 SVG·JSX 복사, 크기·선·색 편집을 확인했습니다. 공식 GitHub 저장소의 LICENSE는 Apache-2.0입니다.

**익스프레소 활용.** 연구 분야, 프로젝트 링크, 연락처, 기술 분류에 쓸 아이콘 후보입니다. 전체 레이아웃을 만드는 역할은 별도의 포트폴리오 컴포넌트가 담당합니다.

**컴포넌트 연결.** 허용 아이콘 목록을 만들고 JSON에는 iconKey만 노출합니다. 디자인마다 사용할 아이콘 스타일을 고정합니다. 현재 익스프레소 앱·문서의 Phosphor 규칙은 유지하고, 공개 포트폴리오 테마의 선택 자산으로 검토합니다.

**이용 조건.** Apache-2.0의 라이선스 사본, 변경 표시, 관련 저작권·NOTICE 보존 조건을 적용합니다. 배포 시 채택한 파일과 버전을 기록합니다.

**첫 검증 작업.** 포트폴리오에서 필요한 아이콘을 선정하고 작은 크기·명암 대비·정적 SVG 출력부터 확인합니다.

**근거.** [사이트](https://www.runeicons.com) · [저장소](https://github.com/Nexvyn/runeicons) · [Apache-2.0](https://github.com/Nexvyn/runeicons/blob/main/LICENSE)

## 검색과 컴포넌트 제작

### Motion / motionin.design

**선별** · 프롬프트 · 인터랙티브 섹션 참고 · 새 컴포넌트 제작 참고

**확인한 내용.** 공개 갤러리에 Portfolio, Hero, Interactive 등의 분류와 Free·Paid 필터가 있습니다. Aperture 상세 페이지에는 Copy Prompt와 Modulify에서 복제·편집·호스팅하는 경로가 보입니다.

**익스프레소 활용.** 이미지 중심 포트폴리오의 갤러리 전환, 작품 확대, 소개와 사례 사이의 이동을 연구합니다. 채용 담당자가 빠르게 내용을 확인해야 하는 기본 테마에는 읽기 흐름이 분명한 패턴부터 적용합니다.

**컴포넌트 연결.** 좋은 동작을 trigger · start · transition · end · mobile · reduced-motion 사양으로 정리한 뒤 자체 컴포넌트로 구현합니다. 프롬프트는 컴포넌트 제작 단계에 사용하고, 사용자별 생성 단계에서는 검증한 variant만 선택하게 합니다.

**이용 조건.** 공개 페이지에서 프롬프트 복사 기능은 확인했습니다. 전체 코드와 유료 자료의 재배포·생성 서비스 편입 권한은 확인되지 않았습니다. 코드나 원본 미디어를 도입할 때 해당 항목의 조건을 먼저 확보합니다.

**첫 검증 작업.** Aperture의 사진 확대·복귀 동작처럼 목적이 분명한 상호작용을 하나 선정해 키보드·터치·정적 대체 상태까지 구현 사양으로 정리합니다.

**근거.** [갤러리](https://www.motionin.design) · [Aperture 상세](https://www.motionin.design/gallery/aperture)

### diagram-design

**우선** · 에이전트 스킬 · HTML/SVG 다이어그램 · SVG 컴포넌트 제작

**확인한 내용.** 공식 저장소는 HTML+SVG 다이어그램 생성용 스킬과 예제를 제공합니다. 아키텍처, 데이터 흐름, 시퀀스, 타임라인, 상태 전이 등 기술 설명 유형을 포함하며 정적 출력이 기본입니다. React registry 패키지로의 연결은 추가 작업입니다.

**익스프레소 활용.** 개발·연구 포트폴리오의 ArchitectureDiagram, ProcessTimeline, ExperimentFlow, BeforeAfterArchitecture를 만드는 데 유용합니다. 글로만 설명하기 어려운 프로젝트 구조와 기여 범위를 표현합니다.

**컴포넌트 연결.** 검증한 SVG 배치를 React 컴포넌트로 옮기고 nodes·edges·labels를 구조화합니다. AI에는 관계와 강조 대상만 작성하게 합니다. 긴 한국어 라벨, 노드 수, 모바일 순서를 검증하고 그림 밖에도 요약을 제공합니다.

**이용 조건.** 저장소의 MIT LICENSE를 확인했습니다. 코드·예제에서 가져온 부분의 고지를 보존합니다. 다이어그램에 들어가는 고객·회사 자료의 공개 범위는 콘텐츠 단계에서 확인합니다.

**첫 검증 작업.** 시스템 구조와 프로젝트 진행 과정을 각각 실제 사례로 구성하고 정적 SVG 출력 품질을 확인합니다.

**근거.** [공식 저장소](https://github.com/cathrynlavery/diagram-design) · [MIT 라이선스](https://github.com/cathrynlavery/diagram-design/blob/main/LICENSE) · [공식 갤러리](https://cathrynlavery.github.io/diagram-design/)

### Shoogle

**우선** · shadcn registry 검색 · 후보 탐색

**확인한 내용.** 여러 registry의 컴포넌트·블록·템플릿을 검색하는 사이트입니다. 공식 MCP 페이지는 커뮤니티 registry 검색과 shadcn CLI 설치 경로를 안내하며 Alpha 상태를 표시합니다.

**익스프레소 활용.** portfolio hero, project gallery, timeline, bento, contact 같은 요구로 구현 후보를 찾습니다. 라이브러리별 누락 유형을 보충하는 검색 출발점으로 사용합니다.

**컴포넌트 연결.** 검색 결과에서 원본 registry·저장소·라이선스로 이동합니다. 선택한 파일과 버전을 익스프레소 내부 검수 과정에 넣고, 사용자 요청 시에는 검수 완료된 내부 목록을 사용합니다.

**이용 조건.** Shoogle의 검색 노출은 각 결과물의 이용 허가를 대신하지 않습니다. 권한은 원본 공급자의 조건을 항목별로 기록합니다. 원본 registry에서 설치할 때의 의존성도 확인합니다.

**첫 검증 작업.** 필요한 포트폴리오 역할별 검색어를 정하고 후보마다 원본 URL, 라이선스 URL, 의존성과 미리보기 링크를 수집합니다.

**근거.** [검색](https://shoogle.dev) · [MCP·CLI 안내](https://shoogle.dev/mcp) · [Registry 디렉터리](https://shoogle.dev/directory)

## 포트폴리오 레이아웃

### Navbar Gallery

**우선** · 내비게이션 사례 갤러리 · 배치 참고

**확인한 내용.** 정적·고정 상단 바, 드롭다운, 사이드바, 전체 화면 메뉴 등의 유형과 실제 사이트 링크를 제공합니다. 확인한 공개 화면은 사례 탐색 중심입니다.

**익스프레소 활용.** 짧은 포트폴리오의 상단 앵커 메뉴, 긴 사례 연구의 고정 목차, 모바일 메뉴를 설계합니다. 메뉴 항목 수와 현재 위치 표시 방식에 주목합니다.

**컴포넌트 연결.** PortfolioNav에 static·sticky·sidebar 변형을 정의합니다. sectionIds에서 링크를 생성하고 모바일에서 접히는 동작·초점 이동·스크롤 위치를 검증합니다.

**이용 조건.** 갤러리에서 원본 사이트와 사례를 확인할 수 있습니다. 재사용 코드 라이선스는 이번 조사에서 확인하지 못했으므로 구조와 동작을 참고해 자체 구현합니다.

**첫 검증 작업.** Static/Sticky와 Sidebar 유형에서 사례를 골라 짧은 문서와 긴 프로젝트 사례에 각각 적용해 봅니다.

**근거.** [갤러리와 유형](https://navbar.gallery)

### Supahero

**우선** · 히어로 사례 갤러리 · 히어로 디자인 참고

**확인한 내용.** 웹사이트 히어로 영역을 모은 갤러리입니다. 현재 첫 화면에는 screensdesign에 합류했다는 안내가 있습니다. 개인 포트폴리오와 제품 사이트 사례가 함께 보입니다.

**익스프레소 활용.** PortfolioHero의 타이포 중심, 인물 중심, 프로젝트 이미지 중심 변형을 확보합니다. 사례의 첫 화면에서 이름·역할·대표 작업이 어떻게 구분되는지 분석합니다.

**컴포넌트 연결.** 배치·서체 위계·이미지 비율·첫 화면 정보량을 기록합니다. 실명, 소개, 이미지 유무를 props로 받아 같은 배치가 다양한 사람에게 적용되는지 검증합니다.

**이용 조건.** 공개 갤러리 열람을 확인했습니다. 원본 코드·사진·브랜드 자산의 재사용 권한은 별도입니다. 개별 템플릿 링크가 있으면 해당 템플릿의 조건을 따로 확인합니다.

**첫 검증 작업.** 사진이 있는 사용자와 사진이 없는 사용자를 각각 지원할 히어로 방향을 선정합니다. Lando Norris, Folioblox 같은 목록 사례는 후보 탐색에 활용합니다.

**근거.** [히어로 갤러리](https://supahero.io)

### 404s.design

**후순위** · 404 페이지 사례 갤러리 · 서비스 오류 화면 참고

**확인한 내용.** 404 페이지를 모으고 스타일·산업·상호작용 태그와 원본 사이트 링크로 탐색하는 갤러리입니다. 개인 포트폴리오 사례도 포함합니다.

**익스프레소 활용.** 삭제된 공개 포트폴리오, 잘못된 주소, 유효하지 않은 프로젝트 링크의 안내 화면을 개선합니다. 정상 포트폴리오 지면의 컴포넌트 확장에는 직접 기여가 작습니다.

**컴포넌트 연결.** PortfolioNotFound에 문서 제목, 복귀 링크, 연락 경로를 명확히 표시합니다. 장식은 정보 전달과 복귀 동작이 확보된 뒤 추가합니다.

**이용 조건.** 확인한 범위는 사례 열람입니다. 원본 디자인·이미지·코드의 이용 조건은 각각 확인해야 합니다.

**첫 검증 작업.** 읽기 쉬운 문구와 명확한 복귀 동작을 가진 사례를 선정해 공개 페이지의 오류 상태를 정의합니다.

**근거.** [갤러리](https://www.404s.design)

### footer.design

**우선** · 푸터 사례 갤러리 · 마무리 섹션 참고

**확인한 내용.** 글자 크기, 그리드, 카드, 애니메이션, 명암 등으로 푸터를 분류하며 원본 사이트를 연결합니다. Typographic·Small Type·Large Type 등의 분류를 확인했습니다.

**익스프레소 활용.** 연락처, 이력서, 소셜 링크, 다음 프로젝트를 정리하는 PortfolioFooter와 ContactSection을 만듭니다. 첫 화면과 마지막 화면의 타이포 관계를 함께 설계합니다.

**컴포넌트 연결.** 연락 수단과 공개 허용 여부를 데이터로 받고 링크가 없는 경우의 배치를 준비합니다. 테마별 구분선·여백·타이포를 공유합니다.

**이용 조건.** 갤러리 열람과 원본 링크를 확인했습니다. 코드·디자인 자산의 포괄적인 재사용 허가는 확인되지 않았습니다.

**첫 검증 작업.** 간결한 연락처형과 큰 제목형을 골라 같은 포트폴리오의 마지막 섹션으로 비교합니다.

**근거.** [푸터 갤러리](https://www.footer.design/)

### CTA.gallery

**보조** · 행동 유도 영역 사례 갤러리 · 연락·다운로드 표현 참고

**확인한 내용.** Button, Download, Form, Modal, Navigation 등 유형별 CTA 사례와 원본·템플릿 링크를 제공합니다. 문구 작성 안내도 연결돼 있습니다.

**익스프레소 활용.** 이력서 다운로드, GitHub 방문, 논문 열람, 연락하기를 분명하게 표현합니다. 지원 목적과 관련된 대표 행동에 시각적 우선순위를 부여합니다.

**컴포넌트 연결.** ContactAction과 DocumentDownload에 검증된 URL과 파일 ID를 전달합니다. AI가 임의의 제출 기능을 만드는 대신 제품이 제공하는 동작을 연결합니다.

**이용 조건.** 사례 갤러리와 템플릿 판매·배포 경로가 섞여 있습니다. 개별 템플릿의 조건을 확인하며, 갤러리 수록만으로 소스를 재사용할 권한을 가정하지 않습니다.

**첫 검증 작업.** Download와 Button 분류를 중심으로 이력서·논문·프로젝트 링크에 쓸 패턴을 정리합니다.

**근거.** [CTA 갤러리](https://www.cta.gallery/)

### Unsection

**우선** · 섹션 단위 웹 디자인 참고 · 섹션 구성 참고

**확인한 내용.** 브라우저에서 Hero, Feature, CTA, Footer, Navbar, Contact, Portfolio 등의 분류와 Style·Type 필터를 확인했습니다. Website·Community 항목과 별도의 Templates 경로가 있습니다.

**익스프레소 활용.** 프로젝트 목록, 소개, 연락처처럼 특정 역할의 섹션을 찾는 데 적합합니다. 포트폴리오 전용 라이브러리에 부족한 섹션 유형을 보충합니다.

**컴포넌트 연결.** Portfolio·Feature·Contact 사례에서 이미지와 설명의 비율, 사례 간 구분, 섹션 경계를 기록합니다. Gallery·CaseStudy·Contact 컴포넌트의 구현 사양으로 전환합니다.

**이용 조건.** 공개 화면은 디자인 참고 갤러리로 확인했습니다. 계정 기능과 템플릿의 코드 제공·라이선스 범위는 개별 확인이 필요합니다.

**첫 검증 작업.** Portfolio 분류에서 긴 프로젝트 설명을 수용할 사례를 선정하고, 원본 사이트의 모바일 구성을 다음 단계에서 확인합니다.

**근거.** [갤러리](https://unsection.com) · [포트폴리오 분류](https://unsection.com/category/portfolio-section-design)

### Bento Grids

**선별** · 그리드 사례 · 외부 템플릿 링크 · 성과·기술 그리드 참고

**확인한 내용.** 브라우저에서 Web Design·Graphic Design·Animation과 명암 필터를 확인했습니다. Chroma, Kent C. Dodds, Koto 등의 사례와 원본 링크, 별도 템플릿 링크가 있습니다.

**익스프레소 활용.** 대표 프로젝트, 성과 수치, 기술 근거를 한 화면에서 훑는 EvidenceGrid를 설계합니다. 큰 사례와 짧은 근거의 중요도 차이를 크기와 위치로 표현합니다.

**컴포넌트 연결.** 임의의 열·행 숫자 대신 검증된 구성 변형을 제공합니다. 긴 사례는 상세 섹션으로 연결하고 모바일의 순서·높이·빈칸 처리를 테스트합니다.

**이용 조건.** 갤러리 사례와 외부 Figma·Framer·웹 템플릿의 권한은 각각 다릅니다. 무료 템플릿 안내만으로 전체 갤러리의 코드 이용 권한이 생기지는 않습니다.

**첫 검증 작업.** 실제 기록으로 큰 프로젝트 하나와 짧은 성과를 조합하고, 긴 한국어 내용이 카드에 갇히는 문제를 확인합니다.

**근거.** [갤러리](https://bentogrids.com)

## 모션과 상호작용

### 60fps.design

**보조** · 앱 모션 영상 · 동작 분석 · 모션 사양 작성

**확인한 내용.** 실제 앱의 모션 사례, 필터, Storyboards와 MCP를 제공합니다. MCP 안내에는 검색·동작 분해와 SwiftUI 코드 제공이 명시되어 있고 별도 구독으로 안내됩니다.

**익스프레소 활용.** 프로젝트 확대·복귀, 이미지 갤러리, 생성 상태와 편집 피드백의 타이밍을 연구합니다. 웹에 적용할 때는 터치·포인터 차이와 콘텐츠 읽기 흐름을 고려합니다.

**컴포넌트 연결.** 동작의 시작 조건·이동·정착·취소를 사양으로 정리하고 CSS나 Motion으로 구현합니다. SwiftUI 코드는 React에 맞춰 다시 구현해야 합니다. 정적 포트폴리오에도 읽을 수 있는 상태를 제공합니다.

**이용 조건.** MCP와 PRO는 별도 상품으로 안내됩니다. 레퍼런스 영상·분석·코드의 저장과 재배포 범위는 가입 시 조건을 확인합니다. 이번에는 공개 설명만 조사했습니다.

**첫 검증 작업.** Gallery·Shared Element·Reveal 유형에서 필요한 동작을 정하고, 기본 테마에는 읽기를 방해하지 않는 모션을 선택합니다.

**근거.** [사례 모음](https://60fps.design) · [MCP 기능·구독 안내](https://60fps.design/mcp)

### Design Spells

**보조** · 디자인 세부 동작 갤러리 · 상호작용 참고

**확인한 내용.** 공개 페이지에서 Mobile · Desktop · Interaction · Animation · Transition · Button · 404 등의 태그를 확인했습니다. 제품의 작은 동작과 시각적 세부 표현을 모으는 자료입니다.

**익스프레소 활용.** 프로젝트 카드 hover, 링크 피드백, 복사 완료, 이미지 전환, 편집 후 상태 표시를 다듬는 데 활용합니다. 큰 섹션을 확보한 뒤 마감 품질을 높이는 단계에 적합합니다.

**컴포넌트 연결.** 사례의 동작 목적을 먼저 적고 하나의 피드백으로 구현합니다. 모션 감소와 키보드 사용자에게 같은 정보가 전달되도록 합니다.

**이용 조건.** 이번에 확인한 공개 자료에서 코드 패키지나 포괄적 재배포 라이선스는 확인되지 않았습니다. 세부 동작을 참고해 자체 구현합니다.

**첫 검증 작업.** 익스프레소에서 실제로 필요한 완료·선택·복귀 동작을 정한 뒤 해당 태그의 사례를 추가 조사합니다.

**근거.** [공식 갤러리](https://designspells.com)

## 컴포넌트 라이브러리 구성

라이브러리는 코드 수와 함께 콘텐츠 대응 범위를 관리합니다. 같은 컴포넌트에 짧은 경력, 긴 사례, 이미지가 없는 기록, 여러 수치, 연구 도표를 넣어야 재사용 가능한 범위를 알 수 있습니다.

| 계층 | 저장할 것 | 참고 자료 |
| --- | --- | --- |
| 페이지 | 디자인 토큰, 읽기 폭, 섹션 간격, 내비게이션, 전체 순서 | Watermelon Showcases · Navbar Gallery |
| 섹션 | Hero · ProjectCaseStudy · CareerTimeline · EvidenceGrid · ContactSection | Watermelon · Supahero · Unsection · Bento Grids · footer.design |
| 시각 요소 | 스크린샷 프레임, 실제 수치, 아키텍처·과정 다이어그램 | diagram-design · CodedVisuals의 표현 참고 |
| 상호작용 | 등장, 확대·복귀, 선택, 완료 피드백과 정적 상태 | OriginKit · Motion · 60fps · Design Spells |
| 자산 | 아이콘, 사용자 이미지, 미디어 설명과 출처 | Rune Icons · 익스프레소 미디어 저장소 |

### 항목별 메타데이터

| 필드 | 기록 목적 |
| --- | --- |
| id · version · role · variants | AI가 선택할 안정적인 식별자와 표현 범위를 정의합니다. |
| sourceUrl · sourceRevision · licenseUrl · licenseStatus | 출처와 이용 조건을 확인한 버전을 고정합니다. |
| contentSchema · evidenceBindings | 제목·본문·수치·이미지와 근거 식별자를 연결합니다. |
| contentLimits · mediaRequirements | 항목 수, 긴 텍스트, 이미지 유무에 맞는 후보를 고릅니다. |
| themeCompatibility · layoutVariants | 서체·여백·배경·섹션 경계가 어울리는 조합을 정합니다. |
| runtime · dependencies · staticFallback | 정적 HTML 출력과 JavaScript 필요 동작을 구분합니다. |
| previewCases · qualityStatus | 실제 콘텐츠, 모바일, 모션 감소 상태의 검증 근거를 보관합니다. |

shadcn registry는 개발자가 소스 파일을 가져오는 경로입니다. json-render registry는 실행 중 JSON의 이름을 실제 컴포넌트와 연결하는 표입니다. 외부 소스를 이식·검수한 뒤 내부 json-render registry에 등록하는 단계가 필요합니다.

### 짧은 JSON 생성

콘텐츠는 확정된 레시피 스냅샷으로 제공하고, AI는 섹션 단위 컴포넌트와 변형을 선택하게 합니다. 아래는 제안한 전용 컴포넌트를 등록했다는 가정의 예시입니다.

```json
{
  "root": "page",
  "elements": {
    "page": {
      "type": "PortfolioPage",
      "props": { "theme": "editorial" },
      "children": ["project-a"]
    },
    "project-a": {
      "type": "ProjectCaseStudy",
      "props": {
        "variant": "image-led",
        "content": { "$state": "/content/projects/a" }
      }
    }
  }
}
```

라이브러리가 커지면 콘텐츠 형식·이미지 유무·선택 디자인·이용 조건으로 후보를 먼저 좁힙니다. 후보 선별은 익스프레소가 구현하고, json-render는 생성된 명세를 등록 컴포넌트로 표시합니다. 근거: [json-render Spec](https://json-render.dev/docs/specs) · [Registry](https://json-render.dev/docs/registry) · [Data Binding](https://json-render.dev/docs/data-binding).

### 정적 출력과 동적 동작

기존 익스프레소 배포는 HTML/CSS 스냅샷을 사용합니다. 정적 구조와 CSS 애니메이션은 이 경로에 맞출 수 있습니다. React 이벤트, Motion, Canvas·WebGL이 필요한 항목은 정적 대체 화면을 제공하거나 승인된 런타임을 배포하는 설계가 필요합니다. 외부 컴포넌트의 동작이 HTML 변환 후에도 유지되는지 항목별로 확인합니다.

## 도입 순서

1. **포트폴리오 구성 확보.** 실제 레시피로 히어로·프로젝트 사례·경력·성과·연락처를 구성합니다. 디자인 방향별로 완성 페이지를 만들어 섹션 사이의 조화를 확인합니다.
2. **출처별 구현 정리.** 코드 후보는 라이선스와 의존성을 기록하고, 갤러리 사례는 배치·타이포·모션 사양으로 전환합니다. 공통 props와 디자인 토큰을 적용합니다.
3. **고정 JSON 검증.** AI 호출 없이 실제 레시피를 표시합니다. 긴 한국어, 이미지 없음, 긴 URL, 소수 항목, 모바일, 인쇄·정적 출력을 검사합니다.
4. **AI 선택 연결.** 검증된 후보 안에서 컴포넌트·변형·순서를 선택하게 합니다. 콘텐츠와 근거의 식별자를 보존하고 잘못된 참조를 거절합니다.
5. **부분 편집과 배포.** 문장 수정·순서 이동·변형 변경에서 대상 밖의 내용을 보존합니다. 미리보기와 공개 배포의 결과를 비교합니다.

### 첫 검증 대상

| 대상 | 자료 조합 | 완료 판단 |
| --- | --- | --- |
| PortfolioHero | Supahero·Unsection의 배치 + Watermelon 코드 후보 | 사진 유무와 긴 소개문에서도 첫 화면의 정보 위계가 유지됩니다. |
| ProjectCaseStudy | Unsection 사례 + Watermelon 블록 | 문제·행동·결과와 원문 근거가 보존됩니다. |
| ArchitectureDiagram | diagram-design | 한국어 라벨과 연결 관계가 모바일에서도 읽힙니다. |
| EvidenceGrid | Bento Grids + 실제 성과 데이터 | 중요도와 읽기 순서가 분명하고 수치가 원문과 일치합니다. |
| PortfolioNav · ContactSection | Navbar Gallery·footer.design·CTA.gallery | 모바일 이동, 연락처 공개 상태, 실제 링크가 정상 동작합니다. |

### 기존 v2 작업과 연결

Recipe v2의 내용·순서·근거·표현 형식을 새 생성 입력에 연결합니다. 보류된 v2-library에서는 렌더링·검수 절차와 결함 사례를 참고합니다. 첫 비교는 현재 자유 HTML 결과, 고정 JSON 결과, AI가 구성한 JSON 결과에 같은 레시피를 넣어 수행합니다. 이 문서의 조사는 기존 v2 결과의 디자인 개선을 입증하는 실행 실험을 포함하지 않습니다.

설계 근거: [현재 생성 방법론](./architecture/portfolio-generation-methodology-v1.md). Recipe v2의 최신 계약과 형식 선택은 별도 portfolio-flow-spec 브랜치에 있어 실제 통합 시 해당 판을 대조해야 합니다.

## 확인 범위와 후속 조사

모든 제공 도메인을 조사했습니다. 웹 추출이 제한된 OriginKit, Rune Icons, Unsection, Bento Grids는 브라우저의 실제 페이지로 확인했습니다. Watermelon은 공식 llms.txt와 Registry 소스·LICENSE까지 확인했습니다. 단축 링크는 사용자가 함께 적은 원래 도메인을 기준으로 조사했습니다.

각 사이트의 모든 컴포넌트를 실행하거나 전수 평가한 것은 아닙니다. 공개 소개·분류·예제·약관으로 제공 범위와 활용 경로를 판단했습니다. 가격과 항목 수는 변동 가능하므로 구매·도입 판단에서는 최신 조건과 채택 파일을 다시 확인합니다.

| 후속 확인 | 현재 판단 |
| --- | --- |
| OriginKit 생성 카탈로그·소스 출력 | 상업 앱 사용 허용과 카탈로그·템플릿 배포 제한을 함께 확인했습니다. 제품의 실제 배포 방식에 대한 개별 확인이 필요합니다. |
| CodedVisuals 상용 라이브러리 | AI 빌더 사용 제한을 명시적으로 확인했습니다. 별도 허용이 있는 경우에만 생성기 편입 후보로 전환합니다. |
| CodedVisuals 무료 샘플 | 5개 지정 파일에 별도 Free License가 있습니다. 상용 전체 라이브러리와 분리해 권한을 검토합니다. |
| Kobra 무료·유료 이용 범위 | 무료 항목의 개인용 안내와 유료 좌석·소스 재배포 제한을 확인했습니다. 생성 결과와 공개 저장소 배포 범위를 추가 확인합니다. |
| Motion·갤러리·외부 템플릿 | 원본 코드나 자산을 가져올 때 해당 항목의 이용 조건을 확인합니다. 현재는 참고 자료로 분류합니다. |
| Watermelon API 자동 수집 | 공식 공개 API 안내는 확인했으나 직접 호출이 403으로 실패했습니다. API 접근 경로는 후속 검증 대상입니다. |

품질 평가는 실제 내용의 보존, 모바일 조판, 읽기 순서, 스타일 구분, 부분 수정의 정확성, 정적 출력의 일치 여부를 기준으로 합니다. 렌더링 오류가 없는 결과와 디자인이 좋은 결과를 각각 확인합니다.

## 변경 이력

- 2026-09-22 v1.0: 사이트별 제공 자료·이용 조건·적용 방향 조사
- 2026-09-22 v1.1: 내용과 출처를 유지한 Markdown 전환
