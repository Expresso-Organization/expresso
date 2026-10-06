# 포트폴리오 라이브러리 1단계 수집 결과

공개 목록 탐색과 개발포털 연결을 완료했으며, 확인하지 못한 범위는 사이트별 후속 작업으로 기록했습니다.

- 조사한 사이트는 17곳이며, 공개 목록에서 발견한 항목은 9,437개입니다. 유형별 집계에는 컴포넌트 후보, 참고 사례, 아이콘 변형, 외부 공급자가 포함됩니다.
- 기존 개발포털의 **라이브러리** 탭에서 유형·사이트·분류·검색으로 목록을 탐색하고 출처와 수집 상태를 확인할 수 있습니다.
- 코드 확보, 프롬프트 원문 확보, 품질 검증, json-render 제품 등록은 아직 0개입니다. 다음 단계는 이용 가능한 후보의 상세 자료 확보입니다.
- OriginKit은 이용 범위 확인 대기, Design Spells는 HTTP 429로 남겼습니다. Watermelon·Supahero·Unsection·Bento Grids의 전체 범위도 추가 확인이 필요합니다.

실행일: 2026-09-22 · 실행 ID: `2026-09-22-stage-1` · 기준 계획: [수집 계획](./portfolio-component-collection-plan.md)

## 1. 개발포털

[개발포털 → 라이브러리](./Expresso%20개발%20포털.dc.html#/library)에서 확인합니다. 로컬 서버는 저장소 루트에서 `python3.13 scripts/serve-docs.py 8916`으로 실행할 수 있습니다.

화면에는 자료 유형 탭, 사이트 필터, 원본 분류, 이름·식별자 검색, 페이지 이동, 상세 창을 연결했습니다. 검색은 검색 버튼이나 Enter로 적용합니다. 검색·필터·페이지·선택 항목을 주소에 보존하며, 새로고침과 브라우저 뒤로 가기에도 복원합니다.

항목 카드는 **목록 수집**, **미리보기 미확보**, **이용 상태**를 표시합니다. 상세 창에서 공급자 식별자, 원본 판, 발견 위치, 같은 식별자의 여러 출처 주소를 확인합니다. 원본 사이트 URL이 같으면 관련 항목으로 연결하며, 동일한 컴포넌트인지는 후속 검토에서 판단합니다.

현재 포털은 빌드 없이 배포하는 DC HTML 문서입니다. 기존 내비게이션과 라우터에 표시 모듈을 연결하고 제품의 색상·서체 토큰을 재사용했습니다. 후속 컴포넌트 이식은 계획에 따라 shadcn registry와 기존 웹 컴포넌트를 우선 검토합니다.

## 2. 유형별 목록

| 유형 | 발견 항목 | 집계 단위 |
| --- | ---: | --- |
| 컴포넌트 후보 | 1,272 | registry 항목과 공개 컴포넌트 상세 경로; 블록·템플릿 포함 |
| 프롬프트 후보 | 52 | Motion 공개 갤러리 경로; 본문 미확보 |
| 디자인·기술 참고 | 4,523 | 섹션·사이트 사례, 앱, 용어, 문서·도구·hook 경로 |
| 모션 참고 | 2,135 | 60fps Shot·Motion 상세 경로 |
| 아이콘 | 908 | Rune 개별 SVG 파일; 스타일 변형 포함 |
| 다이어그램 | 167 | diagram-design 예제 HTML 경로; 테마·full 변형 포함 |
| 외부 공급자 | 380 | Shoogle Directory의 고유 공급자 ID |
| 검증된 페이지 구성 | 0 | 익스프레소에서 검증한 페이지 조합 |

항목 수는 수집 시점에 발견한 목록의 규모입니다. 사이트의 홍보 수치나 제품에서 사용할 수 있는 컴포넌트 수로 해석하지 않습니다. 서로 다른 사이트의 자료를 합쳐 구조별 고유 컴포넌트로 판정하는 작업은 3단계에서 수행합니다.

## 3. 사이트별 수집 범위

| 사이트 | 발견 수 | 이번에 처리한 범위 | 남은 확인 |
| --- | ---: | --- | --- |
| [Watermelon](https://ui.watermelon.sh/) | 1,091 | 고정 commit의 registry 1,074개와 사이트맵 합집합 | API 접근과 종류별 목록 대조, 항목별 의존성·라이선스 |
| [OriginKit](https://www.originkit.dev/docs/licensing) | 0 | 이용 조건에 따른 수집 보류 기록 | 카탈로그·메타데이터 미러링의 허용 범위 |
| [Motion](https://www.motionin.design/) | 52 | 홈페이지 링크와 sitemap의 공개 갤러리 | 분류별 소속, 프롬프트 저장·공개 조건 |
| [CodedVisuals](https://codedvisuals.com/visuals) | 115 | 공개 컴포넌트 링크·원본 분류 | AI builder 제한, 무료 항목의 별도 조건 |
| [diagram-design](https://github.com/cathrynlavery/diagram-design) | 229 | 예제 167개와 문서·도구 62개의 파일 경로 | 예제·구현 규칙 원문 확보, 한국어 콘텐츠 적합성 |
| [Kobra](https://kobra.systems/components/input-otp) | 73 | 공개 사이드바·사이트맵의 컴포넌트 | 요금제별 코드 이용·재배포 범위 |
| [Shoogle](https://shoogle.dev/directory) | 380 | 실제 페이지 링크를 따라 Directory 39페이지 | 각 공급자의 공식 registry·라이선스, Directory 밖 검색 |
| [Rune Icons](https://github.com/Nexvyn/runeicons) | 908 | normal·duotone·fill·pixelated·glass 개별 SVG 경로 | 실제 자산·고지 확보, glass와 다른 스타일의 관계 |
| [Navbar Gallery](https://www.navbar.gallery/) | 496 | 홈페이지·사이트맵의 navbar 경로 | 유형·스타일 목록의 소속과 사이트맵 밖 항목 |
| [Supahero](https://supahero.io/) | 573 | 홈페이지에 포함된 hero 링크 | robots는 404; 전체 총수·추가 페이지 여부 |
| [404s.design](https://www.404s.design/) | 240 | 홈페이지·사이트맵의 사례 합집합 | 스타일별 소속, 각 사례의 원본 URL |
| [footer.design](https://www.footer.design/) | 708 | 홈페이지·사이트맵의 사례 합집합 | 분류 소속, 관찰한 다음 페이지와 대조 |
| [CTA.gallery](https://www.cta.gallery/) | 497 | 홈페이지·사이트맵의 CTA 상세 경로 | 카테고리·업종·모드별 소속 |
| [Unsection](https://www.unsection.com/) | 1,000 | 공개 section 경로 | 정확히 1,000개인 목록의 제한 여부, 추가 페이지·유료 범위 |
| [Bento Grids](https://bentogrids.com/) | 285 | 홈페이지가 제공한 공개 목록 데이터 | 응답 밖 추가 항목, 개별 상세 링크 |
| [60fps.design](https://60fps.design/) | 2,790 | Shot·Motion·App·Appsite·용어 경로 | 분류별 소속, Storyboard 목록, 유료 영상·MCP 범위 |
| [Design Spells](https://designspells.com/) | 0 | 공식 홈페이지의 RSS 진입점 확인 | 홈페이지·robots 선행 탐색 및 RSS 요청의 HTTP 429 해소 |

`공개 목록 확인` 상태는 확보한 registry·파일 목록·사이트맵 또는 Directory 페이지를 처리했다는 뜻입니다. 사이트 전체를 빠짐없이 수집했다는 뜻은 포함하지 않습니다. 분류 주소와 다음 페이지는 `categories` 및 `nextActions`에 보존했습니다. 상세 페이지별 실제 제목·원본 링크·설명·미리보기는 2단계 대상입니다.

Watermelon의 목록은 컴포넌트 후보 1,084개와 helper·hook 7개로 나눴습니다. 사이트맵에만 있는 17개도 발견 위치를 유지합니다. Rune은 파일명·분류가 일치하는 354개 계열로 묶었으며, 별도 glass 파일은 대응 관계를 추정해서 합치지 않았습니다. diagram-design의 예제는 파일명의 테마·full 접미사를 기준으로 61개 계열을 기록했습니다. 구조적 동등성은 아직 검증하지 않았습니다.

## 4. 출처와 재현

| 산출물 | 경로 | 내용 |
| --- | --- | --- |
| 공급자 설정 | [`scripts/library/sources.json`](../scripts/library/sources.json) | 진입점, 식별 패턴, 권한 상태, 이용 조건 링크 |
| 수집기 | [`scripts/library/collect.py`](../scripts/library/collect.py) | 공개 목록 탐색, 캐시·실패 기록, 정규화·중복 연결, 공개 목록 생성 |
| 공개 목록 | [`docs/library/catalog.json`](./library/catalog.json) | 같은 ID를 쓰는 포털 목록·출처 명세·후속 작업·관계 |
| 실행 기록 | [`docs/library/collection-run.json`](./library/collection-run.json) | 요청 URL·응답 상태·시각·크기·SHA-256·Retry-After |
| 표시·검증 계약 | [`catalog-core.mjs`](./library/catalog-core.mjs) | 자료 유형, 상태, URL 검증, 검색·페이지 처리, 공유 주소 |
| 로컬 캐시 | `artifacts/portfolio-library/cache/` | 응답 원문과 요청별 기록; Git 추적 제외 |

수집 요청 80건 중 78건에서 HTTP 200을 받았습니다. Supahero robots는 404, Design Spells RSS는 429였습니다. 실패 응답도 기록하며 같은 실행에서 자동으로 반복 요청하지 않습니다. OriginKit은 목록 미러링 제한 때문에 대량 요청 대상에서 제외했습니다.

제목이 목록에 없으면 URL 식별자나 파일명에서 표시 이름을 만들고 `titleSource`로 구분합니다. `sourceItemId`와 원본 경로를 보존합니다. 식별자가 같은 발견은 하나로 합치고 `sourceUrls`·`discoveredFrom`을 모두 유지했습니다. 같은 원본 URL을 참조하는 17개 관계 묶음도 기록했습니다.

고정한 저장소 commit:

- Watermelon: `0099addd50a985bf53bdb81140ab4b72fc0668ce`
- diagram-design: `dc1ace47b99a419e42d01a03cb6ace5346efa8ae`
- Rune Icons: `f649e467d1bc9f272aae3f8daa329d4c924e7340`

공개 산출물에는 최소 메타데이터와 자체 수집 기록을 넣었습니다. 구성 파일의 이용 상태는 선행 조사에 따른 분류이며, 코드·이미지·프롬프트 각각의 공개 배포 권한은 상세 수집에서 확인합니다. 원본 미디어와 유료 코드·프롬프트는 공개 목록에 들어 있지 않습니다.

### 실행과 갱신

Python 3.10 이상을 사용합니다. 이 기기에서는 `python3.13`으로 실행했습니다.

```bash
# 이전 성공·실패 응답을 재사용하고, 캐시에 없는 공개 주소를 수집합니다.
python3.13 scripts/library/collect.py --run-id 2026-09-22-stage-1

# 네트워크 요청 없이 같은 캐시에서 다시 생성합니다.
python3.13 scripts/library/collect.py --offline --run-id 2026-09-22-stage-1

# 후속 실행에서 최신 응답을 확인합니다. 서버의 재시도 안내를 먼저 확인합니다.
python3.13 scripts/library/collect.py --refresh --run-id YYYY-MM-DD-stage-1-refresh
```

캐시는 로컬에 남습니다. 새 체크아웃에는 공개 목록과 실행 기록이 제공되며, 원문 캐시가 없으면 온라인 수집으로 시작합니다. 저장소의 최신 main으로 다시 수집하면 고정 commit과 항목 수가 달라질 수 있습니다. `--offline` 재생성은 기존 실행의 commit·응답을 재사용합니다.

1단계의 상세 정보는 목록 JSON에 함께 실었습니다. 화면에는 한 번에 36개 카드만 렌더링합니다. 원문·미리보기 확보로 데이터가 커지면 계획의 `items/`·`previews/` 구조로 분리합니다. `tokens.css`는 제품 토큰 원본에서 수집기가 복사하며 자동 검사로 두 파일의 일치를 확인합니다.

## 5. 검증 결과

| 검사 | 결과 |
| --- | --- |
| 목록 무결성·URL·권한 상태·집계·관계 | Node 검사 6개 통과 |
| URL 정규화·중복 경로 보존·429 캐시 재개 | Python 검사 3개 통과 |
| 오프라인 재생성 | 공개 목록·실행 기록이 동일하게 생성됨 |
| 실제 포털 | 기존 탭 왕복, 유형·사이트·검색·페이지 이동, 상세 공유 주소, 새로고침·뒤로 가기 확인 |
| 키보드 | Escape로 상세 닫기, 선택했던 카드로 포커스 복원 확인 |
| 화면 크기 | 데스크톱과 390px 모바일 확인; 모바일 문서 폭 390px, 가로 넘침 없음 |
| 상태 화면 | 빈 목록·검색 결과 없음·미리보기 없음·503 실패·재시도 중 로딩·복구 확인 |
| `pnpm typecheck` | 통과 |
| 백엔드 단위 검사 | 306개 통과, 인프라 조건 등 371개 건너뜀 |
| `pnpm test` | 기존 `PropertyValueEditor.test.tsx`의 숫자 입력 오류 안내 테스트 1건 실패; 개별 실행에서도 재현 |

전체 테스트 전 editor·contracts·database를 빌드했습니다. 실패한 테스트와 대상 컴포넌트는 이번 변경에서 수정하지 않았고 HEAD와 동일합니다. 해당 테스트는 잘못된 숫자 입력 후 오류 안내에 `숫자`가 포함되기를 기대하지만 빈 문자열을 받았습니다. 이 문제는 별도 수정 대상입니다.

문서 검토에서는 발견 수와 코드 확보 수의 구분, 제목의 명사형, 집계 단위, 접근 실패와 추정의 표시를 확인했습니다. 모호한 `목록 판 확인` 표기는 `공개 목록 확인`으로 고쳤습니다.

## 6. 다음 단계

1. Watermelon의 히어로·프로젝트 목록·성과·타임라인 후보에서 코드, 의존성, 라이선스, 예제 입력을 확보합니다.
2. diagram-design의 예제·참고 규칙과 Rune의 필요한 SVG·고지를 고정 commit에서 확보합니다.
3. Shoogle 공급자를 라이선스와 포트폴리오 역할로 분류하고, 공식 registry 목록을 확장합니다.
4. Supahero·Unsection·Bento 및 주요 갤러리에서 원본 링크·레이아웃·콘텐츠 요구를 기록합니다. 분류별 소속과 추가 페이지도 대조합니다.
5. OriginKit·CodedVisuals·Kobra의 이용 조건, Motion 프롬프트의 저장·공개 범위를 확인합니다. Design Spells는 응답 제한이 해소되면 재개합니다.
6. 확보한 자료를 같은 ID에 연결하고, 허용된 미리보기·본문·파일 경로부터 라이브러리 상세에 표시합니다.

## 7. 관련 근거

- [기존 레퍼런스 조사](./portfolio-component-reference-research.md): 사이트 성격과 공식 이용 조건.
- [수집 계획](./portfolio-component-collection-plan.md): 1단계 산출물과 포털 초기 구현 범위.
- [공개 목록](./library/catalog.json): 사이트별 발견 수·분류 주소·후속 작업·고정 판.
- [요청별 실행 기록](./library/collection-run.json): 실제 조회 주소와 응답 상태·해시.
- [개발포털 설명](../services/dev-portal/README.md): 기존 화면과 공개 배포 경계.
