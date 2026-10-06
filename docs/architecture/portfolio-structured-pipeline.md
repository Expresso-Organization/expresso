# 구조화 포트폴리오 생성

포트폴리오 생성기는 선택 자료를 내용 JSON으로 정리하고, 모델이 고른 json-render Spec을 등록된 컴포넌트로 렌더링합니다.

- 제품 API와 Worker가 같은 생성기·렌더러를 사용합니다.
- 이름을 가장 크게 표시하고, 바로 아래에 직무와 구체적인 작업을 설명하는 짧은 한 문장을 둡니다.
- 소개·기사형, 작품 전시형, 목차·상세형을 선택하고, 각 사례의 지면과 중간 섹션 순서를 따로 선택합니다.
- 내용·Spec·HTML·CSS를 함께 저장합니다. 직접 편집은 새 판을 만들며, 이미 배포한 판은 유지합니다.
- 예제는 가상 인물과 가상 프로젝트만 사용합니다. 사용자 CV를 공개 예제에 넣지 않습니다.

## 생성과 렌더링

`StructuredPageGenerator`의 첫 호출은 작성자 이름, 선택 섹션, 해당 근거와 업로드 이미지에서 표시용 내용을 정리합니다. 이름·섹션·근거 ID와 이미지 주소를 검사합니다. 모델이 수치나 경력을 지어내지 않도록 지시하고, 생성한 수치는 기존 근거 대조 경고를 적용합니다. 이 경고가 모든 사실의 정확성을 보증하지는 않습니다.

두 번째 호출은 `structuredModelSchema(content)`에 따라 Spec을 만듭니다. 입력 식별자와 데이터 참조는 고정하고 지면·순서·팔레트·서체·모션을 선택합니다. 이름 소개는 맨 앞, 제공된 연락처는 맨 뒤에 둡니다. 누락·중복·잘못된 참조를 거부하며, 실패하면 한 번 수정 요청을 보냅니다. 사용자가 생성 전에 선택한 스타일은 모델 선택보다 우선합니다.

`packages/portfolio-renderer`는 실제 `@json-render/core` Catalog와 `@json-render/react` Registry/Renderer를 사용합니다. 서버에서 HTML을 만들고 같은 CSS를 제품 미리보기와 저장 문서에 사용합니다. 모델이 HTML/CSS를 자유 작성하는 경로는 `PAGE_GENERATION_FORMAT=html`로 유지합니다. 기본값은 `json-render`이며 AI 공급자의 기본값 `off`는 유지합니다.

## 선택 가능한 지면

| 항목 | 표시 방식 |
| --- | --- |
| editorial | 측면의 이름·소개와 우측 기사 |
| gallery | 큰 이름, 대표 작품과 넓은 작품 전시 |
| dossier | 상단 소개·대표 자료, 측면 목차와 기술 상세 |
| CaseEssay | 제목과 설명을 나눈 기사 |
| CaseGallery | 제공 이미지를 크게 전시하는 작품 |
| CaseTechnical | 이미지와 항목표로 구성한 기술 설명 |
| CaseProcess | 단계별 설명 |
| ContentPanel | 자기소개·능력 등의 추가 내용 |

프로젝트 목차는 목록·모자이크·측면 목차를 선택합니다. 경력, 근거와 연락처는 별도 컴포넌트입니다. 일반 등장·스크롤 모션과 이미지 호버 모션은 CSS로 구현하며, 모션 감소 설정과 인쇄 모드에서는 끕니다. 스크롤 타임라인을 지원하지 않는 브라우저에서도 내용이 보입니다.

수집한 Watermelon 카드·벤토와 Magic Portfolio 타임라인의 구도를 데이터 어댑터로 재구성했습니다. 구체적인 자료 경로와 변환 범위는 `STRUCTURED_COMPONENT_SOURCES`에 기록합니다. 수집 라이브러리 전체가 생성 Registry에 연결된 상태는 아닙니다. 이번 생성기에 연결된 지면은 위 표와 보조 컴포넌트입니다.

## 이미지와 개인정보

실제 생성은 선택 자료에 참조된 본인 소유 업로드 이미지와 이미 배치한 미디어만 가져옵니다. 이미지가 없는 사례는 글과 실제 설명 항목으로 표시합니다. 가상의 도표·UI·성과 이미지를 자동으로 만들지 않습니다. `CaseGallery`는 제공 이미지가 있어야 사용할 수 있습니다.

이번 비교에 사용한 SVG는 기존 가상 프로필 시험에서 코드로 미리 만든 입력 자산입니다. 모델은 그 이미지를 그리지 않았습니다. 공개 실행 기록에는 가상 데이터라는 표시, 실제 모델 응답과 렌더링 해시를 포함합니다.

## 저장과 직접 편집

기존 `generatedPages.generationManifest.structured`에 내용과 Spec을 저장합니다. 별도 컬렉션이나 마이그레이션은 필요하지 않습니다. 재생성은 저장 내용을 보존하고 Spec을 바꿉니다. 문장은 제품 편집 화면의 속성 탭에서 직접 고칩니다.

`PATCH /v1/portfolios/:id/page/composition`은 Spec과 허용된 텍스트 경로만 받습니다. 근거 ID와 이미지 경로는 직접 문장 편집으로 바꿀 수 없습니다. 소유권과 예상 판 번호를 확인하고 MongoDB 트랜잭션에서 새 판을 저장합니다. 동시 수정은 409를 반환합니다. 직접 고른 레이아웃은 다음 생성 스타일에도 반영합니다. AI가 꺼져 있어도 조회·직접 편집은 사용할 수 있습니다.

제품의 기존 미리보기·HTML 문서·배포 스냅샷 경로를 재사용합니다. 편집 후 다시 배포하기 전까지 공개 페이지는 기존 스냅샷을 유지합니다.

## 검증

2026-10-06의 세 가상 프로필 실행은 같은 생성기와 기본 요청으로 `qwen3.8:27b-q4_K_M`을 호출했습니다. 준비된 내용 JSON에서 Spec을 생성하는 비교 실험입니다. 서로 다른 골격을 선택했고, HTML 해시·원본 모델 Spec·내용 보존·이미지·앵커·모바일 넘침·모션 감소·JavaScript 없는 표시를 확인했습니다.

- [세 프로필 비교](../library/previews/portfolio/runs/structured-layouts-2026-10-06/index.html)
- [브라우저 검증 기록](../library/previews/portfolio/runs/structured-layouts-2026-10-06/verification.json)

별도 실행에서는 가상 로봇 엔지니어의 원본 섹션·근거만 입력해 내용 정리와 Spec 생성 두 호출을 수행했습니다. 업로드 이미지와 연락처를 제공하지 않았으며, 출력에도 추가되지 않았습니다. 로컬 서버의 JSON Schema grammar가 큰 문자열 길이 제한을 거부해 내용 정리 호출은 JSON 모드로 받고 같은 Zod 계약으로 검증했습니다. Spec 호출에는 구조화 출력 스키마를 사용했습니다.

- [원본 자료부터 생성한 결과](../library/previews/portfolio/runs/structured-normalized-2026-10-06/robotics-engineer/index.html)
- [두 호출의 원본 응답](../library/previews/portfolio/runs/structured-normalized-2026-10-06/robotics-engineer/model-record.json)

재현 명령은 다음과 같습니다. Ollama와 문서 미리보기 서버가 필요합니다. 실행 ID는 기존 결과를 덮어쓰지 않는 새 값으로 지정합니다.

```bash
PORTFOLIO_TEST_MODEL=qwen3.8:27b-q4_K_M PORTFOLIO_RUN_ID=structured-new-run \
  node --import ./services/backend/node_modules/tsx/dist/loader.mjs scripts/library/renderer/run-structured-profiles.ts
node scripts/library/renderer/verify-structured-profiles.mjs structured-new-run
```

`PORTFOLIO_NORMALIZE=1 PORTFOLIO_PROFILE=robotics-engineer`를 추가하면 원본 자료부터 시작합니다. 원본 모델 응답과 입력 프롬프트를 실행 디렉터리에 저장합니다. 실제 개인정보를 사용하는 실행 기록은 공개 예제 디렉터리에 저장하지 않습니다.

9B 모델의 초기 시도에서는 구도가 수렴하거나 섹션 중복 오류가 발생했습니다. 세 가상 입력의 성공으로 다른 입력이나 더 작은 모델의 품질을 일반화하지 않습니다. 이미지와 더 긴 자료의 입력 조합은 후속 회귀 사례로 계속 늘릴 수 있습니다.

`pnpm typecheck`, `pnpm test`, `pnpm test:infra`, 웹 빌드를 수행했습니다. 실제 MongoDB에서 저장·편집·판 충돌·소유권·배포 스냅샷 보존을 확인했고, 제품 편집 화면에서도 레이아웃·문장 저장과 미리보기 반영을 확인했습니다. 인프라 테스트 중 별도 환경이 필요한 기존 테스트는 건너뜁니다.

제품 운영 배포는 `.github/workflows/web-deploy.yml`의 `MONGODB_CUTOVER_APPROVED` 승인 조건을 따릅니다. 개발 포털의 예제 배포와 제품 운영 배포 상태를 구분합니다.
