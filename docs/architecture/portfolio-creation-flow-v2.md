# 포트폴리오 제작 흐름 v2 상세 기획

- 상태: 제품·아키텍처 기획 기준선
- 작성일: 2026-08-30
- 적용 대상: Expresso 웹 포트폴리오의 디자인 선택, 레시피 생성, 포트폴리오 생성, 생성 후 편집
- 관련 문서: [포트폴리오 생성 방법론 v1](./portfolio-generation-methodology-v1.md)

## 1. 문서 목적

이 문서는 Expresso의 포트폴리오 제작 위저드를 세 단계로 단순화하고, 생성 전 계획과
생성 후 맞춤 편집의 책임을 분리하는 기준을 정한다. 제품 화면, API 계약, 데이터 저장,
AI 호출, 비동기 상태, 이전 데이터 호환을 같은 흐름에서 설명한다.

이 문서를 읽은 제품·디자인·프론트엔드·백엔드 담당자는 다음 작업을 같은 기준으로
진행할 수 있어야 한다.

- 세 단계 위저드의 화면과 상태를 같은 용어로 정의한다.
- 디자인 시스템 산출물과 포트폴리오 생성 입력의 경계를 구현한다.
- Recipe v2 블루프린트의 요소, 기록 연결, 배치 편집 계약을 구현한다.
- 채용 공고 맞춤과 AI 인터뷰를 생성 후 편집 기능으로 연결한다.
- 기존 자유 HTML 페이지, 레시피, 공고 기반 제작 데이터를 보존하며 이전한다.

## 2. 결정 요약

포트폴리오 제작 위저드는 다음 세 단계로 구성한다.

```text
01 디자인 선택
      ↓
02 레시피 생성 · 블루프린트 편집
      ↓
03 포트폴리오 생성
      ↓
편집기
  ├─ 채용 공고 맞춤
  ├─ AI 인터뷰
  ├─ 커리어 기록 추가
  └─ 디자인·내용 수정
```

각 단계의 책임은 다음과 같다.

| 단계 | 사용자가 정하는 것 | 시스템이 만드는 것 | 저장 결과 |
| --- | --- | --- | --- |
| 디자인 선택 | 시각 방향, 허용된 변형 | 디자인 문서와 적용 규칙 | 디자인 시스템 판, `ReferenceLock` |
| 레시피 생성 | GUI에서 기록, 섹션, 요소, 순서, 표시 방식 편집 | 초기 블루프린트 GUI | Recipe v2 판 |
| 포트폴리오 생성 | 최종 생성 실행 | 카피와 자유 HTML/CSS | `generated_page` 판 |
| 생성 후 편집 | 공고, 답변, 적용할 제안 | 수정 제안과 파생 판 | 블루프린트·페이지 판 |

기본 제작은 디자인, 블루프린트, 선택한 커리어 기록만 사용한다. 사용자는 커리어
기록이 없어도 빈 블루프린트를 구성해 완결된 포트폴리오 초안을 만들 수 있다. 채용
공고와 AI 인터뷰는 생성 후 편집기에서 연결한다.

## 3. 제품 원칙

### 3.1 사용자 권한

디자인 선택, 기록 연결, 요소 순서, 표시 방식, 공고 맞춤 제안, 인터뷰 반영은 사용자가
확정한다. AI는 초안과 제안을 만들고, 적용 전 결과를 보여준다.

### 3.2 한 번의 최종 생성

기본 포트폴리오 페이지는 한 번의 페이지 생성 호출로 만든다. 레시피 생성은 내용과
구성을 계획하는 별도 호출이며, 최종 카피와 HTML/CSS는 포트폴리오 생성 단계에서
작성한다. 생성 결과는 사용자가 수정할 수 있는 페이지 판으로 보존한다.

### 3.3 빈 입력 허용

커리어 기록 선택은 선택 사항이다. 기록이 없는 요소에는 사용자가 작성한 의도와 자리
설명을 사용하고, 페이지 생성 모델이 읽히는 초안을 작성한다. 비어 있는 근거는 사용자
검토 정보로 남긴다.

### 3.4 자동 진행

디자인 생성, 회사 웹사이트 분석, 레시피 생성, 포트폴리오 생성, 공고 분석은 비동기
작업으로 실행한다. 화면은 상태를 자동으로 추적하고 완료 시 다음 화면이나 결과로
이동한다.

### 3.5 기술·보안 경계

소유권, 출력 스키마, HTML/CSS 소독, CSP, 외부 리소스, URL 수집 안전은 자동으로
검사한다. 내용의 강도, 구성 완성도, 디자인 충실도는 사용자에게 주의점과 제안으로
제공한다.

### 3.6 판 보존

디자인 시스템, 레시피, 페이지, 공고 맞춤 결과는 판(revision)으로 쌓는다. 새 판을
만들어도 이전 결과와 배포 스냅샷은 유지한다.

## 4. 주요 용어

| 용어 | 정의 |
| --- | --- |
| 디자인 시스템 | 포트폴리오에 적용할 색상, 타이포그래피, 간격, 형태, 구성, 컴포넌트, 미디어, 모션 규칙 |
| `DesignSystemSpecV2` | 디자인 시스템의 구조화된 원본 계약 |
| `DESIGN.md` | 에이전트와 개발자가 읽는 디자인 시스템 문서 |
| `DESIGN.html` | `DESIGN.md` 전체 내용과 실제 시각 예시를 함께 보여주는 실행형 디자인 문서 |
| `DesignDocumentModel` | `DESIGN.md`와 `DESIGN.html`이 함께 읽는 중간 문서 모델 |
| `ReferenceLock` | 선택한 디자인에서 보존할 특징, 토큰 역할, 미디어 전략, 제외 패턴, 출처를 고정한 생성 입력 |
| Recipe v2 | 블루프린트 GUI의 상태를 저장하고 생성 모델에 전달하는 내부 계약 |
| 블루프린트 | 사용자가 섹션과 요소를 클릭·이동·수정하는 GUI 편집 화면 |
| 블루프린트 요소 | Hero, 프로젝트, 수치, 차트, 타임라인처럼 캔버스에서 직접 조작하는 GUI 단위 |
| 표시 방식 | 같은 요소를 어떤 구성으로 보여줄지 가리키는 `presentationVariant` |
| 공고 맞춤 판 | 생성된 포트폴리오를 특정 채용 공고에 맞게 조정한 파생 판 |

## 5. 전체 사용자 여정

### 5.1 새 포트폴리오 시작

사용자가 새 포트폴리오를 시작하면 비어 있는 제작 항목을 만든다. 제목은 임시값으로
시작할 수 있고, 위저드 헤더에서 언제든 수정한다. 공고 URL과 원문, 인터뷰는 생성 후
편집기에서 받는다.

첫 진입 경로는 다음과 같다.

```text
/portfolio/new
  → 제작 항목 생성
  → /brew/:brewId/design
```

기존 `/brew/new`는 새 경로로 연결하거나 호환 진입점으로 유지한다.

### 5.2 단계 이동

위저드 헤더에는 세 단계만 표시한다.

```text
01 디자인     02 레시피     03 생성
```

완료한 단계는 다시 열 수 있다. 디자인을 바꾸면 레시피의 표시 방식 호환성을 다시
검사하고, 포트폴리오 생성 이후 디자인을 바꾸면 새 페이지 판을 만든다.

### 5.3 위저드 종료

포트폴리오 생성이 완료되면 위저드는 종료되고 편집기로 이동한다. 편집기는 공고 맞춤과
AI 인터뷰를 필요할 때 실행하는 도구로 제공한다.

## 6. 디자인 선택

### 6.1 단계 목표

사용자는 내용을 배치하기 전에 포트폴리오의 시각 방향을 선택한다. 디자인 비교에는
고정된 공통 샘플을 사용한다. 사용자의 커리어 기록이 반영된 모습은 Recipe v2 단계의
블루프린트와 예상 화면에서 확인한다.

디자인 선택 결과는 다음 단계가 재현할 수 있는 판으로 저장한다.

```ts
type DesignSelection = {
  designSystemRevisionId: string;
  referenceLock: ReferenceLock;
  styleOverrides: DesignStyleOverrides;
};
```

### 6.2 디자인 카탈로그

왼쪽 카탈로그는 다음 분류를 제공한다.

- 추천
- Expresso 기본
- 유명 웹사이트
- 내 디자인
- 회사 웹사이트

필터는 디자인의 구조와 사용 조건을 기준으로 한다.

- 밝은 지면, 어두운 지면
- 직무
- 정보 밀도
- 타이포그래피 성격
- 이미지 중심, 수치 중심, 글 중심
- 기술적, 에디토리얼, 유희적, 절제된

각 디자인 카드에는 이름, 출처 유형, 대표 특징, 추천 이유, `DESIGN.html` 축소
미리보기를 표시한다.

### 6.3 오른쪽 디자인 인스펙터

디자인을 클릭하면 오른쪽 인스펙터가 열린다. 문서와 샘플을 읽을 수 있도록 최소
520px의 가변 폭을 사용하고 전체 화면 전환을 제공한다.

탭은 다음과 같다.

1. `DESIGN.html`
2. `DESIGN.md`
3. 출처와 적용 규칙

상단에는 디자인 이름, 출처 유형, 원본 URL, 수집 시각, 비공식 참고 표시, 현재
포트폴리오에 맞는 이유를 표시한다. 하단의 주요 행동은 `이 디자인 적용`이다.

### 6.4 DesignSystemSpec v2

`DesignSystemSpecV2`는 디자인 시스템의 유일한 구조화 원본이다. 같은 계약에서
Markdown과 HTML을 함께 생성한다.

```ts
type DesignSystemSpecV2 = {
  version: 2;
  identity: {
    name: string;
    description: string;
    visualThesis: string;
    traits: string[];
    signatureMoves: string[];
  };
  origin: {
    kind: "builtin" | "reference" | "generated" | "website";
    sourceName: string | null;
    sourceUrl: string | null;
    capturedAt: string | null;
    attribution: string | null;
  };
  colors: {
    canvas: ColorToken;
    surface: ColorToken;
    elevated: ColorToken;
    text: ColorToken;
    muted: ColorToken;
    border: ColorToken;
    accent: ColorToken;
    action: ColorToken;
    actionText: ColorToken;
    roles: TokenRole[];
  };
  typography: {
    display: FontToken;
    body: FontToken;
    mono: FontToken;
    scale: TypeStep[];
    weights: number[];
    lineHeights: number[];
    letterSpacing: string[];
    measure: string;
  };
  spacing: {
    baseUnit: number;
    elementGap: number;
    componentGap: number;
    sectionGap: number;
    contentWidth: number;
  };
  shape: {
    cardRadius: number;
    controlRadius: number;
    borderWidth: number;
    shadowStyle: "none" | "hairline" | "soft" | "layered";
  };
  composition: {
    structure: string;
    density: "compact" | "comfortable" | "spacious";
    sectionRhythm: string;
    hierarchy: string;
    surfaceStrategy: string;
  };
  components: Record<string, ComponentRule>;
  imagery: ImageryRule;
  motion: MotionRule;
  rules: {
    do: string[];
    dont: string[];
    tokenRoles: TokenRole[];
  };
};
```

색상 토큰은 값과 역할을 함께 보존한다. 강조색, 고정폭 서체, 그림자, 표면색을 어느
컴포넌트에서 사용할지 규칙으로 기록한다.

### 6.5 DESIGN.md

`DESIGN.md`는 다음 내용을 순서대로 담는다.

1. 디자인 이름과 시각 방향
2. 색상 토큰과 역할
3. 타이포그래피 계단
4. 컴포넌트 규칙
5. 공통 샘플 포트폴리오
6. 이미지 전략
7. 구성과 섹션 리듬
8. 간격과 콘텐츠 폭
9. 반경, 테두리, 그림자
10. 모션 규칙
11. Do와 Don't
12. 출처와 판 정보

순서는 토큰, 시스템으로 지은 실제 화면, 수치 눈금, 규칙, 출처 차례다. 읽는 사람이
색과 서체를 먼저 보고, 그것으로 지은 화면을 확인한 뒤, 그 화면을 만든 수치로
내려가게 한다.

Markdown은 에이전트 입력, 다운로드, 복사, 판 비교에 사용한다.

### 6.6 DESIGN.html

`DESIGN.html`은 `DESIGN.md`의 모든 문장과 규칙을 포함하고, 각 규칙 옆에 실제
시각 예시를 배치한다. 사용자는 글과 렌더 결과를 같은 문서에서 비교한다.

문서 구성은 다음과 같다.

표지는 번호를 붙이지 않고 디자인 이름, 시각 방향, 대표 이미지 자리, 측정한 지표,
Signature Move를 담는다. 그 뒤 열한 절에 번호를 붙인다.

1. 색상 견본과 역할
2. 타이포그래피 견본
3. 컴포넌트 견본
4. 공통 샘플 포트폴리오
5. 이미지 전략
6. 구성 문법과 축소 와이어프레임
7. 간격 눈금과 레이아웃
8. 반경, 테두리, 그림자, 표면
9. 모션과 모션 감소 상태
10. Do와 Don't 시각 비교
11. 출처와 판 정보

절 머리는 번호, 절 제목, 계약이 단언한 문장, 보조 문장 네 단으로 둔다. 절 제목이
가장 큰 위계를 가진다. 문서 껍데기의 반경과 크기는 시스템 토큰을 쓰지 않는다.
틀이 견본과 같은 형태를 쓰면 어디까지가 문서이고 어디부터가 디자인인지 구분되지
않기 때문이다.

공통 샘플 포트폴리오는 모든 디자인에서 같은 고정 샘플을 사용한다. 고정 샘플에는 Hero,
프로젝트 사례, 긴 본문, 큰 수치, 전후 비교, 이미지, 이미지가 없는 사례, 기술 태그,
인용, 링크, 연락 행동, 푸터가 포함된다. 콘텐츠를 고정해 디자인 차이를 직접 비교할
수 있게 한다.

HTML 탭은 `미리보기`와 `코드 보기`를 제공한다. 실행은 자유 HTML과 같은 소독,
CSP, sandbox 경계를 사용한다.

### 6.7 디자인 문서 동기화

두 파일은 같은 `DesignDocumentModel`에서 생성한다.

```text
DesignSystemSpecV2
  ↓
DesignDocumentModel
  ├─ MarkdownRenderer → DESIGN.md
  └─ HtmlRenderer     → DESIGN.html
```

자동 검사는 다음을 확인한다.

- Markdown의 모든 절이 HTML에 존재한다.
- 토큰 값과 역할이 두 문서에서 일치한다.
- Do와 Don't 항목이 HTML에 포함된다.
- HTML 샘플이 선언된 토큰과 서체만 사용한다.
- 샘플 컴포넌트가 토큰 역할을 지킨다.
- Markdown 해시가 HTML 메타데이터와 산출물 명세에 기록된다.

```html
<meta name="design-spec-version" content="2">
<meta name="design-md-sha256" content="…">
```

### 6.8 ReferenceLock

`ReferenceLock`은 디자인에서 생성까지 유지할 결정과 출처를 고정한다.

```ts
type ReferenceLock = {
  version: 1;
  primaryDirection: {
    designSystemCode: string;
    revision: number;
  };
  fitReasons: string[];
  preserve: string[];
  borrowedDetails: string[];
  tokenRoles: TokenRole[];
  mediaStrategy: {
    mode: string;
    fallback: string;
  };
  signatureMove: string;
  reject: string[];
  sources: DesignReferenceSource[];
};
```

사용자는 디자인 시스템이 허용한 밀도, 회사 색상 반영, 밝기 변형, 강조 강도, 이미지
사용 강도를 조절한다. 골격과 핵심 타이포그래피를 변경할 때는 다른 디자인을 선택하거나
새 디자인 판을 만든다.

### 6.9 Expresso 기본 디자인

초기 기본 디자인은 기존 Clarity, Signal, Editorial을 v2 계약으로 확장한다.

| 디자인 | 적용 대상 | 주요 특징 |
| --- | --- | --- |
| Clarity | 빠른 검토가 필요한 일반 포트폴리오 | 단일 읽기 흐름, 분명한 역할과 성과 |
| Signal | 기술, 데이터, 운영 포트폴리오 | 정밀한 정보 경계, 수치 비교, 고정폭 메타데이터 |
| Editorial | 연구, 디자인, 집필 포트폴리오 | 넓은 여백, 긴 사례, 프로젝트 이미지 |

초기 검증 후 Product Casebook, Metrics Ledger, Leadership Narrative 같은 방향을
추가할 수 있다.

### 6.10 유명 웹사이트 레퍼런스

유명 웹사이트 레퍼런스는 서로 다른 디자인 방향을 대표하도록 선정한다. Linear,
Stripe, Notion, Apple, ElevenLabs, Duolingo, Raycast, Mercury 등은 초기 후보이며,
최종 목록은 시각 방향 중복과 출처 정책을 확인한 뒤 확정한다.

각 레퍼런스는 다음 정보를 보존한다.

- 원본 사이트 이름과 URL
- 관찰 시점
- 관찰한 디자인 신호
- Expresso에 적용한 규칙
- 비공식 디자인 참고 표시
- 원본과의 차이를 만든 결정

Expresso에는 관찰한 색상 역할, 타이포그래피, 간격, 구성, 표면, 이미지 처리, 모션
성격을 v2 계약으로 재구성해 적용한다. 원본 로고, 제품 이미지, 마케팅 카피, 고유
일러스트레이션, HTML/CSS는 출처 쪽에 둔다.

Refero의 공개 스타일과 조사 방법론은 초기 조사에 사용할 수 있다. 고객 대상 자동
연동은 Refero의 별도 사업 계약과 사용 조건을 확인한 뒤 `ReferoDesignProvider`로
연결한다. 참고 자료:

- <https://styles.refero.design/>
- <https://styles.refero.design/ai-agents/design-md-examples>
- <https://refero.design/mcp>
- <https://doc.refero.design/legal/terms-of-use>

### 6.11 자유 디자인 시스템 생성

사용자는 자연어로 디자인 시스템을 생성해 `내 디자인`에 저장할 수 있다.

```text
백엔드 엔지니어 포트폴리오.
짙은 남색 지면과 기술 문서 같은 정밀함.
수치와 아키텍처 그림이 중심.
모션은 상태 변화에만 사용.
```

생성 모델은 `DesignSystemSpecV2`를 반환한다. 결정적 컴파일러가 Markdown과 HTML을
만들고, 대비 검사와 렌더 검사를 통과한 결과를 사용자에게 보여준다. 사용자는 색상
역할, 서체, 밀도, 형태, 이미지 전략, 모션, Do와 Don't, Signature Move를 수정할
수 있다. 수정은 새 디자인 판으로 저장한다.

비동기 상태는 다음과 같다.

```text
queued → designing → compiling → rendering → ready
```

### 6.12 회사 웹사이트 분석

사용자가 지원 회사 URL을 입력하면 관찰 결과와 포트폴리오 적용 결과를 분리한다.

`ObservedDesignSignals`에는 다음을 기록한다.

- 주요·보조 색상과 사용 위치
- 표면 색상 단계
- 서체와 크기 계단
- 콘텐츠 폭과 섹션 간격
- 카드·버튼 반경
- 테두리와 그림자
- 페이지 밀도
- 이미지 비율과 처리
- 내비게이션과 Hero 구조
- 관찰 가능한 모션
- 데스크톱·모바일 차이
- 근거와 신뢰도

`AdaptedDesignSystemSpecV2`에는 Expresso 포트폴리오에 적용할 색상 계열, 정보 밀도,
타이포그래피 성격, 선·면·여백, 이미지 처리, 모션 성격을 기록한다. 회사 로고, 제품
스크린샷, 마케팅 문구, 고유 일러스트레이션은 출처 정보로만 보존한다.

오른쪽 인스펙터는 `관찰한 것`과 `포트폴리오에 적용할 것`을 나란히 보여준다. 사용자가
승인하면 개인 디자인 시스템 판으로 저장한다.

## 7. Recipe v2 블루프린트

### 7.1 단계 목표

Recipe v2는 포트폴리오의 내용과 구성을 확정하는 단계다. 사용자는 반영할 커리어
기록을 선택하고, 섹션과 요소를 배치하고, 요소별 표시 방식을 고른다. AI가 만든 초기
블루프린트는 편집 가능한 제안이다.

이 단계는 페이지 생성 모델이 따라야 할 내용 의도, 근거, 순서, 요소 종류, 표시 방식,
강조 수준을 저장한다. 완성 문장과 픽셀 배치는 포트폴리오 생성 단계가 담당한다.

### 7.2 GUI 편집 원칙

블루프린트의 사용자 표면은 인터랙티브 GUI 편집기다. Recipe v2 JSON과 AI 응답은
저장·통신에만 사용하고, 화면은 이를 섹션 컨테이너와 요소 카드로 렌더한다.

사용자는 GUI에서 다음 동작을 수행한다.

- 섹션이나 요소를 클릭해 선택
- 제목, 목적, 핵심 메시지, 목표 분량을 화면에서 수정
- 드래그 앤 드롭으로 섹션과 요소 순서 변경
- 기록을 캔버스에 놓아 새 요소 생성
- 기록을 기존 요소에 놓아 출처 연결
- 표시 방식 예시를 클릭해 구성 변경
- 요소 폭과 강조 수준 조정
- 요소 추가, 복제, 삭제
- 실행 취소와 다시 실행

섹션은 접을 수 있는 캔버스 컨테이너로 표시한다. 요소는 종류, 연결한 기록, 표시 방식,
핵심 메시지, 상태를 보여주는 카드로 표시한다. 카드의 drag handle, 본문, 빠른 행동,
크기 조절 영역은 서로 다른 클릭 영역을 가진다.

요소를 클릭하면 선택 테두리와 오른쪽 인스펙터가 나타난다. 제목과 짧은 값은 카드에서
바로 수정하고, 표시 방식·출처·미디어·세부 설정은 인스펙터에서 수정한다. 변경 결과는
캔버스에 즉시 반영한다.

AI가 만든 Recipe v2 초안도 같은 GUI로 연다. 서버가 계약을 검증한 뒤 클라이언트가
섹션과 요소를 캔버스에 생성하며, 사용자는 생성된 카드부터 직접 편집한다.

GUI 상태와 저장 상태는 다음처럼 나눈다.

```ts
type BlueprintEditorState = {
  selectedSectionId: string | null;
  selectedElementId: string | null;
  activeDragId: string | null;
  collapsedSectionIds: string[];
  zoom: number;
};
```

선택, 드래그, 접힘, 확대 상태는 편집기 상태다. 섹션·요소의 값, 순서, 기록 연결,
표시 방식은 Recipe v2 판에 저장한다.

### 7.3 작업대 구조

데스크톱은 세 영역으로 구성한다.

```text
┌────────────────┬──────────────────────────┬──────────────────┐
│ 커리어 기록     │ 블루프린트 캔버스         │ 요소 설정          │
│                │                          │                  │
│ 프로젝트        │ 01 Hero                  │ 표시 방식           │
│ 경험            │ ┌──────────────────────┐ │ ○ 큰 문장          │
│ 수상            │ │ 역할과 대표 성과      │ │ ○ 좌우 분할        │
│ 학력            │ └──────────────────────┘ │ ● 수치 중심        │
│ 기술            │                          │                  │
│                │ 02 프로젝트              │ 연결된 기록         │
│ 선택한 기록     │ ┌────────┐ ┌────────┐   │ 결제 시스템 개선    │
│                │ │문제     │ │성과     │   │                  │
│                │ └────────┘ └────────┘   │ 강조 수준          │
└────────────────┴──────────────────────────┴──────────────────┘
```

가로 폭이 좁으면 커리어 기록과 요소 설정을 서랍형 패널로 제공한다. 중심 캔버스는
항상 현재 순서와 계층을 보여준다.

### 7.4 제작 의도

작업대 상단에는 선택 입력을 둔다.

- 포트폴리오 제목
- 보여주고 싶은 역할 또는 분야
- 주요 독자
- 가장 강조할 경험
- 원하는 분량
- 추가 요청

사용자가 입력을 비워 두면 선택한 기록과 디자인 시스템만으로 블루프린트를 만든다.
공고 분석은 생성 후 공고 맞춤에서 실행한다.

### 7.5 커리어 기록 영역

기존 `재료 고르기` 화면의 기능을 왼쪽 영역으로 통합한다.

- 전체 기록, 선택한 기록, 사용 중인 기록
- 카테고리, 최근 사용, 완성도
- 검색과 정렬
- 기록 미리보기
- 블루프린트 사용 위치
- 블루프린트에서 제외한 기록과 이유

사용자는 기록을 체크해 AI 블루프린트 입력에 포함하거나, 기록을 캔버스로 직접
드래그할 수 있다. 0개 선택도 유효하다.

기록을 빈 캔버스 위치에 놓으면 기록 종류와 내용에 맞는 요소를 제안한다.

| 기록 종류 | 제안 요소 |
| --- | --- |
| 프로젝트 | 사례 연구, 아티팩트 중심, 문제-행동-결과 |
| 수치가 있는 경험 | 큰 지표, 전후 비교, 막대 비교 |
| 경력 | 타임라인, 역할 목록, 성과 목록 |
| 기술 | 태그, 분류 목록, 근거 매트릭스 |
| 수상·인증 | 인증 목록, 주요 성취 |
| 학술·집필 | 출판 목록, 인용, 에디토리얼 카드 |

기록을 기존 요소에 놓으면 primary 또는 supporting source로 연결한다.

### 7.6 블루프린트 캔버스

캔버스는 완성 페이지의 섹션 순서와 요소 계층을 보여준다. 와이어프레임은 선택한
디자인 시스템의 타이포그래피와 강조색을 제한적으로 사용하고, 구조와 정보 위계를
중심으로 표현한다.

사용자는 다음 동작을 수행할 수 있다.

- 섹션 추가, 복제, 삭제
- 섹션 순서 변경
- 요소 추가, 복제, 삭제
- 요소 순서 변경
- 요소를 다른 섹션으로 이동
- 요소 크기 변경
- 기록과 미디어 연결
- AI가 제안한 의도와 핵심 메시지 수정
- 블루프린트와 예상 화면 전환

### 7.7 드래그 앤 드롭

드래그 앤 드롭은 다음 범위를 지원한다.

```text
섹션 ↕
요소 ↕
요소 → 다른 섹션
기록 → 기존 요소
기록 → 빈 위치에서 새 요소 생성
```

드래그 중에는 삽입 위치, 대상 섹션, 생성될 요소를 표시한다. 저장 요청이 실패하면
이전 순서를 복원하고 오류 상태를 보여준다.

키보드와 메뉴를 통한 대체 조작을 제공한다.

- 위로 이동
- 아래로 이동
- 섹션으로 이동
- 섹션 맨 앞으로 이동
- 섹션 맨 뒤로 이동
- 기록 연결과 연결 해제

### 7.8 요소 설정

캔버스에서 요소를 선택하면 오른쪽 인스펙터가 열린다.

- 요소 종류
- 요소의 목적
- 핵심 메시지
- 표시 방식 예시
- 강조 수준
- 폭
- 연결된 기록과 미디어
- 글자 수 제안
- 사용자 메모

표시 방식 예시는 선택한 디자인 시스템의 실제 컴포넌트로 렌더한다. 선택한 디자인
시스템이 지원하는 표시 방식만 후보에 나타난다.

### 7.9 기본 요소와 표시 방식

#### Hero

- 큰 문장
- 좌우 분할
- 대표 수치 중심
- 이미지 중심
- 짧은 프로필 카드

#### 프로젝트

- 문제-행동-결과
- 긴 사례 연구
- 아티팩트 중심
- 수치 중심
- 과정 타임라인
- 여러 프로젝트 비교

#### 수치

- 큰 숫자 하나
- 전후 비교
- 수치 묶음
- 막대 비교
- 도넛 또는 게이지
- 설명이 붙은 지표

#### 경력

- 세로 타임라인
- 조직별 묶음
- 역할 중심
- 성과 중심
- 프로젝트 연결형

#### 기술

- 태그
- 카테고리 목록
- 숙련 근거
- 프로젝트 연결
- 기술 스택 표

#### 기타

- 본문
- 이미지 갤러리
- 인용
- 프로필
- 연락 행동
- 푸터

### 7.10 AI 블루프린트 생성

사용자가 기록과 제작 의도를 정한 뒤 `블루프린트 만들기`를 실행한다.

입력은 다음과 같다.

- 디자인 시스템 판과 `ReferenceLock`
- 제작 의도
- 선택한 커리어 기록
- 기록별 카테고리와 구조화 속성
- 사용할 수 있는 미디어
- 예상 분량

모델은 Recipe v2 초안을 반환한다. 서버가 계약을 검증하면 클라이언트가 초안을 즉시
GUI 캔버스로 렌더한다.

- 추천 섹션과 순서
- 섹션 목적과 핵심 메시지
- 사용할 기록
- 요소 종류
- 요소별 `presentationVariant`
- 강조 수준과 폭
- 비어 있는 보완 자리
- 사용하지 않은 기록과 이유

사용자 화면에는 다음과 같은 섹션 컨테이너와 요소 카드가 생성된다.

```text
┌ 02  결제 시스템 개선 ──────────────────────────────── ⋮ ┐
│ 대규모 트래픽 환경의 문제 해결 능력                  ▴▾ │
│                                                            │
│ ⠿ 문제 설명                                               │
│   짧은 서사 · 연결 기록 1건                            [편집]│
│                                                            │
│ ⠿ 처리 시간                                               │
│   전후 비교 · 220분 → 24분                             [편집]│
│                                                            │
│ ⠿ 구조 변경                                               │
│   과정 다이어그램 · 연결 이미지 1건                    [편집]│
│                                                            │
│ ⠿ 담당 역할                                               │
│   근거 목록 · 연결 기록 1건                            [편집]│
└────────────────────────────────────────────────────────────┘
```

카드를 클릭하면 오른쪽 인스펙터에서 목적, 핵심 메시지, 표시 방식, 폭, 강조 수준,
연결 기록, 미디어를 수정한다. 사용자는 캔버스에서 순서를 바로 바꾸고 필요한 요소를
추가한다.

기록이 없으면 빈 요소의 목적과 작성 안내를 넣는다. 사용자는 직접 채우거나 페이지
생성 모델이 초안을 쓰도록 둘 수 있다.

비동기 상태는 다음과 같다.

```text
queued → selecting → outlining → validating → ready
```

### 7.11 Recipe v2 계약

아래 계약은 GUI 상태를 저장하고 API로 전달하는 내부 표현이다. 사용자 입력은 GUI가
받고, 클라이언트와 서버가 JSON 변환을 맡는다.

```ts
type RecipeV2 = {
  schemaVersion: 2;
  id: string;
  brewId: string;
  version: number;
  designSystemRevisionId: string;
  title: string;
  intent: PortfolioIntent;
  selectedRecordIds: string[];
  sections: BlueprintSection[];
  unusedSources: UnusedSource[];
  status: "draft" | "confirmed";
  updatedAt: string;
};

type BlueprintSection = {
  id: string;
  order: number;
  title: string;
  purpose: string;
  takeaway: string;
  layoutVariant: string;
  elements: BlueprintElement[];
};

type BlueprintElement = {
  id: string;
  order: number;
  kind:
    | "hero"
    | "text"
    | "project"
    | "metric"
    | "chart"
    | "timeline"
    | "gallery"
    | "skills"
    | "quote"
    | "profile"
    | "contact";
  intent: string;
  takeaway: string;
  presentationVariant: string;
  emphasis: "primary" | "secondary" | "supporting";
  width: "narrow" | "content" | "wide" | "full";
  targetLength: number;
  sourceBindings: BlueprintSourceBinding[];
  mediaBindings: BlueprintMediaBinding[];
  settings: Record<string, unknown>;
};

type BlueprintSourceBinding = {
  sourceType: "record" | "answer" | "requirement";
  sourceId: string;
  role: "primary" | "supporting";
  order: number;
};
```

기본 Recipe v2의 출처 유형은 `record`다. `answer`와 `requirement`는 생성 후 AI
인터뷰와 공고 맞춤 판에서 사용한다.

### 7.12 자동 저장과 판 관리

모든 편집은 낙관적으로 화면에 반영한 뒤 서버에 저장한다. 서버는 멱등성 키와 현재
recipe version을 확인한다. 충돌이 발생하면 최신 판과 사용자의 변경을 비교해 복구
화면을 제공한다.

레시피 판에는 다음 변경을 기록한다.

- 섹션과 요소 이동
- 기록과 미디어 연결
- 표시 방식 변경
- 요소 추가·복제·삭제
- AI 블루프린트 재생성
- 사용자 지시 적용

실행 취소와 다시 실행은 판 또는 되돌릴 수 있는 변경 내역을 사용한다.

## 8. 포트폴리오 생성

### 8.1 생성 입력

페이지 생성 모델은 다음 네 입력을 받는다.

```text
DesignSystemSpecV2 + ReferenceLock
RecipeV2 Blueprint
연결된 커리어 기록과 인터뷰 답변
미디어
```

기본 생성의 입력은 디자인 시스템, Recipe v2, 연결한 기록, 미디어다. 공고 맞춤 판은
변경된 Recipe v2와 연결한 공고 요건을 함께 사용한다.

### 8.2 생성 모델의 책임

생성 모델은 다음 작업을 수행한다.

- 블루프린트의 섹션과 요소 순서 구현
- 요소별 `presentationVariant` 반영
- 연결된 기록을 기반으로 카피 작성
- 빈 요소를 읽히는 초안으로 완성
- 디자인 토큰과 역할 준수
- 미디어 전략 적용
- 반응형 HTML/CSS 작성
- 한 문장의 생성 이유 반환

### 8.3 출력 계약

기본 출력은 현재 자유 HTML 계약을 유지한다.

```ts
type PageDraft = {
  html: string;
  css: string;
  rationale: string;
};
```

섹션과 요소에는 안정적인 식별자를 남긴다.

```html
<section data-blueprint-section="section-id">
  <article
    data-blueprint-element="element-id"
    data-presentation="problem-action-result"
  >
    …
  </article>
</section>
```

`data-*` 식별자는 생성 후 편집 제안, 공고 맞춤, AI 인터뷰, 화면 분석, 블루프린트
동기화에 사용한다.

### 8.4 진행 상태

포트폴리오 생성 화면은 다음 상태를 자동으로 표시한다.

```text
queued
→ validating-blueprint
→ writing-content
→ composing-page
→ reviewing-render
→ charging
→ done
```

진행 중에는 현재 단계, 진행 표시, 경과 시간을 보여준다. 완료되면 편집기로 자동
이동한다. 실패하면 저장된 블루프린트와 디자인 선택을 유지하고 재시도할 수 있게 한다.

### 8.5 저장과 사용량

`generated_page` 저장과 QA 완료 뒤에만 제작 사용량을 차감한다. 동일한 generation
job이 재시도되더라도 한 번만 차감한다. 페이지에는 다음 스냅샷을 보존한다.

- 디자인 시스템 판
- `ReferenceLock`
- `PageStyleGrammar v2`
- Recipe v2
- 연결된 출처 명세
- 생성 모델과 프롬프트 버전
- 사용량과 시간
- QA report

## 9. 생성 후 편집

### 9.1 편집기 정보 구조

편집기는 포트폴리오 결과와 선택적 AI 도구를 함께 제공한다.

- 페이지 직접 편집
- 요소별 AI 수정
- 디자인 변경
- 기록 추가
- 채용 공고 맞춤
- AI 인터뷰
- 판 비교와 복원
- 배포

위저드가 끝난 뒤 실행되는 도구는 포트폴리오와 현재 블루프린트 판을 기준으로
동작한다.

### 9.2 채용 공고 맞춤

사용자는 생성된 포트폴리오에 채용 공고 URL 또는 원문을 연결한다.

```text
공고 입력
→ 공고 분석
→ 현재 블루프린트와 페이지 비교
→ 맞춤 제안 생성
→ 변경 전·후 미리보기
→ 적용할 제안 선택
→ 새 블루프린트·페이지 판
```

제안 유형은 다음과 같다.

- 대표 프로젝트 변경
- 섹션 순서 조정
- 특정 성과 강조
- 관련 기록 추가
- 표현과 표시 방식 변경
- 요구사항을 뒷받침할 정보 부족 표시
- AI 인터뷰 질문 제안

제안은 `TailoringProposal`로 저장한다.

```ts
type TailoringProposal = {
  id: string;
  portfolioId: string;
  jobAnalysisId: string;
  baseRecipeRevisionId: string;
  operations: TailoringOperation[];
  rationale: string;
  status: "pending" | "applied" | "rejected" | "expired";
};
```

사용자가 고른 변경만 새 Recipe v2 판에 적용한다. 원본 포트폴리오와 기본 블루프린트는
유지한다. 한 포트폴리오에서 여러 공고 맞춤 판을 관리할 수 있다.

### 9.3 AI 인터뷰

AI 인터뷰는 현재 포트폴리오와 선택적 채용 공고에서 정보가 약한 요소를 찾고 질문한다.

질문 대상은 다음과 같다.

- 비어 있는 블루프린트 요소
- 근거가 약한 주장
- 결과 수치가 없는 프로젝트
- 사용자의 역할이 불분명한 사례
- 연결한 공고의 중요 요구사항

답변 결과는 사용자가 다음 용도로 선택한다.

- 새 커리어 기록 저장
- 기존 기록 보완
- 특정 블루프린트 요소 연결
- 현재 페이지 수정 제안

인터뷰는 일시 정지, 재개, 질문 교체, 건너뛰기를 지원한다. 답변 저장과 포트폴리오
적용은 분리한다. 적용할 때 새 블루프린트 또는 페이지 판을 만든다.

### 9.4 파생 판

기본 포트폴리오와 맞춤 결과의 관계를 명시한다.

```text
기본 포트폴리오 r1
  ├─ A사 맞춤 r2
  ├─ B사 맞춤 r3
  └─ 일반 업데이트 r4
```

각 파생 판은 기준 판, 적용한 공고, 인터뷰 답변, 사용한 기록, 디자인 판을 기록한다.
배포는 특정 페이지 판을 선택한다.

## 10. 데이터 모델

### 10.1 design_system

디자인 시스템의 소유권과 현재 판을 저장한다.

| 필드 | 내용 |
| --- | --- |
| `id` | 디자인 시스템 식별자 |
| `user_id` | 시스템 디자인이면 null, 개인 디자인이면 사용자 |
| `name` | 표시 이름 |
| `origin_kind` | builtin, reference, generated, website |
| `visibility` | system, private, shared |
| `current_revision_id` | 현재 판 |
| `status` | draft, processing, ready, failed, archived |
| `created_at`, `updated_at` | 생성·수정 시각 |

### 10.2 design_system_revision

| 필드 | 내용 |
| --- | --- |
| `id` | 판 식별자 |
| `design_system_id` | 디자인 시스템 |
| `version` | 판 번호 |
| `spec` | `DesignSystemSpecV2` |
| `design_md` | 생성된 Markdown |
| `design_html` | 생성된 HTML |
| `preview_asset_id` | 카드 미리보기 |
| `source_manifest` | 출처와 수집 시점 |
| `qa_report` | 문서·렌더 검사 |
| `parent_revision_id` | 이전 판 |
| `content_hash` | 산출물 해시 |

### 10.3 brew

`brew`는 포트폴리오 제작 전체를 소유하는 단위로 정리한다.

변경 항목은 다음과 같다.

- `job_analysis_id` 선택값 전환
- `design_system_revision_id` 추가
- `current_recipe_id` 추가 검토
- 상태를 `designing`, `blueprinting`, `generating`, `done` 중심으로 정리
- 제목과 제작 의도 저장

기존 공고 기반 brew는 `job_analysis_id`를 유지하며 마이그레이션한다.

### 10.4 recipe와 blueprint

기존 `recipe`와 `recipe_section`을 유지하고 v2 식별자를 추가한다.

- `recipe.schema_version`
- `recipe.design_system_revision_id`
- `recipe.intent`
- `recipe_element`
- `recipe_element_source`
- `recipe_element_media`

`recipe_element`는 kind, intent, 핵심 메시지, 표시 방식, 강조 수준, 폭, 목표 분량,
설정, 순서를 저장한다. 출처와 미디어는 별도 연결 테이블로 관리한다.

기존 `recipe_item`과 `recipe_evidence_path`는 v1 레시피 호환에 사용한다. v1을 읽을 때
legacy adapter가 Recipe v2 모양으로 변환한다.

### 10.5 generation_job

생성 job은 다음 스냅샷 식별자를 보존한다.

- `recipe_id`와 recipe version
- `design_system_revision_id`
- `reference_lock_snapshot`
- `style_overrides`
- `request_hash`
- `portfolio_id`

stage는 §8.4의 상태로 확장한다.

### 10.6 generated_page

다음 필드를 추가하거나 생성 명세에 포함한다.

- `recipe_snapshot`
- `design_system_revision_id`
- `reference_lock_snapshot`
- `design_artifact_hash`
- `source_manifest`
- `base_page_id`
- `job_analysis_id`
- `interview_session_ids`

페이지가 배포된 뒤 디자인 시스템이나 레시피가 바뀌어도 스냅샷으로 당시 결과를
재현할 수 있어야 한다.

## 11. API 계획

### 11.1 제작 시작과 상태

```text
POST /v1/brews
GET  /v1/brews/:id
PATCH /v1/brews/:id
```

새 brew는 공고 없이 생성할 수 있다. PATCH는 제목, 제작 의도, 현재 단계에서 허용한
선택을 저장한다.

### 11.2 디자인 시스템

```text
GET  /v1/design-systems
GET  /v1/design-systems/:id
GET  /v1/design-system-revisions/:id
POST /v1/design-systems/generate
POST /v1/design-systems/extract
GET  /v1/design-system-jobs/:id
POST /v1/brews/:id/design-selection
```

`generate`는 자연어 디자인 생성을, `extract`는 회사 URL 분석을 시작한다. 두 작업은
비동기 job을 반환한다.

### 11.3 Recipe v2

```text
POST  /v1/brews/:id/recipes
GET   /v1/recipes/:id
PATCH /v1/recipes/:id
POST  /v1/recipes/:id/elements
PATCH /v1/recipes/:id/elements/:elementId
DELETE /v1/recipes/:id/elements/:elementId
POST  /v1/recipes/:id/reorder
POST  /v1/recipes/:id/undo
POST  /v1/recipes/:id/redo
```

reorder는 여러 요소의 최종 순서를 한 요청으로 받고 drop 시점에 한 번 저장한다. 모든
쓰기 요청은 멱등성 키와 recipe version을 받는다.

### 11.4 포트폴리오 생성

```text
POST /v1/generation-jobs
GET  /v1/generation-jobs/:id
GET  /v1/generation-jobs/:id/page-stream
```

생성 요청은 `recipeId`, `recipeVersion`, `designSystemRevisionId`를 받는다. 서버는 세
식별자의 소유권과 호환성을 확인한다.

### 11.5 생성 후 맞춤

```text
POST /v1/portfolios/:id/tailoring-jobs
GET  /v1/tailoring-jobs/:id
POST /v1/tailoring-proposals/:id/apply
POST /v1/portfolios/:id/interview-sessions
```

공고 맞춤과 인터뷰 적용은 각각 제안과 새 판을 만든다.

## 12. 프론트엔드 경로

```text
/brew/:brewId/design       디자인 선택
/brew/:brewId/recipe       Recipe v2 블루프린트
/brew/:brewId/generate     생성 상태와 스트리밍 미리보기
/edit/:portfolioId         생성 후 편집
```

기존 경로는 다음과 같이 처리한다.

| 기존 경로 | 처리 |
| --- | --- |
| `/brew/:id/analyze` | 해당 공고 또는 포트폴리오의 생성 후 맞춤 화면으로 연결 |
| `/brew/:id/materials` | Recipe v2 왼쪽 기록 영역으로 연결 |
| `/brew/:id/counter` | 생성 후 편집기의 AI 인터뷰로 연결 |
| `/brew/:id/outline` | `/brew/:id/recipe`로 연결 |
| `/brew/:id/design` | 새 01 디자인 선택 화면으로 유지 |

위저드의 완료 단계 링크는 디자인과 레시피만 제공한다. 생성 중에는 입력 스냅샷을
고정하고, 변경이 필요하면 생성 취소 또는 완료 후 새 판을 사용한다.

## 13. 안전과 출처 정책

### 13.1 URL 수집

회사 웹사이트와 레퍼런스 URL 수집기는 격리된 작업으로 실행한다.

- http와 https만 허용
- 사설 IP, localhost, 클라우드 metadata 주소 차단
- DNS 재확인과 리디렉션 제한
- 응답 크기, 실행 시간, 페이지 수 제한
- 인증과 로그인 페이지 수집 차단
- 원본 페이지의 지시를 데이터로 취급
- 원본 HTML, CSS, 스크린샷의 비공개 임시 저장
- robots와 사이트 이용 조건 확인
- 접근 실패 시 사용자가 제공한 스크린샷 분석 경로 제공

디자인 URL 분석 외부 서비스에는 URL과 추상 디자인 브리프만 전달한다. 커리어 기록,
인터뷰 답변, 채용 공고 원문은 Expresso 안에서 처리한다.

### 13.2 외부 레퍼런스

레퍼런스에서는 디자인 원리와 역할을 추출한다. 포트폴리오에는 재구성한 디자인 규칙을
적용하고, 원본 사이트의 식별 자산과 카피는 출처 정보로 보존한다. 출처, 관찰 시점,
적용 결정, 비공식 참고 표시도 함께 남긴다.

Refero MCP 또는 API를 고객 대상 제품 흐름에 연결할 때는 별도 사업 계약과 요청 제한을
확인한다. 계약 전 단계는 내부 조사와 수동 큐레이션으로 운영한다.

### 13.3 생성 입력

모든 외부 텍스트는 프롬프트 지시가 아닌 데이터로 전달한다. 디자인 시스템, Recipe v2,
커리어 기록, 공고, 인터뷰 답변은 구조화 계약을 통과한 뒤 생성 모델에 제공한다.

## 14. 비동기 작업과 복구

모든 장기 작업은 공통 상태를 갖는다.

```ts
type AsyncJobState = {
  status: "queued" | "running" | "done" | "failed";
  stage: string;
  attempts: number;
  progress: number | null;
  failure: {
    code: string;
    retryable: boolean;
  } | null;
};
```

화면은 stage에 맞는 진행 문구, spinner 또는 progress bar, 경과 시간을 표시한다. 완료
상태를 확인하면 결과 화면으로 자동 이동한다. 작업 실패 시 이미 저장한 디자인 선택,
기록 선택, 블루프린트 편집을 유지한다.

재시도는 같은 멱등성 키와 request hash를 사용한다. 사용자가 입력을 바꾸면 새 작업으로
시작한다.

## 15. 분석과 완료 조건

### 15.1 디자인 선택

- 디자인 클릭 시 `DESIGN.html`, `DESIGN.md`, 출처와 적용 규칙을 확인할 수 있다.
- 두 디자인 문서의 토큰, 규칙, 해시가 일치한다.
- 고정 샘플로 디자인 간 차이를 비교할 수 있다.
- 선택한 디자인 판과 `ReferenceLock`이 다음 단계에 전달된다.
- 일반 스타일, 유명 웹사이트, 개인 생성, 회사 웹사이트 디자인을 같은 카탈로그에서
  구분해 찾을 수 있다.

### 15.2 Recipe v2

- 기록이 없는 사용자도 블루프린트를 만들 수 있다.
- Recipe v2 화면은 섹션 컨테이너와 요소 카드로 구성된 GUI 캔버스로 열린다.
- 섹션과 요소를 클릭하면 선택 상태와 수정 도구가 나타난다.
- 제목과 짧은 값은 캔버스에서 바로 수정할 수 있다.
- 세부 값은 오른쪽 인스펙터에서 수정할 수 있다.
- AI가 만든 초안은 검증 직후 GUI 요소로 나타난다.
- 사용자는 기록 선택, 섹션·요소 추가, 순서 변경, 표시 방식 선택을 한 화면에서 수행한다.
- 섹션과 요소를 드래그하거나 키보드 메뉴로 이동할 수 있다.
- 기록을 드래그해 새 요소를 만들거나 기존 요소에 연결할 수 있다.
- 새로고침 후에도 순서, 연결, 표시 방식이 유지된다.
- 실행 취소와 다시 실행으로 편집을 복구할 수 있다.
- 선택한 디자인에서 지원하는 표시 방식만 제공된다.

### 15.3 포트폴리오 생성

- 블루프린트의 섹션·요소 순서가 생성 페이지에 반영된다.
- 요소별 표시 방식이 생성 결과에서 확인된다.
- page generation 호출은 기본 생성 한 번으로 유지된다.
- `generated_page` 저장 뒤에만 사용량이 한 번 차감된다.
- 생성 상태가 자동으로 진행되고 완료 후 편집기로 이동한다.
- HTML의 blueprint 식별자가 스냅샷과 일치한다.

### 15.4 생성 후 편집

- 사용자는 생성된 포트폴리오에 공고를 연결할 수 있다.
- 공고 맞춤 제안은 변경 전·후와 근거를 보여준다.
- 선택한 제안만 새 판에 적용된다.
- AI 인터뷰 답변은 기록, 요소 연결, 수정 제안 중에서 사용자가 용도를 고른다.
- 기본 포트폴리오와 공고별 파생 판을 복원할 수 있다.

### 15.5 안전과 품질

- 외부 URL 수집에서 SSRF와 과도한 응답을 차단한다.
- 디자인·페이지 HTML이 소독과 CSP를 통과한다.
- 모바일 가로 스크롤, 잘린 핵심 콘텐츠, 대비, 모션 감소 상태를 검사한다.
- 디자인·레시피·페이지·공고·인터뷰의 소유권을 모든 요청에서 확인한다.

## 16. 마이그레이션 계획

### 16.1 계약 선행

`DesignSystemSpecV2`, `ReferenceLock`, Recipe v2, blueprint element, source binding 계약을
먼저 추가한다. 기존 계약은 읽기 호환을 유지한다.

### 16.2 데이터 구조 추가

디자인 시스템과 blueprint element 테이블을 추가하고 `brew`, `generation_job`,
`generated_page`에 스냅샷 연결을 추가한다. 마이그레이션 전 데이터베이스 backup을
확보한다.

### 16.3 기존 데이터 변환

- 기존 template style을 `DesignSystemSpecV2` 판으로 변환
- 기존 recipe section과 item을 v2 section과 text element로 변환
- 기존 evidence path를 source binding으로 변환
- 기존 generated page에 legacy 디자인·레시피 명세 기록
- 기존 공고 기반 brew의 job analysis 연결 유지

변환 과정은 원본 행을 보존하고 새 계약에서 읽을 수 있는 연결을 추가한다.

### 16.4 새 위저드 전환

기능 flag 아래에서 세 단계 위저드를 제공한다. 새 brew는 v2로 만들고, 진행 중인 기존
brew는 기존 경로를 계속 사용한다. 완료한 기존 포트폴리오는 편집기에서 v2 도구를
선택적으로 사용한다.

### 16.5 생성 후 기능 이동

공고 분석과 AI 인터뷰를 편집기에 연결한 뒤 기존 위저드 진입점을 호환 경로로 바꾼다.
기존 job, answer, record, requirement 데이터는 유지한다.

### 16.6 기본 전환

v2의 완료 조건과 기존 기능 회귀 검사를 통과하면 새 위저드를 기본으로 전환한다. 호환
경로의 이용 상태를 확인한 뒤 제거 계획을 별도 결정한다.

## 17. 구현 마일스톤

### M1. 디자인 시스템 계약과 문서

- `DesignSystemSpecV2Schema`
- `ReferenceLockSchema`
- `DesignDocumentModel`
- `DESIGN.md`와 `DESIGN.html` 컴파일러
- Clarity, Signal, Editorial v2 전환
- 디자인 문서 동기화 검사

### M2. 디자인 선택 화면

- 디자인 카탈로그와 검색·필터
- 오른쪽 디자인 인스펙터
- 디자인 적용과 판 저장
- 유명 웹사이트 레퍼런스 초기 카탈로그
- 고정 샘플과 실제 레시피 미리보기 연결 준비

### M3. Recipe v2 계약과 저장

- Recipe v2와 blueprint element 계약
- recipe element와 source·media 연결 저장
- 판, 변경 내역, 멱등성, 충돌 처리
- v1 recipe adapter

### M4. 블루프린트 작업대

- 커리어 기록 영역
- 블루프린트 캔버스
- 요소 인스펙터
- 표시 방식 예시
- 드래그 앤 드롭
- 키보드 이동
- 자동 저장과 실행 취소

### M5. 블루프린트 AI 생성

- 선택 기록과 제작 의도 입력
- Recipe v2 초안 생성
- 비어 있는 요소와 미사용 기록 처리
- 자동 진행과 실패 복구

### M6. Blueprint 기반 페이지 생성

- PageGenerationContext 전환
- 디자인·레시피 스냅샷
- blueprint 식별자 출력
- 스트리밍 미리보기와 렌더 QA
- 사용량 차감과 편집기 이동

### M7. 공고 맞춤 편집

- 편집기 공고 입력
- tailoring proposal
- 변경 전·후 미리보기
- 선택 적용과 파생 판

### M8. AI 인터뷰 편집

- 현재 페이지와 공고 기반 질문
- 답변의 기록 저장·보완
- 요소 연결과 수정 제안
- 판 적용

### M9. 디자인 시스템 확장

- 자유 디자인 생성
- 회사 웹사이트 분석
- 개인 디자인 라이브러리
- Refero 연동 모듈 계약 검토와 선택적 연동

## 18. 검증 계획

### 18.1 계약 검사

- v1과 v2 recipe parsing
- 디자인 문서 동기화
- 표시 방식 호환성
- source binding 소유권
- 스냅샷 직렬화와 복원

### 18.2 서비스 통합 검사

- 공고 없는 brew 생성
- 디자인 선택 저장
- 0개 기록 Recipe v2 생성
- DnD reorder 원자적 저장
- generation job 멱등성
- 페이지 저장 뒤 사용량 차감
- 공고 맞춤 판
- 인터뷰 답변 적용

### 18.3 실제 화면 검사

- 디자인 선택과 문서 인스펙터
- 블루프린트 DnD와 키보드 이동
- 자동 저장 실패 복구
- 데스크톱·모바일 생성 결과
- 장기 작업 자동 진행
- 편집 제안 전·후 비교

### 18.4 비교 평가

대표 커리어 기록 묶음을 사용해 기존 흐름과 v2를 비교한다.

- 첫 포트폴리오 생성 완료율
- 완료까지 필요한 화면 이동과 사용자 행동
- 블루프린트 수정 빈도
- 생성 결과의 블루프린트 충실도
- 디자인 선택 이해도
- 모바일 치명 오류
- 생성 비용과 첫 결과까지 걸린 시간

## 19. 미결정 사항

다음 항목은 구현 명세를 시작하기 전에 확정한다.

1. 새 제작 단위의 이름을 `brew`로 유지할지 `portfolio_build`로 바꿀지
2. Recipe v2의 기준 경로를 `/recipe`로 할지 기존 `/outline`을 유지할지
3. 블루프린트 캔버스의 grid 단위를 사용자에게 어느 범위까지 노출할지
4. 한 요소에 허용할 커리어 기록 수와 primary source 규칙
5. 디자인 시스템별 표시 방식의 초기 목록
6. 공고 맞춤 판을 같은 포트폴리오에서 분기할지 별도 포트폴리오로 복제할지
7. 자유 디자인 생성과 페이지 생성의 사용량 정책
8. 외부 레퍼런스 자동 연동의 계약과 운영 범위

## 20. 결정 기록

| 날짜 | 결정 |
| --- | --- |
| 2026-08-30 | 포트폴리오 제작 위저드를 디자인 선택, 레시피 생성, 포트폴리오 생성으로 단순화 |
| 2026-08-30 | 채용 공고 맞춤과 AI 인터뷰를 생성 후 편집 기능으로 이동 |
| 2026-08-30 | Recipe v2를 기록 선택, 구성, 표시 방식, 순서를 포함한 블루프린트로 정의 |
| 2026-08-30 | 블루프린트에 요소별 표시 방식 예시와 드래그 앤 드롭 편집 도입 |
| 2026-08-30 | 블루프린트 사용자 표면을 클릭·드래그·값 수정이 가능한 GUI 편집기로 확정 |
| 2026-08-30 | `DesignSystemSpecV2`를 디자인 시스템 원본 계약으로 정의 |
| 2026-08-30 | `DESIGN.html`에 `DESIGN.md` 전체 내용과 시각 예시, 공통 샘플 포트폴리오 포함 |
| 2026-08-31 | 디자인 문서 절 순서를 토큰 · 실제 화면 · 눈금 · 규칙 · 출처로 재배열 |
| 2026-08-30 | Expresso 기본, 유명 웹사이트, 자유 생성, 회사 웹사이트 디자인을 같은 카탈로그에서 제공 |
| 2026-08-30 | 페이지 생성은 자유 HTML 한 장과 판 보존 원칙 유지 |
