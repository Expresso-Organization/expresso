# 포트폴리오 구성안과 프로젝트 표현 v1

같은 가상 콘텐츠를 두 페이지 구성안과 프로젝트별 표현으로 렌더링해 구조화 생성의 선택 범위를 확장했습니다.

- **대표 사례 중심**은 목록형 인덱스 뒤에 이미지·과정·본문 중심 사례를 연결합니다.
- **갤러리 중심**은 대표 이미지와 보조 프로젝트, 펼쳐진 근거 자료를 중심으로 배치합니다.
- 각 프로젝트는 `media`, `process`, `text` 가운데 지원 가능한 표현을 선택합니다.
- 근거 자료는 프로젝트별 펼치기와 내용 펼쳐 보기 두 방식으로 제공합니다.
- 초기 조합 예제와 자유 생성 비교의 원본·캡처는 고정해 보존했습니다.

## 구성 계약

`scripts/library/renderer/portfolio/v1/catalog.mjs`가 구성안과 데이터 참조를 검증합니다. 외부 선택 입력은 다음처럼 작게 유지합니다.

```json
{
  "version": 1,
  "recipe": "featured",
  "cases": [
    { "projectId": "moa", "variant": "media" },
    { "projectId": "lumen", "variant": "process" },
    { "projectId": "ongil", "variant": "text" }
  ],
  "evidence": "grouped"
}
```

`compilePlan`은 이 입력을 실제 json-render spec으로 변환합니다. 프로젝트마다 `case-<projectId>`라는 고정 요소 ID를 만들고 `/projectById/<projectId>`로 내용을 연결합니다. 순서를 바꿔도 배열 위치에 따라 다른 내용이 붙지 않습니다. 공통 서체·색·간격은 기존 포트폴리오 테마를 사용합니다.

구성 입력에는 HTML, CSS, 원문을 받지 않습니다. 선택한 프로젝트가 빠지거나 중복되는 경우, 알 수 없는 ID, 허용되지 않은 표현, 존재하지 않는 근거를 검증 오류로 처리합니다. 같은 근거를 여러 프로젝트에서 인용해도 표시 영역과 DOM 앵커는 한 번만 생성합니다.

## 표현 조건

| 표현 | 필요한 데이터 | 배치 |
| --- | --- | --- |
| 이미지 중심 | 프로젝트 이미지 | 제목·설명과 큰 이미지를 같은 그리드 행에서 시작하고 문제·기여·결과를 이어서 표시 |
| 과정 중심 | 문제·기여·결과를 각각 가리키는 과정 참조 | 데스크톱 단계 열, 모바일 세로 단계 |
| 본문 중심 | 프로젝트 본문 | 소개와 문제·기여·결과를 나누어 배치 |

이미지가 없는 입력은 `media` 후보에서 제외됩니다. 검증용 구성안의 선호 표현이 불가능하면 `process` 또는 `text`를 선택합니다. 실제 이미지 요청이 실패하면 제목·분류를 보여주는 대체 화면을 표시합니다. 정적 HTML에는 제공 이미지를 포함합니다.

과정 표현은 새 사실을 생성하지 않고 기존 문제·기여·결과 필드를 참조합니다. 이 예제는 가상 루멘 노트에 과정 참조를 추가했습니다. 자유 생성에서 효과적이었던 큰 이미지와 자료 제목 연결을 반영했고, 그 결과에서 발견된 이미지 행 밀림을 명시적인 그리드 영역과 브라우저 정렬 검사로 방지했습니다.

근거의 화살표 단계 문장은 원문 순서를 유지해 목록으로 표시합니다. 그 외 본문은 원문 그대로 사용합니다. 모든 사례의 근거 링크에는 자료의 실제 제목이 표시됩니다.

## 포털과 출력

개발 포털의 **라이브러리 → 완성 페이지 → 포트폴리오 조합 예제**에서 페이지 구성과 입력을 전환합니다. 구성 JSON 버튼으로 선택 내용을 확인하고, 전체 spec·데이터 JSON 및 단일 HTML을 저장할 수 있습니다.

- 현재 예제: `docs/library/previews/portfolio/index.html`
- 초기 예제: `docs/library/previews/portfolio/baseline.html`
- 두 구성안: `featured-<scenario>.static.html`, `gallery-<scenario>.static.html`
- 구성 계약: `variants-plan-schema.json`
- 출처·코드 해시·후보 선택: `variants-sources.json`과 각 구성의 JSON

이번 화면의 선택은 재현 가능한 고정 구성안입니다. 모델이 직접 변형을 선택하는 호출, 제품 레시피·API·Worker 연결은 후속 작업입니다. 실제 경력 데이터와 CV는 사용하지 않았습니다.

## 검증

기본, 긴 문장, 이미지 없음, 프로젝트 8개 입력을 두 구성안에서 390·768·1440px로 확인합니다. 각 사례의 제목·요약·역할·기간·태그·문제·기여·결과, 근거 본문, 소개·경력·연락처의 보존을 검사합니다. 중복 ID, 끊어진 앵커, 이미지 오류, 가로 넘침, 이미지와 제목의 그리드 행 정렬도 검사합니다. 시각 검토에서 발견한 모바일 갤러리 제목의 너비 축소를 수정하고 긴 텍스트의 최소 읽기 폭 검사도 추가했습니다.

React 화면과 정적 HTML의 본문 일치, 키보드로 근거 펼치기, 실제 이미지 요청 실패, JavaScript 없는 정적 출력, 파일 다운로드, 포털 진입과 초기 예제 복귀를 확인합니다. 결과와 산출물 해시는 `variants-verification.json`에 기록합니다. 전체 데스크톱과 모바일 캡처는 별도로 시각 검토합니다. 검증 브라우저는 Chrome이며 최종 디자인 선택과 제품 데이터 검증은 별도입니다.

## 재현

```sh
pnpm --dir scripts/library/renderer install --ignore-workspace --frozen-lockfile
node --test scripts/library/renderer/portfolio/v1/catalog.test.mjs
node scripts/library/renderer/build-portfolio-variants.mjs
# 별도 터미널: python3 -m http.server 8924 --bind 127.0.0.1
node scripts/library/renderer/verify-portfolio-variants.mjs
node --test scripts/library/portfolio-variants.test.mjs scripts/library/portfolio-composition.test.mjs
```

기초 컴포넌트나 스타일을 갱신할 때는 먼저 `build-portfolio.mjs`로 초기 산출물을 재생성한 뒤 변형 빌드를 실행합니다. 초기 산출물이 바뀌면 해당 초기 검증도 다시 수행합니다. 자유 생성 비교 파일은 당시 결과의 기록으로 유지합니다.

## 관련 근거

- [초기 조합 실험](./portfolio-composition-v0.md)
- [구조화·자유 생성 비교](./portfolio-generation-comparison.md)
- 구현: `scripts/library/renderer/portfolio/v1/`
- 기존 Watermelon Card, Magic Portfolio Timeline, Componentry Annotated Text의 원본·이용 조건은 초기 `sources.json`과 `THIRD-PARTY-NOTICES.txt`에 보존합니다.
