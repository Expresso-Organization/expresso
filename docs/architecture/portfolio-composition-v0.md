# 포트폴리오 조합 실험 v0

가상 콘텐츠와 고정 JSON을 실제 json-render에 연결해 완성 페이지와 정적 HTML을 생성합니다.

- 개발 포털 라이브러리의 **완성 페이지 → 포트폴리오 조합 예제**에서 엽니다.
- 소개, 프로젝트 목록, 사례 상세, 경력, 근거 자료, 연락처의 여섯 섹션을 지원합니다.
- 기본, 긴 문장, 이미지 없음, 프로젝트 8개 입력을 같은 구성과 테마로 비교합니다.
- 현재 범위는 개발 포털의 조합 실험입니다. AI 호출, 제품 생성 API·Worker, 레시피 편집·저장·배포에는 연결하지 않았습니다.

## 구성과 입력

`scripts/library/renderer/portfolio/catalog.mjs`의 Catalog는 섹션과 해석된 props를 정의합니다. `generationSchema`는 모델이 출력할 수 있는 JSON을 더 좁게 정의합니다. 루트 한 개, 여섯 섹션, 고정된 `$state` 참조만 허용합니다. 원문 콘텐츠는 JSON 구조와 분리된 state로 공급합니다.

`validatePortfolio`는 Zod 입력 계약, 등록된 컴포넌트, 고유 식별자, 누락·순환·고립 노드, 허용 데이터 경로, 프로젝트와 근거의 연결을 검사합니다. 이 실험의 데이터 계약은 `fictional: true`와 `example.com` 연락처를 요구합니다. 인물·조직·경력·성과는 새로 지어낸 데이터이며 사용자의 CV나 포트폴리오를 사용하지 않았습니다.

Registry는 같은 컴포넌트를 React 실행 화면과 서버 정적 렌더링에 사용합니다. 단일 HTML에는 CSS, 이미지, 라이선스 고지를 넣습니다. 다운로드한 파일은 서버와 JavaScript 없이 열 수 있습니다.

## 컴포넌트와 적용 범위

| 단위 | 구현 출처 | 적용 범위 |
| --- | --- | --- |
| Hero | Componentry Annotated Text + 자체 섹션 | 짧은 강조 구절, 한국어 소개, 역할과 전문 분야 |
| ProjectGrid | Watermelon의 shadcn Card 구성 | 프로젝트 1~8개, 이미지 유무와 실패 대체, 사례 앵커 |
| CaseStudies | 자체 어댑터 | 문제·담당 작업·결과·근거 연결 |
| CareerTimeline | Magic Portfolio Timeline | 기간·조직·역할·담당 작업 |
| EvidenceList | 자체 어댑터, 네이티브 details | 키보드로 펼칠 수 있는 가상 설계 자료 |
| Contact | 자체 어댑터 | 예제 연락처와 가상 데이터 설명 |

수집된 원본은 그대로 보존합니다. 빌드 시 import 경로를 해석하고 Card와 Timeline에 공통 테마를 적용합니다. Annotated Text의 그리기 애니메이션은 정적 출력의 일치를 위해 끕니다. 무거운 스크롤·3D 효과는 이 첫 지면의 후보에 포함하지 않았습니다. 원본 파일 해시와 적용 설명은 생성된 `sources.json`에 기록합니다.

## 검증

`node --test scripts/library/renderer/portfolio/catalog.test.mjs`는 입력과 구조, 잘못된 참조, 예제 전용 데이터 조건, 순서 변경 시 콘텐츠 보존을 확인합니다.

`node scripts/library/renderer/verify-portfolio.mjs`는 네 입력을 390·768·1440px에서 검사합니다. 가로 넘침, 이미지 로드, 목차·사례·근거 앵커, 이미지 없는 대체, 모션 감소, React와 정적 HTML의 내용 일치를 확인합니다. 입력 전환, JSON 열기, 키보드 펼치기, 파일 다운로드, 실제 이미지 요청 실패, JavaScript 없는 페이지, 개발 포털 진입 링크도 검사합니다. 결과와 산출물 해시는 `docs/library/previews/portfolio/verification.json`에 저장합니다.

브라우저 자동 검사는 디자인 품질의 최종 판단을 대신하지 않습니다. 첫 지면의 전체 데스크톱·모바일 캡처를 검토하고 긴 문장과 이미지 없는 화면도 별도로 살펴봅니다. 현재 검증은 Chrome이며 다른 브라우저·인쇄 PDF·제품 데이터·성능 예산 검증은 남아 있습니다.

## 실행

```sh
pnpm --dir scripts/library/renderer install --ignore-workspace --frozen-lockfile
node --test scripts/library/renderer/portfolio/catalog.test.mjs
node scripts/library/renderer/build-portfolio.mjs
# 별도 터미널: python3 -m http.server 8922 --bind 127.0.0.1
node scripts/library/renderer/verify-portfolio.mjs
```

초기 예제의 브라우저 주소는 `/docs/library/previews/portfolio/baseline.html`입니다. 현재 `index.html`은 [구성안과 프로젝트 표현 v1](./portfolio-composition-variants-v1.md)을 엽니다. `PORTFOLIO_PREVIEW_BASE`로 `/docs`까지 포함한 서버 주소를 바꿀 수 있습니다. 생성 입력 계약과 카탈로그 프롬프트는 각각 `generation-schema.json`, `catalog-prompt.txt`로 함께 생성합니다.

## 다음 연결

첫 지면의 시각 검토 후, 검증된 섹션의 제품용 콘텐츠 계약을 `packages/contracts`로 옮기고 레시피의 요소·근거 참조를 연결합니다. 이후 AI가 제한된 구성 JSON을 생성하도록 연결하고, 저장한 JSON과 고정된 컴포넌트 버전으로 미리보기와 배포 결과를 재현합니다. 기존 자유 HTML 결과와 보류된 `v2-library` 실험의 전환은 별도 구현으로 다룹니다.

## 근거

- [json-render Catalog](https://json-render.dev/docs/catalog), [Registry](https://json-render.dev/docs/registry): 공식 API와 데이터 참조 방식. 설치 버전 0.21.0.
- [shadcn Card](https://ui.shadcn.com/docs/components/base/card): CardHeader·CardTitle·CardDescription·CardContent·CardFooter 조합.
- 수집 원본: `docs/library/materials/watermelon/registry/card.json`, `magic-portfolio/timeline.json`, `componentry/source/annotated-text.tsx`.
- 산출물: `docs/library/previews/portfolio/`.
