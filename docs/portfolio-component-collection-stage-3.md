# 포트폴리오 라이브러리 3단계 재분류·보강 결과

역할 분류 오류를 수정하고 경력·학력·프로젝트·연구 본문 후보를 보강했으며, 생성 연결 전에는 입력 정규화와 실제 콘텐츠 검증이 필요합니다.

- 기존 자료의 역할 분류 132건이 바뀌었습니다. 규칙 수정 결과와 원본 코드 검토 결과를 구분해 저장했습니다.
- 본문과 용도가 다른 채용·일정·금융·업무 관리 UI 7개를 본문 후보에서 제외했습니다.
- 공식 저장소 5곳에서 지정 소스 17개와 MIT 고지를 확보했습니다. React 컴포넌트 5개, 페이지·Liquid 구조 참고 12개입니다.
- 기존 자료와 신규 자료를 합쳐 이식 후보 9개, 구조 참고 16개를 선별했습니다. 나머지 9,428개는 선별 대기입니다.
- 코드 본문 동일 묶음 5개와 이름 계열 153개를 연결했습니다. 이름 계열의 구조 동일성은 검토 전입니다.

검토일: 2026-09-26 · [라이브러리 이식 후보](./Expresso%20개발%20포털.dc.html#/library?selection=shortlisted) · [구조 참고](./Expresso%20개발%20포털.dc.html#/library?selection=reference)

## 1. 역할 분류

`catalog.json`과 `acquisitions.json`은 수집 당시 상태를 보존합니다. 새 `curation.json`을 마지막에 결합해 포털의 역할·선별 상태·계열 관계를 갱신합니다. `curation.json`에는 변경 전후 역할과 근거가 있습니다.

| 항목 | 원본에서 확인한 용도 | 처리 |
| --- | --- | --- |
| Watermelon `career-1~4` | `jobs`, 근무 형태, 지원 링크를 가진 채용 공고 | 보조 UI로 이동, 본문 후보 제외 |
| Watermelon `timeline` | 시작 시각, 분 단위 길이, 드래그 슬롯을 가진 일정 편집기 | 보조 UI로 이동, 본문 후보 제외 |
| Watermelon `portfolio-dashboard` | 잔액과 자산 배분을 표시하는 금융 대시보드 | 보조 UI로 이동, 본문 후보 제외 |
| Watermelon `project-management-dashboard` | Tasks·Calendar·Team을 가진 업무 관리 화면 | 보조 UI로 이동, 본문 후보 제외 |
| `status-*`, `use-data-state` 등 | 상태 UI·훅 | `stat` 부분 문자열에 의한 성과 분류 제거 |
| 코드·링크·미디어 UI | 코드·실행 결과·스크린샷·영상 표현 | 기술 설명·미디어 후보 역할 추가 |

원본 코드를 직접 검토한 항목은 32개입니다. 132건의 역할 변경을 모두 수동 검토한 것으로 집계하지 않습니다. 자동 분류 항목은 `identifier_rules_v2`, 코드 검토 항목은 `source_review`로 구별합니다.

## 2. 추가 확보 자료

| 출처 | 확보 자료 | 적용 범위와 남은 작업 |
| --- | --- | --- |
| Magic UI Portfolio | 경력 섹션, 프로젝트 카드·격자, 가로·세로 연표, 긴 글 라우트 | 경력·프로젝트 입력 분리, 고정 문구 현지화, MDX와 라우트의 섹션 이식 |
| shadcn Timeline | 날짜·제목·설명 연표와 Storybook 원문 | 직렬화 가능한 날짜·아이콘 입력, 날짜 오류·한국어 형식 처리 |
| al-folio Core | 논문 상세, 가로형 프로젝트, 목차·인용 본문 | Liquid/BibTeX에서 React/JSON으로 이식 |
| al-folio CV | 경력, 학력, 논문, 이미지 없는 프로젝트, 기술, 수상, 자격 | 기간·조직·기여·근거 입력을 통일하고 선택 필드 처리 |
| al-folio Distill | 연구 본문·목차·참고문헌 구성 | Distill 전용 요소를 허용된 본문 블록으로 이식 |

원본은 공식 저장소의 고정 commit에서 읽었으며 파일별 SHA-256과 MIT LICENSE를 함께 보존했습니다. 지정 파일 묶음의 확보 범위는 실행에 필요한 전체 의존성 설치와 구별합니다. 신규 카드에는 **원본 코드 발췌 · 실행 전**을 표시합니다. 신규 항목의 화면 렌더링 검증은 후속 작업입니다.

## 3. 후보 선별

이식 후보는 `hero-1`, `contact-1`, `code-block`, `chart`와 신규 React 컴포넌트 5개입니다. 컴포넌트의 원본 입력 또는 본문 구성을 확인했고, 포털 상세에 입력 후보와 제약을 기록했습니다. `chart`는 차트 프리미티브이므로 지표·단위·기간·출처를 갖춘 섹션으로 조합해야 합니다.

구조 참고에는 기존 `bento-1`, `stats-1`, `footer-1`, `preview-link-card`와 신규 페이지·Liquid 자료 12개가 포함됩니다. 샘플 데이터, 프레임워크 의존성, 슬롯 구성을 검토한 뒤 이식합니다.

현재 제품 등록은 0개입니다. 선별 상태는 시각 품질 통과를 뜻하지 않습니다. 생성 모델에는 검증된 입력 계약과 콘텐츠 범위가 마련된 후보만 전달해야 합니다.

## 4. 중복과 계열

Watermelon 고유 registry 1,073개에서 포함된 파일의 코드 본문을 정렬한 뒤 해시를 비교했습니다. 완전 일치 묶음은 다음과 같습니다.

- `data-table-3` / `data-table-5`
- `expandable-profile-card` / `expandable-profile-card-base`
- `animate-button` / `animated-button`
- `theme-toggler` / `toggle-group`
- `ai-input-001` / `ai-input-002`

파일 경로·registry 의존성·실행 동등성은 해시 비교 범위에 포함되지 않습니다. 포털 상세에서 동일 코드 항목으로 이동할 수 있으며, 원본 ID와 파일은 보존했습니다.

끝 번호 또는 `-base`가 같은 이름 계열 153개는 탐색용 관계입니다. 계열 링크로 모아 볼 수 있습니다. 서로 다른 구조가 섞일 수 있어 중복 제거 수에 포함하지 않습니다. 모든 계열의 시각적 변형 비교는 남아 있습니다.

## 5. 부족한 유형과 후속 작업

| 역할 | 이번 결과 | 다음 작업 |
| --- | --- | --- |
| 경력·학력 | 데이터 필드가 있는 목록·연표·CV 확보 | 긴 조직명, 재직 중, 기간 중첩, 설명 누락 검증 |
| 프로젝트 상세 | 긴 글·목차·인용과 이미지 없는 프로젝트 구조 확보 | 문제–접근–기여–결과, 개인 기여 범위, 전후 비교 전용 블록 정의 |
| 연구·논문 | 저자·발표처·초록·링크·참고문헌 구조 확보 | 수식·그림·인용·저자 확장의 React 구현과 검증 |
| 성과·실험 결과 | 차트 프리미티브 후보 확보 | 단위·기간·기준선·근거를 갖춘 비교표·성과 섹션 보강 |
| 미디어 | 기존 브라우저·기기·음성·영상 UI 재분류 | 캡션·대체 텍스트·확대·누락 자산 처리 검증 |

다음 개발은 선별 후보의 원본과 수정본을 분리하고, JSON으로 표현 가능한 props와 콘텐츠 제약을 정의하는 4단계입니다. 생성 결과의 디자인 품질 평가는 그 뒤 고정 입력의 완성 페이지에서 수행합니다.

## 6. 재실행과 검증

고정 출처·버전·경로·선별 근거는 `scripts/library/stage-3-sources.json`에 있습니다. 공식 저장소를 다시 받으려면 `python3.13 scripts/library/curate.py --fetch`, 이미 확보한 고정 버전에서 다시 만들려면 `python3.13 scripts/library/curate.py`를 실행합니다. 산출 시각을 제외한 검토 결과는 같은 입력으로 재생성할 수 있습니다.

검증 명령:

```sh
node --test scripts/library/catalog.test.mjs scripts/library/acquisition.test.mjs scripts/library/curation.test.mjs
python3.13 -m unittest discover -s scripts/library -p 'test_*.py'
pnpm typecheck
pnpm test
```

Node 테스트 15건, Python 테스트 11건, 타입 검사를 통과했습니다. 전체 테스트는 변경하지 않은 `PropertyValueEditor.test.tsx`의 기존 숫자 입력 검사 1건에서 실패했습니다. 기대 문자열은 `숫자`, 실제 값은 빈 문자열이었습니다.

포털에서 이식·구조 참고·제외 필터, 연구 역할 필터, 경력 후보 상세, 원본 코드 보기, 이름 계열 링크를 확인했습니다. 좁은 화면에서도 필터·페이지 선택의 가로 넘침이 없었습니다. UI 검증은 수집 항목 자체의 제품 품질 평가와 별개입니다.

## 7. 관련 근거

- [고정 출처와 파일 목록](../scripts/library/stage-3-sources.json), [검토 데이터와 변경 전후 역할](./library/curation.json)
- [Magic UI Portfolio](https://github.com/magicuidesign/portfolio/tree/5ef12e4c8bd0de3e22e89c2181ee77a35925ec8b)
- [shadcn Timeline](https://github.com/timDeHof/shadcn-timeline/tree/23a910569ca1f44eafd4d069f4ec523d9e2934ab)
- [al-folio Core](https://github.com/al-org-dev/al-folio-core/tree/fa58be03acad50a4a1ec566dc88280e73ab75d18)
- [al-folio CV](https://github.com/al-org-dev/al-folio-cv/tree/a2d2e673215dfb01e3a5a8c8e36683eec6c550fa)
- [al-folio Distill](https://github.com/al-org-dev/al-folio-distill/tree/c63daebbd1448a1c0ffa5fd8241ccf6161f775fa)

문서 검토: 역할·선별·품질 검증의 상태를 분리했고, 수치는 처리 범위에 사용했습니다. 제목은 역할 분류·확보 자료·후보 선별·중복·후속 작업·검증·근거로 정리했습니다.
