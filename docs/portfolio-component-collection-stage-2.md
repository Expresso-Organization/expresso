# 포트폴리오 라이브러리 2단계 수집 결과

원본 소스·자산과 공개 참고 자료를 확보하고, 개발포털에서 실제 화면과 자료 묶음을 확인할 수 있도록 연결했습니다.

- 원본 소스·자산 2,210개, 공개 참고 자료 6,589개, 자체 작성 프롬프트 6개를 연결했습니다.
- 화면·이미지 미리보기는 7,784개입니다. 자체 프롬프트 6개는 본문 일부를 카드에 표시합니다.
- Watermelon 예제 120개를 실제 브라우저에서 렌더링해 정적 카드로 저장했습니다. 상세 창의 **실행 예제 보기**로 동작을 확인할 수 있습니다.
- 이용 범위 확인 240개, 소스 연결 확인 18개, 공급자 탐색 대상 380개는 사유와 원본 링크를 남겼습니다. OriginKit과 Design Spells는 출처 단위로 대기 상태를 유지합니다.

실행일: 2026-09-23 · 실행 ID: `2026-09-23-stage-2` · [개발포털 라이브러리](./Expresso%20개발%20포털.dc.html#/library) · [수집 계획](./portfolio-component-collection-plan.md)

## 1. 확보한 자료

| 출처 | 확보 결과 | 미리보기 |
| --- | --- | --- |
| Watermelon | 고유 registry 소스 1,073개, 파일별 해시·의존성·import·props 선언·설치 명령 | 포트폴리오 관련 예제 120개를 로컬 렌더링 |
| Rune Icons | 원본 SVG 908개와 Apache-2.0 LICENSE | SVG 908개 직접 표시 |
| diagram-design | 예제 HTML 167개, 참고 문서·도구 62개, MIT LICENSE | 예제 167개 정적 표시 |
| Navbar Gallery | 상세 페이지 496개와 원본 링크·참고 이미지 | 공식 이미지 496개 |
| Supahero | 상세 페이지 573개와 원본 링크·참고 이미지 | 공식 이미지 573개 |
| 404s.design | 상세 페이지 240개와 원본 링크·참고 이미지 | 공식 이미지 240개 |
| footer.design | 상세 페이지 708개와 원본 링크·참고 이미지 | 공식 이미지 708개 |
| CTA.gallery | 상세 페이지 497개와 원본 링크·참고 이미지 | 공식 이미지 497개 |
| Unsection | 상세 페이지 1,000개와 원본 링크·참고 이미지 | 공식 이미지 1,000개 |
| Bento Grids | 공개 목록 데이터·원본 링크·이미지 경로 285개 | 공식 이미지·영상 포스터 285개 |
| 60fps.design | 상세 페이지 2,790개와 이미지·영상 포스터 | 공식 이미지·포스터 2,790개 |
| Expresso | 콘텐츠 적합성·사례 구성·이식·레시피·모션 관찰·품질 검토 프롬프트 6개 | 본문 미리보기·복사, 실행 전 표시 |

공개 상세 페이지 요청 6,304건은 모두 HTTP 200을 받았습니다. 갤러리 이미지는 원본 호스트의 공개 URL로 연결했습니다. 원본 영상 파일이나 유료 명세를 공개 저장소에 복제하지 않았습니다. 외부 이미지의 삭제·접근 제한이 발생하면 출처 확인 안내를 표시합니다.

Watermelon의 원본 registry에는 1,074개 행이 있으며 `portfolio-dashboard`가 중복되어 고유 이름은 1,073개입니다. 1단계 합집합 1,091개 중 나머지 18개는 고정 registry의 코드와 직접 대응하지 않았습니다. 두 수의 차이를 새 컴포넌트 확보 수로 계산하지 않았습니다.

## 2. 미리보기와 자료 상세

기존 라이브러리 탭의 카드에 시각 자료를 먼저 배치했습니다. 검색·자료 유형·사이트·원본 분류에 **포트폴리오 역할**과 **확보 상태** 필터를 추가했습니다. 필터와 선택 항목은 공유 주소에 보존합니다.

각 상세 창에서 다음을 확인합니다.

- 원본 코드 또는 참고 이미지와 출처.
- 확보 상태, 이용 조건, 파일·해시, 원본 commit.
- React 코드의 설치 명령, npm·registry 의존성, 실제 import, 추출한 props 선언, 원본 코드 보기.
- 예제에 사용한 데모 입력과 브라우저 표시 검사 결과.
- 자체 프롬프트의 목적, 입력 변수, 출력 형식, 버전, 본문 복사.
- 역할 분류의 근거와 아직 수행하지 않은 검토.

Watermelon 미리보기는 원본 코드를 그대로 두고 별도 예제에서 익스프레소 역할 토큰과 데모 입력을 적용했습니다. 필수 props와 Provider가 필요한 예제는 입력 또는 공급자의 demo 진입점을 연결했습니다. 정적 카드에는 브라우저에서 실제로 표시된 스타일을 저장했습니다. 모션의 초기 투명도가 남지 않도록 계산된 스타일을 반영하며, 카드에서는 스크립트를 실행하지 않습니다.

상세 창에서 실행 예제를 선택하면 격리된 iframe 하나를 활성화합니다. 코드 예제에는 공급자의 데모 문구·이미지·수치가 포함되며 실제 사용자 경력과 구분합니다. 모든 예제를 제품용 콘텐츠로 검증했다는 뜻은 포함하지 않습니다.

diagram-design은 원본을 텍스트 파일로 보존하고 미리보기에서는 스크립트와 외부 폰트를 제외했습니다. 따라서 애니메이션 예제도 카드에서는 정적 상태로 보입니다. SVG는 script·이벤트 핸들러·외부 참조 검사를 거쳐 이미지로 표시합니다.

## 3. 이용 조건과 남은 확인

| 대상 | 현재 상태 | 후속 행동 |
| --- | --- | --- |
| OriginKit | 카탈로그·메타데이터 미러링 제한에 따라 출처 단위 대기 | 익스프레소 라이브러리·생성 결과 배포의 허용 범위 확인 |
| Motion 52개 | 공식 약관에서 프롬프트 재배포·경쟁 컬렉션 구축·갤러리 수집 제한 확인 | 권한 확인 후 재개; 기존 공개 링크만 유지 |
| CodedVisuals 115개 | 상용 라이선스의 AI builder·site builder 이용 제한 | 무료 항목의 개별 조건 또는 별도 허용 확인 |
| Kobra 73개 | 코드 재배포·생성 라이브러리 이용 범위 확인 필요 | 해당 이용 방식의 라이선스 확인 |
| Watermelon 18개 | 고정 registry에 대응하는 코드 파일 미확인 | 별칭·공급자 상세·다른 원본 경로 대조 |
| Shoogle 380개 | 공급자 디렉터리 항목 | 3단계에서 공급자별 공식 registry와 라이선스 확장 |
| Design Spells | 2026-09-23 공식 RSS 재확인에서도 HTTP 429 | 재시도 안내와 접근 상태에 따라 후속 실행 |

역할은 이름·원본 분류·자료 유형으로 일차 대응했으며 근거와 방법을 함께 표시합니다. 갤러리 원본 사이트의 전체 동작, 반응형 실측, 콘텐츠 길이의 한계는 아직 검증하지 않았습니다. 상세 JSON의 `visualReview`, `responsiveReview`, `interactionReview`에 이 상태를 남겼습니다. 이후 검토에서는 확보한 원본 이미지·링크·소스에 실제 경력 데이터를 적용해 판단합니다.

## 4. 저장과 재실행

| 경로 | 내용 |
| --- | --- |
| [`library/acquisitions.json`](./library/acquisitions.json) | 1단계 ID에 연결한 확보 결과·미리보기·역할·상세 경로와 자체 프롬프트 추가 항목 |
| [`library/acquisition-run.json`](./library/acquisition-run.json) | 저장소 archive 해시·commit, 상세 응답·이용 조건 조회 기록 |
| `docs/library/items/` | 항목별 자료 묶음과 수집·검토 상태 |
| `docs/library/materials/` | 허용된 registry JSON·SVG·문서·LICENSE 원문 |
| `docs/library/previews/` | 정적 예제, 실행 예제, 렌더링 검사와 의존성 고지 |
| `scripts/library/` | 다운로드·추출·정규화·검사 도구 |
| `artifacts/portfolio-library/stage-2/` | 로컬 응답·원본 저장소·중간 캐시; Git 추적 제외 |

1단계 목록은 유지하고 2단계 결과를 ID로 연결합니다. 상세 파일은 선택한 항목만 읽습니다. 화면에는 페이지당 36개 카드가 표시되며 이미지와 iframe은 지연 로딩합니다.

```bash
python3.13 scripts/library/fetch_repositories.py
python3.13 scripts/library/fetch_details.py
pnpm --dir scripts/library/renderer install --ignore-workspace --ignore-scripts --frozen-lockfile
node scripts/library/renderer/build.mjs
python3.13 scripts/library/preview_server.py
```

마지막 명령은 로컬 검증 서버를 실행합니다. 브라우저에서 `http://127.0.0.1:8918/scripts/library/renderer/check.html?page=1`을 열고 페이지를 넘기면 실제 렌더링과 정적 카드가 저장됩니다. 표시는 1,280×880px 기준이며, 검사 결과는 `verification.json`에 남습니다. 코드나 예제 입력을 바꿨으면 새로 확인합니다.

```bash
python3.13 scripts/library/acquire.py
node --test scripts/library/catalog.test.mjs scripts/library/acquisition.test.mjs
python3.13 -m unittest discover -s scripts/library -p 'test_*.py'
python3.13 scripts/serve-docs.py 8916
```

수집기는 성공·실패 응답을 캐시에 남기고, 401·403·429가 발생한 호스트의 추가 요청을 중단합니다. 새로운 실행 전에는 공급자 이용 조건을 재확인합니다. 원본 파일과 미리보기의 해시를 검사하며, 원본 라이선스와 미리보기 빌드 의존성 고지를 함께 보존합니다.

## 5. 검증 결과

- Node 검사 10개와 Python 검사 7개가 통과했습니다. 항목 ID, 전체 대상의 처리 결과, 파일 해시, 미리보기 경로, URL 제한, 역할·상태 필터와 정적 카드의 스크립트 제거를 검사했습니다.
- Watermelon 예제 120개 모두 브라우저에서 표시됐으며, 계산된 스타일을 적용한 정적 화면을 저장했습니다. 제품 품질 인증과 구분합니다.
- 포털에서 실제 카드, 상세 이미지, 원본 코드, 프롬프트 복사, 필터·공유 주소와 작은 화면을 확인했습니다.
- `pnpm typecheck`는 통과했습니다. `pnpm test`에는 1단계에서도 재현된 `PropertyValueEditor.test.tsx`의 숫자 오류 안내 테스트 1건 실패가 남아 있습니다. 해당 제품 코드는 변경하지 않았습니다.

문서는 원본 확보 수, 외부 이미지 연결 수, 브라우저 표시 확인, 제품 등록을 분리해 검토했습니다. 제품 등록과 실제 경력 데이터의 품질 검증은 0개입니다.

## 6. 관련 근거

- [1단계 결과](./portfolio-component-collection-stage-1.md), [실행 계획](./portfolio-component-collection-plan.md).
- [Watermelon 원본](https://github.com/WatermelonCorp/watermellon-registry/tree/0099addd50a985bf53bdb81140ab4b72fc0668ce), [diagram-design 원본](https://github.com/cathrynlavery/diagram-design/tree/dc1ace47b99a419e42d01a03cb6ace5346efa8ae), [Rune Icons 원본](https://github.com/Nexvyn/runeicons/tree/f649e467d1bc9f272aae3f8daa329d4c924e7340).
- [Motion 이용 조건](https://www.motionin.design/terms), [OriginKit 이용 조건](https://www.originkit.dev/docs/licensing), [CodedVisuals 라이선스](https://codedvisuals.com/license), [Kobra 이용 조건](https://kobra.systems/terms).
- [상세 수집 기록](./library/acquisition-run.json), [실제 렌더링 기록](./library/previews/watermelon/verification.json).
