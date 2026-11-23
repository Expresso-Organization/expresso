# 더미 계정 6명의 공고 요건별 근거 정답표

실제 수집 공고 6건에서 고정한 요건 43개를 여섯 가상 계정에 동일하게 적용했다. 총 258개 판정 중 88개에서 요건을 직접 뒷받침하는 기록을 확인했다.

- **용도**는 공고별 근거 검색 및 경계 사례 회귀 평가다. 2026-11-19 기준 에이전트가 원문을 대조한 초안이며, 사람의 독립 검수 전이다. 계정 6명과 선정된 공고를 개발에 반복 사용하므로 일반 채용 추천 성능을 추정하기에는 표본이 작다.
- **표본**은 커머스 데이터 분석 두 직무, 추천 ML, 백엔드, 프론트엔드, 플랫폼 SRE다. 문가령·배준호를 먼저 판정한 후 고정된 요건을 다른 네 계정에 적용했다. 기록량은 3·10·19·25·50·100건이다.
- **원문 기준**은 서비스가 수집한 공고 스냅샷이다. 아래 링크는 저장된 출처이며 현재 모집 여부와 무관하다. 공고당 공개 자격요건을 모두 포함하고, 담당업무 1개와 우대요건 1개를 증거 평가용으로 선정했다. 채용 절차·복리후생은 평가 범위에서 제외했다. 원문의 열거형 기술은 해당 문맥의 예시·대안·복합 조건을 구분해 판정했다.
- **판정 범위**는 각 계정의 삭제되지 않은 기록 제목·본문이다. 제목만 있는 1건도 원본에 포함한다. 성향은 관찰 가능한 행동으로, 연차는 기준일과 기록에 나타난 직무 기간으로 판단했다. 병행한 프로젝트는 연차에 중복 가산하지 않았다.
- **검수 시 우선 볼 항목**은 연차 범위와 동등 경력, 여러 기술을 함께 요구하는 항목, AI 도구 사용, 직무 간 전이 가능성이다. 이 표의 요건별 판정에서 공고 전체의 합격 여부나 60점 양성을 따로 지정하지 않았다.

## 읽는 방법

**강한 직접**은 요건 수행과 구체적 범위·결과가 확인되는 경우, **직접**은 해당 활동이 확인되는 경우다. **부분**은 복합 조건 일부나 수행 기간·깊이만 확인되는 경우, **간접**은 인접 업무의 전이 가능한 경험, **미확인**은 스냅샷에서 근거를 찾지 못한 경우다. 미확인을 개인의 역량 부족으로 해석하지 않는다. 기술명이 같아도 역할이 다르면 구분했다. 예를 들어 웹뷰와 PWA, Kubernetes 클러스터 운영과 Kubeflow 사용은 각각 다른 활동이다.

양성 근거는 대표 기록 ID를 복수로 연결했다. 서로 대체 가능한 기록도 있을 수 있으므로 다른 기록 ID를 자동 오답으로 취급하지 않는다. 여러 ID가 함께 제시된 행은 기술·기간·성과 등 서로 다른 조건을 나누어 입증하기도 한다.

## 고정한 공고

| 코드 | 공고 원문 출처 | 필수 / 업무 / 우대 |
|---|---|---:|
| DA | [여기어때 · Data Analyst [User Behavior]](https://gccompany.career.greetinghr.com/ko/o/237204) | 5 / 1 / 1 |
| ML | [CJ올리브영 · Data Scientist (AI 추천)](https://oliveyoung.career.greetinghr.com/ko/o/213964) | 5 / 1 / 1 |
| BI | [채널톡 · Data Analyst](https://jobs.lever.co/zoyi/31ee3067-0c55-4ca3-b7a5-5a6c0d80e249) | 5 / 1 / 1 |
| BE | [버즈빌 · [광고 운영 시스템] 백엔드 엔지니어(경력 무관, 전문연구요원 편입/전직 가능)](https://buzzvil.career.greetinghr.com/ko/o/233330) | 6 / 1 / 1 |
| FE | [캐치테이블 · B2B Front-end Developer](https://catchtable.career.greetinghr.com/ko/o/235283) | 5 / 1 / 1 |
| SRE | [당근 · Site Reliability Engineer - 인프라 (클러스터)](https://about.daangn.com?gh_jid=5811688003) | 5 / 1 / 1 |

## 모델 평가용 파일

[요건·출처·원문 행 해시](../assets/persona-evidence-v1/requirements.json) · [계정별 경력 기록 스냅샷](../assets/persona-evidence-v1/records.jsonl) · [계정·공고·요건별 근거 정답](../assets/persona-evidence-v1/judgments.jsonl)

공고는 `jobId`, 요건은 `requirementId`와 요건 목록의 `id`, 커리어 기록은 `accountKey`와 `recordId`로 연결한다. `sourceLine`은 공고 본문을 줄바꿈으로 나눈 1부터 시작하는 행 번호다. 해시는 줄바꿈을 제외한 원본 행 또는 전체 본문의 UTF-8 SHA-256이다. 모델의 입력에는 공고·요건과 경력 기록을 넣고, 판정·사유·근거 ID는 평가에만 사용한다.

## 문가령

계정 `dummy-data-analyst` · 경력 기록 25건

### DA · 여기어때 · Data Analyst [User Behavior]

| 요건 | 판정 | 대표 근거 기록 | 판단 근거 |
|---|---|---|---|
| DA1 고객 행동 등 데이터 분석 경력 5년 이상 | 부분 | [고른마켓에서 판매자 · 고객 지표 분석](../assets/persona-evidence-v1/records.jsonl#L11) · [살림곳간 그로스 데이터팀에서 실험 · 데이터 모델링](../assets/persona-evidence-v1/records.jsonl#L6) | 두 회사의 분석 실무가 2022년 3월부터 이어진다. 기준일 현재 5년에 미달한다. |
| DA2 퍼널·리텐션·코호트 등 프로덕트 분석 방법 이해 | 직접 | [고른마켓에서 판매자 · 고객 지표 분석](../assets/persona-evidence-v1/records.jsonl#L11) · [휴면 고객 예측과 재방문 쿠폰 실험](../assets/persona-evidence-v1/records.jsonl#L16) | 검색 퍼널 분석과 재구매 고객 지표 정의, 휴면군 실험을 수행했다. |
| DA3 핵심 지표를 정하고 가설·실험으로 서비스 개선 | 강한 직접 | [휴면 고객 예측과 재방문 쿠폰 실험](../assets/persona-evidence-v1/records.jsonl#L16) · [휴면 고객 쿠폰 실험에서 대조군을 다시 나눈 이유](../assets/persona-evidence-v1/records.jsonl#L19) | 쿠폰 비용과 재방문을 실험하고 대조군 편향을 수정해 효과를 재검증했다. |
| DA4 SQL·Python으로 수집부터 분석·보고까지 수행 | 강한 직접 | [SQL](../assets/persona-evidence-v1/records.jsonl#L5) · [주문 데이터 마트 dbt 전환](../assets/persona-evidence-v1/records.jsonl#L12) · [A/B 테스트 분석 절차 표준화](../assets/persona-evidence-v1/records.jsonl#L18) | SQL 집계의 dbt 마트화와 Python 실험 보고 도구를 함께 구축했다. |
| DA5 비즈니스 이해와 유연하고 신뢰할 수 있는 업무 태도 | 부분 | [고른마켓 판매자 지표 대시보드 구축](../assets/persona-evidence-v1/records.jsonl#L1) · [휴면 고객 예측과 재방문 쿠폰 실험](../assets/persona-evidence-v1/records.jsonl#L16) | MD와 마케팅팀의 판단 기준을 합의한 행동은 확인된다. 성향 전반은 기록만으로 판정하기 어렵다. |
| DA6 실험·사후 분석과 시각화로 부서의 의사결정 지원 | 강한 직접 | [고른마켓 판매자 지표 대시보드 구축](../assets/persona-evidence-v1/records.jsonl#L1) · [휴면 고객 예측과 재방문 쿠폰 실험](../assets/persona-evidence-v1/records.jsonl#L16) | 판매 지표를 Tableau로 제공하고 쿠폰 실험으로 마케팅 의사결정을 지원했다. |
| DA7 Airflow·dbt·BigQuery 활용 | 직접 | [Airflow](../assets/persona-evidence-v1/records.jsonl#L2) · [dbt](../assets/persona-evidence-v1/records.jsonl#L20) · [BigQuery](../assets/persona-evidence-v1/records.jsonl#L9) | 일일 DAG, 주문 dbt 모델, BigQuery 파티션·클러스터링을 각각 사용했다. |

### ML · CJ올리브영 · Data Scientist (AI 추천)

| 요건 | 판정 | 대표 근거 기록 | 판단 근거 |
|---|---|---|---|
| ML1 머신러닝 기초 지식 | 강한 직접 | [휴면 고객 예측과 재방문 쿠폰 실험](../assets/persona-evidence-v1/records.jsonl#L16) · [Python](../assets/persona-evidence-v1/records.jsonl#L17) | 로지스틱 회귀로 이탈 위험을 예측해 실제 실험에 연결했다. |
| ML2 머신러닝 적용 업무 경력 3년 이상, 특히 추천 모델 | 부분 | [신선식품 발주량 예측](../assets/persona-evidence-v1/records.jsonl#L14) · [휴면 고객 예측과 재방문 쿠폰 실험](../assets/persona-evidence-v1/records.jsonl#L16) | 예측 모델 업무가 있지만 추천 모델 중심 3년 경력은 확인되지 않는다. |
| ML3 고객·상품·브랜드 분석에서 비즈니스 인사이트 도출 | 강한 직접 | [검색 결과 페이지 이탈 분석](../assets/persona-evidence-v1/records.jsonl#L7) · [휴면 고객 예측과 재방문 쿠폰 실험](../assets/persona-evidence-v1/records.jsonl#L16) | 검색 결과와 구매 이력 분석을 동의어 보강·쿠폰 정책으로 연결했다. |
| ML4 스스로 문제와 해결 방향 정의 | 강한 직접 | [주문 데이터 마트 dbt 전환](../assets/persona-evidence-v1/records.jsonl#L12) · [검색 결과 페이지 이탈 분석](../assets/persona-evidence-v1/records.jsonl#L7) | 주문 지표 불일치와 검색 이탈의 원인을 정의하고 개선했다. |
| ML5 모델 설계와 결과 해석을 과학적으로 문서화 | 직접 | [휴면 고객 쿠폰 실험에서 대조군을 다시 나눈 이유](../assets/persona-evidence-v1/records.jsonl#L19) · [기상 · 지역 행사 변수가 전통시장 방문객 수 예측에 미치는 영향](../assets/persona-evidence-v1/records.jsonl#L8) | 실험 편향 수정 및 예측 연구를 글로 정리했다. |
| ML6 탐색 경험을 개선하는 추천 모델 개발 | 간접 | [검색 결과 페이지 이탈 분석](../assets/persona-evidence-v1/records.jsonl#L7) · [휴면 고객 예측과 재방문 쿠폰 실험](../assets/persona-evidence-v1/records.jsonl#L16) | 검색 사전 개선과 고객 예측은 인접 경험이며 개인화 추천 모델 개발 기록은 없다. |
| ML7 이커머스 추천·광고 모델 개발 및 운영 | 간접 | [휴면 고객 예측과 재방문 쿠폰 실험](../assets/persona-evidence-v1/records.jsonl#L16) · [신선식품 발주량 예측](../assets/persona-evidence-v1/records.jsonl#L14) | 커머스에서 예측 모델을 적용했지만 추천·광고 모델 운영은 확인되지 않는다. |

### BI · 채널톡 · Data Analyst

| 요건 | 판정 | 대표 근거 기록 | 판단 근거 |
|---|---|---|---|
| BI1 DA 관련 실무 경험 1년~7년 이상(공고 표현) | 직접 | [고른마켓에서 판매자 · 고객 지표 분석](../assets/persona-evidence-v1/records.jsonl#L11) · [살림곳간 그로스 데이터팀에서 실험 · 데이터 모델링](../assets/persona-evidence-v1/records.jsonl#L6) | 2022년부터 두 커머스 데이터팀에서 고객·판매자 지표와 실험 분석을 담당했다. |
| BI2 비즈니스 문제를 구조화하고 핵심 원인 정의 | 강한 직접 | [검색 결과 페이지 이탈 분석](../assets/persona-evidence-v1/records.jsonl#L7) · [주문 데이터 마트 dbt 전환](../assets/persona-evidence-v1/records.jsonl#L12) | 검색 이탈의 원인과 팀별 주문 집계 불일치의 원인을 찾아 개선했다. |
| BI3 SQL로 원자료 추출·분석 및 인사이트 도출 | 강한 직접 | [SQL](../assets/persona-evidence-v1/records.jsonl#L5) · [고른마켓 판매자 지표 대시보드 구축](../assets/persona-evidence-v1/records.jsonl#L1) | SQL로 주문·반품 원자료를 집계하고 MD와 지표를 정의했다. |
| BI4 문제를 주도적으로 파고들고 새로운 지식을 습득 | 직접 | [주문 데이터 마트 dbt 전환](../assets/persona-evidence-v1/records.jsonl#L12) · [휴면 고객 쿠폰 실험에서 대조군을 다시 나눈 이유](../assets/persona-evidence-v1/records.jsonl#L19) | 기존 쿼리를 dbt로 옮기고 실험 편향을 직접 조사했다. |
| BI5 여러 팀과 소통·협업 | 강한 직접 | [고른마켓 판매자 지표 대시보드 구축](../assets/persona-evidence-v1/records.jsonl#L1) · [휴면 고객 예측과 재방문 쿠폰 실험](../assets/persona-evidence-v1/records.jsonl#L16) | MD 인터뷰와 마케팅 협업 실험으로 팀 간 분석 기준을 맞췄다. |
| BI6 시각화 도구로 대시보드 구축 | 강한 직접 | [고른마켓 판매자 지표 대시보드 구축](../assets/persona-evidence-v1/records.jsonl#L1) · [Tableau](../assets/persona-evidence-v1/records.jsonl#L3) | Tableau 대시보드를 구축·운영해 주간 작성 시간을 6시간에서 30분으로 줄였다. |
| BI7 Python을 활용한 데이터 처리·분석 | 강한 직접 | [Python](../assets/persona-evidence-v1/records.jsonl#L17) · [A/B 테스트 분석 절차 표준화](../assets/persona-evidence-v1/records.jsonl#L18) | Python 패키지로 실험 분석과 결과 보고를 표준화했다. |

### BE · 버즈빌 · [광고 운영 시스템] 백엔드 엔지니어(경력 무관, 전문연구요원 편입/전직 가능)

| 요건 | 판정 | 대표 근거 기록 | 판단 근거 |
|---|---|---|---|
| BE1 서버 언어로 백엔드 시스템 개발, 프로젝트 경험 인정 | 간접 | [A/B 테스트 분석 절차 표준화](../assets/persona-evidence-v1/records.jsonl#L18) | Python 분석 패키지와 Streamlit 화면을 개발했다. 서버 백엔드 구축 범위는 확인되지 않는다. |
| BE2 관계형 DB와 NoSQL 저장소 사용 | 부분 | [SQL](../assets/persona-evidence-v1/records.jsonl#L5) · [주문 데이터 마트 dbt 전환](../assets/persona-evidence-v1/records.jsonl#L12) | 관계형 데이터 모델과 SQL을 사용했다. NoSQL 사용은 확인되지 않는다. |
| BE3 외부 시스템 API 연동 설계 및 개발 | 미확인 | — | 외부 서비스 API 연동을 설계하거나 구현한 기록이 없다. |
| BE4 제품에 필요한 다른 기술 영역까지 확장 | 직접 | [A/B 테스트 분석 절차 표준화](../assets/persona-evidence-v1/records.jsonl#L18) | 분석 업무에서 패키지와 사용자 화면 개발까지 확장했다. |
| BE5 다른 직군과 소통·협업 | 강한 직접 | [고른마켓 판매자 지표 대시보드 구축](../assets/persona-evidence-v1/records.jsonl#L1) · [휴면 고객 예측과 재방문 쿠폰 실험](../assets/persona-evidence-v1/records.jsonl#L16) | MD와 지표 정의를 합의하고 마케팅팀과 실험을 설계했다. |
| BE6 AI 도구 도입으로 생산성 개선 | 미확인 | — | AI 개발 도구를 도입해 생산성을 개선한 기록이 없다. |
| BE7 계정·권한 관리 및 제휴사 SSO 연동 | 미확인 | — | 사용자 계정·권한 또는 제휴사 SSO 구현 기록이 없다. |
| BE8 Kotlin·Java 등 JVM 언어로 서버 개발 | 미확인 | — | JVM 언어로 서버를 구현한 기록이 없다. |

### FE · 캐치테이블 · B2B Front-end Developer

| 요건 | 판정 | 대표 근거 기록 | 판단 근거 |
|---|---|---|---|
| FE1 React 사용 경험 | 미확인 | — | React 사용을 확인할 기록이 없다. |
| FE2 UX/UI 개발 경험 | 부분 | [A/B 테스트 분석 절차 표준화](../assets/persona-evidence-v1/records.jsonl#L18) | Streamlit 분석 화면을 만들었다. 제품 프론트엔드 UI 설계 범위는 확인되지 않는다. |
| FE3 컴퓨터과학 기본 지식 | 간접 | [주문 데이터 마트 dbt 전환](../assets/persona-evidence-v1/records.jsonl#L12) · [SQL](../assets/persona-evidence-v1/records.jsonl#L5) | SQL과 데이터 모델 경험은 있으나 전반적인 컴퓨터과학 기초를 입증할 기록은 제한적이다. |
| FE4 유관 경력 5년 이상 또는 이에 준하는 경험 | 미확인 | — | 프론트엔드 5년 또는 이에 준하는 개발 범위가 확인되지 않는다. |
| FE5 유관 팀과 원활한 소통 | 강한 직접 | [고른마켓 판매자 지표 대시보드 구축](../assets/persona-evidence-v1/records.jsonl#L1) · [고른마켓에서 판매자 · 고객 지표 분석](../assets/persona-evidence-v1/records.jsonl#L11) | MD·영업과 대시보드 요구사항 및 지표 정의를 맞췄다. |
| FE6 측정 지표로 웹 성능 이슈의 우선순위를 정하고 개선 | 미확인 | — | 브라우저 번들·렌더링·실시간 처리 병목을 측정해 개선한 기록이 없다. |
| FE7 다수의 웹뷰 개발 경험 | 미확인 | — | 모바일 웹뷰 개발 기록이 없다. |

### SRE · 당근 · Site Reliability Engineer - 인프라 (클러스터)

| 요건 | 판정 | 대표 근거 기록 | 판단 근거 |
|---|---|---|---|
| SRE1 SRE·DevOps·플랫폼 인프라 운영·개선 경력 3~5년 | 미확인 | — | SRE·플랫폼 인프라 운영 3~5년 경력이 확인되지 않는다. |
| SRE2 Kubernetes·Linux·네트워크 기반 복잡한 문제 해결 | 미확인 | — | Kubernetes·Linux·네트워크 장애를 해결한 기록이 없다. |
| SRE3 반복되는 인프라 운영 문제를 소프트웨어로 자동화 | 간접 | [Airflow](../assets/persona-evidence-v1/records.jsonl#L2) · [주문 데이터 마트 dbt 전환](../assets/persona-evidence-v1/records.jsonl#L12) | 마트 갱신과 데이터 검증을 자동화했다. 인프라 운영 자동화에 인접한 경험이다. |
| SRE4 AI 코딩 에이전트 등 새 도구로 생산성 향상 및 안정성 검증 | 간접 | [주문 데이터 마트 dbt 전환](../assets/persona-evidence-v1/records.jsonl#L12) · [dbt](../assets/persona-evidence-v1/records.jsonl#L20) | dbt 모델·테스트를 도입한 데이터 품질 사례가 있다. 인프라 엔지니어링의 새 도구와 운영 안정성 검증은 미확인이다. |
| SRE5 운영 메트릭·로그·트레이스로 신뢰성 개선 | 간접 | [dbt](../assets/persona-evidence-v1/records.jsonl#L20) | dbt test로 데이터 품질을 검증했다. 서비스 운영 텔레메트리 분석은 확인되지 않는다. |
| SRE6 신뢰할 지표와 알림 설계로 장애 대응 효율 개선 | 미확인 | — | 장애 인지 지표나 호출 알림을 설계한 기록이 없다. |
| SRE7 Kubernetes 인프라 운영 및 개선 | 미확인 | — | Kubernetes 인프라를 운영·개선한 기록이 없다. |

## 배준호

계정 `dummy-ml-research` · 경력 기록 50건

### DA · 여기어때 · Data Analyst [User Behavior]

| 요건 | 판정 | 대표 근거 기록 | 판단 근거 |
|---|---|---|---|
| DA1 고객 행동 등 데이터 분석 경력 5년 이상 | 부분 | [스트림온 추천팀 ML 엔지니어](../assets/persona-evidence-v1/records.jsonl#L29) · [마켓하루 검색추천팀 ML 엔지니어](../assets/persona-evidence-v1/records.jsonl#L50) · [마켓하루 검색추천팀](../assets/persona-evidence-v1/records.jsonl#L55) | 2020년부터 행동 로그를 활용한 추천 업무를 했다. 전 기간의 고객 행동 분석 직무 범위는 불명확하다. |
| DA2 퍼널·리텐션·코호트 등 프로덕트 분석 방법 이해 | 부분 | [검색 결과 재정렬 모델](../assets/persona-evidence-v1/records.jsonl#L75) · [클릭 · 구매 멀티태스크 랭킹 모델](../assets/persona-evidence-v1/records.jsonl#L43) | 클릭·장바구니·구매 단계 분석 경험이 있다. 코호트·리텐션 분석까지는 확인되지 않는다. |
| DA3 핵심 지표를 정하고 가설·실험으로 서비스 개선 | 강한 직접 | [마켓하루 검색추천팀 ML 엔지니어](../assets/persona-evidence-v1/records.jsonl#L50) · [검색 결과 재정렬 모델](../assets/persona-evidence-v1/records.jsonl#L75) | 구매 전환 지표를 설정하고 A/B 결과의 위치 편향을 보정해 검색 추천을 개선했다. |
| DA4 SQL·Python으로 수집부터 분석·보고까지 수행 | 부분 | [SQL](../assets/persona-evidence-v1/records.jsonl#L54) · [Python](../assets/persona-evidence-v1/records.jsonl#L70) · [오프라인 리플레이 평가 도구](../assets/persona-evidence-v1/records.jsonl#L48) | SQL 추출·Python 모델링·실험 보고는 확인된다. 분석 마트 구축은 확인되지 않는다. |
| DA5 비즈니스 이해와 유연하고 신뢰할 수 있는 업무 태도 | 부분 | [마켓하루 검색추천팀 ML 엔지니어](../assets/persona-evidence-v1/records.jsonl#L50) · [마켓하루 랭킹 모델 파트 리드](../assets/persona-evidence-v1/records.jsonl#L73) | 콘텐츠 클릭과 커머스 구매의 목표 차이를 반영하고 팀 판정 기준을 조율했다. 성향 전체는 미확인이다. |
| DA6 실험·사후 분석과 시각화로 부서의 의사결정 지원 | 부분 | [노출 편향을 보정한 커머스 추천 오프라인 평가](../assets/persona-evidence-v1/records.jsonl#L36) · [오프라인 리플레이 평가 도구](../assets/persona-evidence-v1/records.jsonl#L48) | 실험과 사후 분석으로 후보 정책을 검증했다. 부서용 시각화 지원은 확인되지 않는다. |
| DA7 Airflow·dbt·BigQuery 활용 | 부분 | [Airflow](../assets/persona-evidence-v1/records.jsonl#L74) | Airflow 추출 작업을 예약했다. dbt와 BigQuery 사용은 확인되지 않는다. |

### ML · CJ올리브영 · Data Scientist (AI 추천)

| 요건 | 판정 | 대표 근거 기록 | 판단 근거 |
|---|---|---|---|
| ML1 머신러닝 기초 지식 | 강한 직접 | [PyTorch](../assets/persona-evidence-v1/records.jsonl#L71) · [세션 그래프 기반 다음 아이템 추천 모델](../assets/persona-evidence-v1/records.jsonl#L40) | 그래프 신경망과 랭커를 구현하고 추천 실험으로 검증했다. |
| ML2 머신러닝 적용 업무 경력 3년 이상, 특히 추천 모델 | 강한 직접 | [스트림온 추천팀 ML 엔지니어](../assets/persona-evidence-v1/records.jsonl#L29) · [마켓하루 검색추천팀 ML 엔지니어](../assets/persona-evidence-v1/records.jsonl#L50) · [마켓하루 검색추천팀](../assets/persona-evidence-v1/records.jsonl#L55) | 2020년부터 콘텐츠·커머스 추천 모델 개발과 운영이 연속적으로 확인된다. |
| ML3 고객·상품·브랜드 분석에서 비즈니스 인사이트 도출 | 강한 직접 | [마켓하루 검색추천팀 ML 엔지니어](../assets/persona-evidence-v1/records.jsonl#L50) · [검색 결과 재정렬 모델](../assets/persona-evidence-v1/records.jsonl#L75) | 커머스 검색에서 클릭과 구매 전환의 차이를 분석하고 평가·랭킹을 변경했다. |
| ML4 스스로 문제와 해결 방향 정의 | 강한 직접 | [누리랩스 AI연구소 연구 인턴](../assets/persona-evidence-v1/records.jsonl#L45) · [오프라인 리플레이 평가 도구](../assets/persona-evidence-v1/records.jsonl#L48) | 신규 상품 노출 및 온라인 실험 병목을 정의하고 대안을 구현했다. |
| ML5 모델 설계와 결과 해석을 과학적으로 문서화 | 강한 직접 | [Position-aware Attention over Session Graphs for Next-item Recommendation](../assets/persona-evidence-v1/records.jsonl#L28) · [노출 편향을 보정한 커머스 추천 오프라인 평가](../assets/persona-evidence-v1/records.jsonl#L36) | 세션 그래프와 노출 편향 보정 방법을 논문으로 발표하고 비교 실험 결과를 제시했다. |
| ML6 탐색 경험을 개선하는 추천 모델 개발 | 강한 직접 | [홈 피드 Two-tower 후보 생성 모델 도입](../assets/persona-evidence-v1/records.jsonl#L31) · [검색 결과 재정렬 모델](../assets/persona-evidence-v1/records.jsonl#L75) | 홈 피드 후보 생성과 검색 재정렬 모델을 개발했다. |
| ML7 이커머스 추천·광고 모델 개발 및 운영 | 강한 직접 | [클릭 · 구매 멀티태스크 랭킹 모델](../assets/persona-evidence-v1/records.jsonl#L43) · [마켓하루 검색추천팀 ML 엔지니어](../assets/persona-evidence-v1/records.jsonl#L50) | 커머스 구매·클릭 멀티태스크 랭커를 개발하고 실제 검색추천에 적용했다. |

### BI · 채널톡 · Data Analyst

| 요건 | 판정 | 대표 근거 기록 | 판단 근거 |
|---|---|---|---|
| BI1 DA 관련 실무 경험 1년~7년 이상(공고 표현) | 직접 | [마켓하루 검색추천팀 ML 엔지니어](../assets/persona-evidence-v1/records.jsonl#L50) · [마켓하루 검색추천팀](../assets/persona-evidence-v1/records.jsonl#L55) · [SQL](../assets/persona-evidence-v1/records.jsonl#L54) | 2023년 이후 커머스 검색에서 행동 데이터 분석 및 구매 전환 평가를 실무로 수행했다. |
| BI2 비즈니스 문제를 구조화하고 핵심 원인 정의 | 강한 직접 | [오프라인 지표는 올랐는데 전환율은 그대로였던 이유](../assets/persona-evidence-v1/records.jsonl#L51) · [검색 결과 재정렬 모델](../assets/persona-evidence-v1/records.jsonl#L75) | 오프라인 개선이 구매 전환으로 이어지지 않은 원인을 위치 편향에서 찾았다. |
| BI3 SQL로 원자료 추출·분석 및 인사이트 도출 | 강한 직접 | [SQL](../assets/persona-evidence-v1/records.jsonl#L54) · [노출 편향을 보정한 커머스 추천 오프라인 평가](../assets/persona-evidence-v1/records.jsonl#L36) | 학습 데이터와 실험 지표를 SQL로 집계하고 노출 로그 편향을 분석했다. |
| BI4 문제를 주도적으로 파고들고 새로운 지식을 습득 | 강한 직접 | [누리랩스 AI연구소 연구 인턴](../assets/persona-evidence-v1/records.jsonl#L45) · [오프라인 리플레이 평가 도구](../assets/persona-evidence-v1/records.jsonl#L48) | 콜드스타트와 실험 소요시간 문제에 새 추정·평가 방법을 적용했다. |
| BI5 여러 팀과 소통·협업 | 직접 | [랭킹 모델 실시간 피처 스토어 연동](../assets/persona-evidence-v1/records.jsonl#L63) · [마켓하루 랭킹 모델 파트 리드](../assets/persona-evidence-v1/records.jsonl#L73) | 데이터 플랫폼팀의 저장소에 랭킹 피처를 연계하고 파트 공통 지표를 정했다. |
| BI6 시각화 도구로 대시보드 구축 | 미확인 | — | 실험 평가 도구는 있으나 데이터 시각화 대시보드 구축을 명시한 기록은 없다. |
| BI7 Python을 활용한 데이터 처리·분석 | 강한 직접 | [Python](../assets/persona-evidence-v1/records.jsonl#L70) · [Kubeflow 추천 모델 학습 파이프라인](../assets/persona-evidence-v1/records.jsonl#L52) | Python으로 학습·실험 코드와 데이터 처리 파이프라인을 구축했다. |

### BE · 버즈빌 · [광고 운영 시스템] 백엔드 엔지니어(경력 무관, 전문연구요원 편입/전직 가능)

| 요건 | 판정 | 대표 근거 기록 | 판단 근거 |
|---|---|---|---|
| BE1 서버 언어로 백엔드 시스템 개발, 프로젝트 경험 인정 | 강한 직접 | [Faiss 근사 최근접 이웃 검색 서빙](../assets/persona-evidence-v1/records.jsonl#L61) · [Python](../assets/persona-evidence-v1/records.jsonl#L70) | Python으로 임베딩 검색 서버를 개발해 p99 지연을 검증했다. |
| BE2 관계형 DB와 NoSQL 저장소 사용 | 부분 | [SQL](../assets/persona-evidence-v1/records.jsonl#L54) · [랭킹 모델 실시간 피처 스토어 연동](../assets/persona-evidence-v1/records.jsonl#L63) | SQL 조회와 피처 스토어 활용은 확인된다. 스토어가 NoSQL인지 명시되지 않았다. |
| BE3 외부 시스템 API 연동 설계 및 개발 | 부분 | [랭킹 모델 실시간 피처 스토어 연동](../assets/persona-evidence-v1/records.jsonl#L63) | 데이터 플랫폼팀 피처 스토어를 연동했다. 외부 시스템 API의 설계 범위는 확인되지 않는다. |
| BE4 제품에 필요한 다른 기술 영역까지 확장 | 직접 | [Faiss 근사 최근접 이웃 검색 서빙](../assets/persona-evidence-v1/records.jsonl#L61) · [cron 스크립트에서 Kubeflow Pipelines로](../assets/persona-evidence-v1/records.jsonl#L65) | 모델 개발에서 검색 서버와 학습·배포 도구로 역할을 확장했다. |
| BE5 다른 직군과 소통·협업 | 직접 | [랭킹 모델 실시간 피처 스토어 연동](../assets/persona-evidence-v1/records.jsonl#L63) · [마켓하루 랭킹 모델 파트 리드](../assets/persona-evidence-v1/records.jsonl#L73) | 플랫폼팀과 추천 피처를 통합하고 파트 공통 평가 기준을 운영했다. |
| BE6 AI 도구 도입으로 생산성 개선 | 미확인 | — | AI 개발 도구를 도입해 엔지니어 생산성을 높인 근거가 없다. |
| BE7 계정·권한 관리 및 제휴사 SSO 연동 | 미확인 | — | 계정 권한 관리나 제휴사 SSO 구현 근거가 없다. |
| BE8 Kotlin·Java 등 JVM 언어로 서버 개발 | 미확인 | — | Python 서버 경험은 있으나 JVM 서버 개발 근거가 없다. |

### FE · 캐치테이블 · B2B Front-end Developer

| 요건 | 판정 | 대표 근거 기록 | 판단 근거 |
|---|---|---|---|
| FE1 React 사용 경험 | 미확인 | — | React 사용 기록이 없다. |
| FE2 UX/UI 개발 경험 | 미확인 | — | 웹 사용자 인터페이스를 직접 개발한 기록이 없다. |
| FE3 컴퓨터과학 기본 지식 | 강한 직접 | [한결대학교 대학원 컴퓨터공학과 석사](../assets/persona-evidence-v1/records.jsonl#L68) · [Faiss 근사 최근접 이웃 검색 서빙](../assets/persona-evidence-v1/records.jsonl#L61) | 컴퓨터공학 석사 및 벡터 인덱스·메모리·지연 최적화 경험이 있다. |
| FE4 유관 경력 5년 이상 또는 이에 준하는 경험 | 미확인 | — | 프론트엔드 실무 연차 또는 이에 준하는 UI 개발 이력은 확인되지 않는다. |
| FE5 유관 팀과 원활한 소통 | 직접 | [랭킹 모델 실시간 피처 스토어 연동](../assets/persona-evidence-v1/records.jsonl#L63) · [마켓하루 랭킹 모델 파트 리드](../assets/persona-evidence-v1/records.jsonl#L73) | 추천 파트와 데이터 플랫폼 간 협업 및 지표 조율을 수행했다. |
| FE6 측정 지표로 웹 성능 이슈의 우선순위를 정하고 개선 | 간접 | [Faiss 근사 최근접 이웃 검색 서빙](../assets/persona-evidence-v1/records.jsonl#L61) · [Triton Inference Server](../assets/persona-evidence-v1/records.jsonl#L60) | 추론·검색 서버 지연을 측정했다. 브라우저 성능 최적화는 확인되지 않는다. |
| FE7 다수의 웹뷰 개발 경험 | 미확인 | — | 웹뷰 개발 기록이 없다. |

### SRE · 당근 · Site Reliability Engineer - 인프라 (클러스터)

| 요건 | 판정 | 대표 근거 기록 | 판단 근거 |
|---|---|---|---|
| SRE1 SRE·DevOps·플랫폼 인프라 운영·개선 경력 3~5년 | 부분 | [Faiss 근사 최근접 이웃 검색 서빙](../assets/persona-evidence-v1/records.jsonl#L61) · [Kubeflow 추천 모델 학습 파이프라인](../assets/persona-evidence-v1/records.jsonl#L52) | 검색 서빙과 학습 플랫폼 운영을 개선했다. 인프라 직무 3~5년은 확인되지 않는다. |
| SRE2 Kubernetes·Linux·네트워크 기반 복잡한 문제 해결 | 간접 | [Faiss 근사 최근접 이웃 검색 서빙](../assets/persona-evidence-v1/records.jsonl#L61) · [Triton Inference Server](../assets/persona-evidence-v1/records.jsonl#L60) | 서빙 인덱스와 추론 서버 병목을 해결했다. 클러스터·네트워크 운영 근거는 부족하다. |
| SRE3 반복되는 인프라 운영 문제를 소프트웨어로 자동화 | 강한 직접 | [Kubeflow 추천 모델 학습 파이프라인](../assets/persona-evidence-v1/records.jsonl#L52) · [cron 스크립트에서 Kubeflow Pipelines로](../assets/persona-evidence-v1/records.jsonl#L65) | 반복되던 모델 학습·배포 단계를 파이프라인으로 자동화했다. |
| SRE4 AI 코딩 에이전트 등 새 도구로 생산성 향상 및 안정성 검증 | 부분 | [Kubeflow 추천 모델 학습 파이프라인](../assets/persona-evidence-v1/records.jsonl#L52) · [cron 스크립트에서 Kubeflow Pipelines로](../assets/persona-evidence-v1/records.jsonl#L65) | Kubeflow로 재학습 주기를 단축하고 배포 장애를 줄였다. AI 코딩 에이전트 사용은 미확인이다. |
| SRE5 운영 메트릭·로그·트레이스로 신뢰성 개선 | 부분 | [Faiss 근사 최근접 이웃 검색 서빙](../assets/persona-evidence-v1/records.jsonl#L61) · [랭킹 모델 실시간 피처 스토어 연동](../assets/persona-evidence-v1/records.jsonl#L63) | 지연 및 학습·서빙 불일치 지표를 개선했다. 로그·트레이스를 통한 인프라 신뢰성 분석은 미확인이다. |
| SRE6 신뢰할 지표와 알림 설계로 장애 대응 효율 개선 | 미확인 | — | 장애 대응 알림과 호출 정책을 설계한 기록은 없다. |
| SRE7 Kubernetes 인프라 운영 및 개선 | 미확인 | — | Kubeflow를 사용했지만 Kubernetes 인프라 자체를 운영하거나 개선한 근거는 없다. |

## 한서윤

계정 `dummy-newgrad` · 경력 기록 3건

### DA · 여기어때 · Data Analyst [User Behavior]

| 요건 | 판정 | 대표 근거 기록 | 판단 근거 |
|---|---|---|---|
| DA1 고객 행동 등 데이터 분석 경력 5년 이상 | 미확인 | — | 졸업 프로젝트가 있으나 데이터 분석 직무 5년 경력은 확인되지 않는다. |
| DA2 퍼널·리텐션·코호트 등 프로덕트 분석 방법 이해 | 미확인 | — | 사용자 퍼널·리텐션·코호트를 분석한 기록이 없다. |
| DA3 핵심 지표를 정하고 가설·실험으로 서비스 개선 | 미확인 | — | 예약 서비스의 동시성 검증은 제품 성장 지표 실험을 입증하지 않는다. |
| DA4 SQL·Python으로 수집부터 분석·보고까지 수행 | 부분 | [스터디룸 예약 서비스 졸업 프로젝트](../assets/persona-evidence-v1/records.jsonl#L76) · [서해공과대학교 컴퓨터공학과](../assets/persona-evidence-v1/records.jsonl#L77) | MySQL 사용과 데이터베이스 수업은 확인된다. Python 분석·마트·보고까지 수행한 기록은 없다. |
| DA5 비즈니스 이해와 유연하고 신뢰할 수 있는 업무 태도 | 미확인 | — | 시장 또는 사업 목표와 관련해 판단한 기록이 없다. |
| DA6 실험·사후 분석과 시각화로 부서의 의사결정 지원 | 미확인 | — | 부서의 의사결정을 위한 실험 분석·시각화 경험이 없다. |
| DA7 Airflow·dbt·BigQuery 활용 | 미확인 | — | Airflow·dbt·BigQuery 사용 기록이 없다. |

### ML · CJ올리브영 · Data Scientist (AI 추천)

| 요건 | 판정 | 대표 근거 기록 | 판단 근거 |
|---|---|---|---|
| ML1 머신러닝 기초 지식 | 미확인 | — | 컴퓨터공학 수강 기록에 머신러닝 학습이나 구현이 나타나지 않는다. |
| ML2 머신러닝 적용 업무 경력 3년 이상, 특히 추천 모델 | 미확인 | — | 머신러닝 실무 경력 기록이 없다. |
| ML3 고객·상품·브랜드 분석에서 비즈니스 인사이트 도출 | 미확인 | — | 고객·상품·브랜드 데이터를 분석한 기록이 없다. |
| ML4 스스로 문제와 해결 방향 정의 | 직접 | [스터디룸 예약 서비스 졸업 프로젝트](../assets/persona-evidence-v1/records.jsonl#L76) | 이중 예약 문제를 발견하고 행 잠금으로 처리했다. |
| ML5 모델 설계와 결과 해석을 과학적으로 문서화 | 미확인 | — | 모델 설계 또는 실험 결과를 문서화한 기록이 없다. |
| ML6 탐색 경험을 개선하는 추천 모델 개발 | 미확인 | — | 추천 모델 개발 기록이 없다. |
| ML7 이커머스 추천·광고 모델 개발 및 운영 | 미확인 | — | 커머스 추천·광고 모델 운영 기록이 없다. |

### BI · 채널톡 · Data Analyst

| 요건 | 판정 | 대표 근거 기록 | 판단 근거 |
|---|---|---|---|
| BI1 DA 관련 실무 경험 1년~7년 이상(공고 표현) | 미확인 | — | 데이터 분석 실무 연차를 뒷받침할 근무 기록이 없다. |
| BI2 비즈니스 문제를 구조화하고 핵심 원인 정의 | 간접 | [스터디룸 예약 서비스 졸업 프로젝트](../assets/persona-evidence-v1/records.jsonl#L76) | 이중 예약 원인을 해결했다. 비즈니스 데이터 분석 맥락은 확인되지 않는다. |
| BI3 SQL로 원자료 추출·분석 및 인사이트 도출 | 간접 | [스터디룸 예약 서비스 졸업 프로젝트](../assets/persona-evidence-v1/records.jsonl#L76) | 예약 트랜잭션에 MySQL을 사용했다. 분석 쿼리와 인사이트 도출은 확인되지 않는다. |
| BI4 문제를 주도적으로 파고들고 새로운 지식을 습득 | 직접 | [스터디룸 예약 서비스 졸업 프로젝트](../assets/persona-evidence-v1/records.jsonl#L76) | 동시 요청 문제를 조사하고 DB 잠금을 적용했다. |
| BI5 여러 팀과 소통·협업 | 부분 | [스터디룸 예약 서비스 졸업 프로젝트](../assets/persona-evidence-v1/records.jsonl#L76) | 네 명의 팀 프로젝트 경험이 있다. 여러 팀과의 협업은 확인되지 않는다. |
| BI6 시각화 도구로 대시보드 구축 | 미확인 | — | 시각화 도구를 이용한 대시보드 구축 기록이 없다. |
| BI7 Python을 활용한 데이터 처리·분석 | 미확인 | — | Python 데이터 분석 기록이 없다. |

### BE · 버즈빌 · [광고 운영 시스템] 백엔드 엔지니어(경력 무관, 전문연구요원 편입/전직 가능)

| 요건 | 판정 | 대표 근거 기록 | 판단 근거 |
|---|---|---|---|
| BE1 서버 언어로 백엔드 시스템 개발, 프로젝트 경험 인정 | 강한 직접 | [스터디룸 예약 서비스 졸업 프로젝트](../assets/persona-evidence-v1/records.jsonl#L76) · [Java](../assets/persona-evidence-v1/records.jsonl#L78) | Java와 Spring Boot로 예약 API를 개발하고 이중 예약 문제를 해결했다. |
| BE2 관계형 DB와 NoSQL 저장소 사용 | 부분 | [스터디룸 예약 서비스 졸업 프로젝트](../assets/persona-evidence-v1/records.jsonl#L76) | MySQL 행 잠금 구현은 직접 확인된다. NoSQL 사용 기록은 없다. |
| BE3 외부 시스템 API 연동 설계 및 개발 | 미확인 | — | 자체 예약 API 구현은 확인되지만 외부 시스템 연동 기록은 없다. |
| BE4 제품에 필요한 다른 기술 영역까지 확장 | 미확인 | — | 다른 기술 영역으로 역할을 확장한 구체적 기록이 없다. |
| BE5 다른 직군과 소통·협업 | 부분 | [스터디룸 예약 서비스 졸업 프로젝트](../assets/persona-evidence-v1/records.jsonl#L76) | 네 명이 역할을 나눈 프로젝트다. 함께 일한 직군은 명시되지 않았다. |
| BE6 AI 도구 도입으로 생산성 개선 | 미확인 | — | AI 도구를 개발에 도입한 기록이 없다. |
| BE7 계정·권한 관리 및 제휴사 SSO 연동 | 미확인 | — | 계정·권한 관리와 제휴사 SSO 구현 기록이 없다. |
| BE8 Kotlin·Java 등 JVM 언어로 서버 개발 | 직접 | [스터디룸 예약 서비스 졸업 프로젝트](../assets/persona-evidence-v1/records.jsonl#L76) · [Java](../assets/persona-evidence-v1/records.jsonl#L78) | Java로 Spring Boot 백엔드를 구현한 프로젝트다. |

### FE · 캐치테이블 · B2B Front-end Developer

| 요건 | 판정 | 대표 근거 기록 | 판단 근거 |
|---|---|---|---|
| FE1 React 사용 경험 | 미확인 | — | React 사용 근거가 없다. |
| FE2 UX/UI 개발 경험 | 미확인 | — | 졸업 프로젝트에서 맡은 역할은 백엔드로 기록돼 있다. |
| FE3 컴퓨터과학 기본 지식 | 직접 | [서해공과대학교 컴퓨터공학과](../assets/persona-evidence-v1/records.jsonl#L77) · [스터디룸 예약 서비스 졸업 프로젝트](../assets/persona-evidence-v1/records.jsonl#L76) | 운영체제·네트워크·DB 수강 및 행 잠금 적용 경험이 있다. |
| FE4 유관 경력 5년 이상 또는 이에 준하는 경험 | 미확인 | — | 프론트엔드 5년 또는 동등한 경험을 뒷받침할 기록이 없다. |
| FE5 유관 팀과 원활한 소통 | 부분 | [스터디룸 예약 서비스 졸업 프로젝트](../assets/persona-evidence-v1/records.jsonl#L76) | 팀 프로젝트에서 백엔드를 담당했다. 유관 팀과의 소통 사례는 미확인이다. |
| FE6 측정 지표로 웹 성능 이슈의 우선순위를 정하고 개선 | 미확인 | — | 번들·렌더링 등 웹 화면 성능을 측정한 기록이 없다. |
| FE7 다수의 웹뷰 개발 경험 | 미확인 | — | 모바일 웹뷰 개발 기록이 없다. |

### SRE · 당근 · Site Reliability Engineer - 인프라 (클러스터)

| 요건 | 판정 | 대표 근거 기록 | 판단 근거 |
|---|---|---|---|
| SRE1 SRE·DevOps·플랫폼 인프라 운영·개선 경력 3~5년 | 미확인 | — | 인프라 운영 3~5년 경력이 확인되지 않는다. |
| SRE2 Kubernetes·Linux·네트워크 기반 복잡한 문제 해결 | 간접 | [서해공과대학교 컴퓨터공학과](../assets/persona-evidence-v1/records.jsonl#L77) | 운영체제와 네트워크 수강 경험이 있다. 실무 인프라 문제 해결은 확인되지 않는다. |
| SRE3 반복되는 인프라 운영 문제를 소프트웨어로 자동화 | 미확인 | — | 운영 절차 자동화 경험이 없다. |
| SRE4 AI 코딩 에이전트 등 새 도구로 생산성 향상 및 안정성 검증 | 미확인 | — | 새 운영 도구 도입과 검증 경험이 없다. |
| SRE5 운영 메트릭·로그·트레이스로 신뢰성 개선 | 미확인 | — | 서비스 텔레메트리를 활용한 신뢰성 개선 기록이 없다. |
| SRE6 신뢰할 지표와 알림 설계로 장애 대응 효율 개선 | 미확인 | — | 장애 대응 알림 개선 기록이 없다. |
| SRE7 Kubernetes 인프라 운영 및 개선 | 미확인 | — | Kubernetes 인프라 운영 기록이 없다. |

## 오태민

계정 `dummy-career-switch` · 경력 기록 10건

### DA · 여기어때 · Data Analyst [User Behavior]

| 요건 | 판정 | 대표 근거 기록 | 판단 근거 |
|---|---|---|---|
| DA1 고객 행동 등 데이터 분석 경력 5년 이상 | 미확인 | — | UI 디자인과 프론트엔드 경력은 확인되지만 데이터 분석 5년 근거는 없다. |
| DA2 퍼널·리텐션·코호트 등 프로덕트 분석 방법 이해 | 부분 | [누리여행 UI 디자이너](../assets/persona-evidence-v1/records.jsonl#L83) | 결제 단계와 완료율을 살폈다. 리텐션·코호트 분석은 확인되지 않는다. |
| DA3 핵심 지표를 정하고 가설·실험으로 서비스 개선 | 부분 | [누리여행 UI 디자이너](../assets/persona-evidence-v1/records.jsonl#L83) · [거래 내역 표 성능 개선](../assets/persona-evidence-v1/records.jsonl#L85) | 결제 완료율과 화면 성능·문의 건수의 변화를 확인했다. 통제 실험 설계는 미확인이다. |
| DA4 SQL·Python으로 수집부터 분석·보고까지 수행 | 미확인 | — | SQL·Python으로 분석 전 과정을 수행한 기록이 없다. |
| DA5 비즈니스 이해와 유연하고 신뢰할 수 있는 업무 태도 | 직접 | [누리여행 UI 디자이너](../assets/persona-evidence-v1/records.jsonl#L83) · [거래 내역 표 성능 개선](../assets/persona-evidence-v1/records.jsonl#L85) | 결제 이탈과 회계 고객 문의를 제품 개선에 반영했다. |
| DA6 실험·사후 분석과 시각화로 부서의 의사결정 지원 | 간접 | [누리여행 UI 디자이너](../assets/persona-evidence-v1/records.jsonl#L83) · [거래 내역 표 성능 개선](../assets/persona-evidence-v1/records.jsonl#L85) | 전후 지표 비교 경험은 있으나 분석 부서용 실험·시각화 지원은 확인되지 않는다. |
| DA7 Airflow·dbt·BigQuery 활용 | 미확인 | — | 세 도구의 사용 기록이 없다. |

### ML · CJ올리브영 · Data Scientist (AI 추천)

| 요건 | 판정 | 대표 근거 기록 | 판단 근거 |
|---|---|---|---|
| ML1 머신러닝 기초 지식 | 미확인 | — | 머신러닝 지식이나 구현 경험을 보여주는 기록이 없다. |
| ML2 머신러닝 적용 업무 경력 3년 이상, 특히 추천 모델 | 미확인 | — | 머신러닝을 적용한 업무 경력이 없다. |
| ML3 고객·상품·브랜드 분석에서 비즈니스 인사이트 도출 | 부분 | [누리여행 UI 디자이너](../assets/persona-evidence-v1/records.jsonl#L83) | 결제 단계 축소와 완료율 개선은 고객 여정에 관한 근거다. 상품·브랜드 분석은 미확인이다. |
| ML4 스스로 문제와 해결 방향 정의 | 강한 직접 | [거래 내역 표 성능 개선](../assets/persona-evidence-v1/records.jsonl#L85) | 고객 문의에서 대량 거래 표의 렌더링 원인을 찾고 가상 스크롤로 개선했다. |
| ML5 모델 설계와 결과 해석을 과학적으로 문서화 | 미확인 | — | 머신러닝 모델 설계와 결과 해석 문서가 없다. |
| ML6 탐색 경험을 개선하는 추천 모델 개발 | 미확인 | — | 추천 모델 개발 기록이 없다. |
| ML7 이커머스 추천·광고 모델 개발 및 운영 | 미확인 | — | 커머스 추천·광고 모델 운영 기록이 없다. |

### BI · 채널톡 · Data Analyst

| 요건 | 판정 | 대표 근거 기록 | 판단 근거 |
|---|---|---|---|
| BI1 DA 관련 실무 경험 1년~7년 이상(공고 표현) | 미확인 | — | 분석가 실무 연차를 확인할 수 없다. |
| BI2 비즈니스 문제를 구조화하고 핵심 원인 정의 | 직접 | [거래 내역 표 성능 개선](../assets/persona-evidence-v1/records.jsonl#L85) | 고객 문의를 거래량에 따른 UI 병목으로 좁히고 전후 결과를 측정했다. |
| BI3 SQL로 원자료 추출·분석 및 인사이트 도출 | 미확인 | — | SQL로 원자료를 추출·분석한 기록이 없다. |
| BI4 문제를 주도적으로 파고들고 새로운 지식을 습득 | 강한 직접 | [거래 내역 표 성능 개선](../assets/persona-evidence-v1/records.jsonl#L85) · [온새미 코딩스쿨 프론트엔드 집중 과정](../assets/persona-evidence-v1/records.jsonl#L86) | 프론트엔드 기술을 학습하고 실무 성능 문제를 직접 해결했다. |
| BI5 여러 팀과 소통·협업 | 직접 | [누리여행 UI 디자이너](../assets/persona-evidence-v1/records.jsonl#L83) | 개발자와 같은 이름으로 UI를 다루기 위해 토큰 표를 만들었다. |
| BI6 시각화 도구로 대시보드 구축 | 간접 | [동네 도서관 좌석 현황 웹앱](../assets/persona-evidence-v1/records.jsonl#L80) | 좌석 현황을 지도에 표시했다. 분석 도구 기반 대시보드 구축 기록은 없다. |
| BI7 Python을 활용한 데이터 처리·분석 | 미확인 | — | Python 데이터 분석 기록이 없다. |

### BE · 버즈빌 · [광고 운영 시스템] 백엔드 엔지니어(경력 무관, 전문연구요원 편입/전직 가능)

| 요건 | 판정 | 대표 근거 기록 | 판단 근거 |
|---|---|---|---|
| BE1 서버 언어로 백엔드 시스템 개발, 프로젝트 경험 인정 | 미확인 | — | 서버 정렬 사용은 확인되나 서버 시스템을 직접 개발한 근거가 없다. |
| BE2 관계형 DB와 NoSQL 저장소 사용 | 미확인 | — | RDB와 NoSQL 사용을 확인할 기록이 없다. |
| BE3 외부 시스템 API 연동 설계 및 개발 | 미확인 | — | 자체적으로 외부 API 연동을 설계·구현한 기록이 없다. |
| BE4 제품에 필요한 다른 기술 영역까지 확장 | 강한 직접 | [누리여행 UI 디자이너](../assets/persona-evidence-v1/records.jsonl#L83) · [바름회계 프론트엔드 개발자](../assets/persona-evidence-v1/records.jsonl#L84) | UI 설계에서 프론트엔드 개발·접근성 개선까지 역할을 확장했다. |
| BE5 다른 직군과 소통·협업 | 직접 | [누리여행 UI 디자이너](../assets/persona-evidence-v1/records.jsonl#L83) | 디자인 토큰을 개발자와 공유해 컴포넌트 명칭을 정리했다. |
| BE6 AI 도구 도입으로 생산성 개선 | 미확인 | — | AI 도구 활용으로 생산성을 높인 기록이 없다. |
| BE7 계정·권한 관리 및 제휴사 SSO 연동 | 미확인 | — | 인증·인가 또는 SSO 구현 기록이 없다. |
| BE8 Kotlin·Java 등 JVM 언어로 서버 개발 | 미확인 | — | JVM 기반 서버 개발 기록이 없다. |

### FE · 캐치테이블 · B2B Front-end Developer

| 요건 | 판정 | 대표 근거 기록 | 판단 근거 |
|---|---|---|---|
| FE1 React 사용 경험 | 직접 | [React](../assets/persona-evidence-v1/records.jsonl#L88) · [온새미 코딩스쿨 프론트엔드 집중 과정](../assets/persona-evidence-v1/records.jsonl#L86) | React를 팀 프로젝트와 실무에서 사용하고 상태 관리를 적용했다. |
| FE2 UX/UI 개발 경험 | 강한 직접 | [바름회계 프론트엔드 개발자](../assets/persona-evidence-v1/records.jsonl#L84) · [전표 입력 화면 접근성 개선](../assets/persona-evidence-v1/records.jsonl#L87) | UI 설계 경험을 전표 입력 화면 구현과 키보드·스크린리더 개선에 적용했다. |
| FE3 컴퓨터과학 기본 지식 | 부분 | [거래 내역 표 성능 개선](../assets/persona-evidence-v1/records.jsonl#L85) | 렌더링 비용을 가상 스크롤로 줄였다. 컴퓨터과학 기초 전반의 근거는 제한적이다. |
| FE4 유관 경력 5년 이상 또는 이에 준하는 경험 | 부분 | [누리여행 UI 디자이너](../assets/persona-evidence-v1/records.jsonl#L83) · [바름회계 프론트엔드 개발자](../assets/persona-evidence-v1/records.jsonl#L84) | UI 디자인 5년과 2025년부터의 프론트엔드 경력이 있다. 개발 5년 또는 동등한 범위는 미확인이다. |
| FE5 유관 팀과 원활한 소통 | 직접 | [누리여행 UI 디자이너](../assets/persona-evidence-v1/records.jsonl#L83) | 디자이너와 개발자가 공유할 컴포넌트 언어를 정리했다. |
| FE6 측정 지표로 웹 성능 이슈의 우선순위를 정하고 개선 | 강한 직접 | [거래 내역 표 성능 개선](../assets/persona-evidence-v1/records.jsonl#L85) | 5천 행의 첫 표시를 3.2초에서 0.9초로 줄이고 고객 문의 변화도 확인했다. |
| FE7 다수의 웹뷰 개발 경험 | 미확인 | — | 여행 앱 디자인은 확인되지만 모바일 웹뷰 개발 기록은 없다. |

### SRE · 당근 · Site Reliability Engineer - 인프라 (클러스터)

| 요건 | 판정 | 대표 근거 기록 | 판단 근거 |
|---|---|---|---|
| SRE1 SRE·DevOps·플랫폼 인프라 운영·개선 경력 3~5년 | 미확인 | — | SRE·플랫폼 인프라 운영 경력이 없다. |
| SRE2 Kubernetes·Linux·네트워크 기반 복잡한 문제 해결 | 미확인 | — | 클러스터·Linux·네트워크 운영 문제 해결 기록이 없다. |
| SRE3 반복되는 인프라 운영 문제를 소프트웨어로 자동화 | 미확인 | — | 인프라 운영을 자동화한 기록이 없다. |
| SRE4 AI 코딩 에이전트 등 새 도구로 생산성 향상 및 안정성 검증 | 미확인 | — | 새 인프라 도구를 적용하고 안정성을 검증한 기록이 없다. |
| SRE5 운영 메트릭·로그·트레이스로 신뢰성 개선 | 간접 | [거래 내역 표 성능 개선](../assets/persona-evidence-v1/records.jsonl#L85) | 화면 렌더링 지표를 측정했다. 인프라 텔레메트리 기반 신뢰성 개선은 미확인이다. |
| SRE6 신뢰할 지표와 알림 설계로 장애 대응 효율 개선 | 미확인 | — | 장애 대응 알림 설계 기록이 없다. |
| SRE7 Kubernetes 인프라 운영 및 개선 | 미확인 | — | Kubernetes 인프라 운영 기록이 없다. |

## 윤하린

계정 `dev01` · 경력 기록 19건

### DA · 여기어때 · Data Analyst [User Behavior]

| 요건 | 판정 | 대표 근거 기록 | 판단 근거 |
|---|---|---|---|
| DA1 고객 행동 등 데이터 분석 경력 5년 이상 | 미확인 | — | 프론트엔드 실무 경력은 확인되지만 고객 행동 분석 직무 5년은 미확인이다. |
| DA2 퍼널·리텐션·코호트 등 프로덕트 분석 방법 이해 | 미확인 | — | 고객 퍼널·리텐션·코호트 분석을 수행한 기록이 없다. |
| DA3 핵심 지표를 정하고 가설·실험으로 서비스 개선 | 부분 | [상품 상세 페이지 App Router 전환과 성능 개선](../assets/persona-evidence-v1/records.jsonl#L97) · [쇼핑 화면 웹 접근성 개선](../assets/persona-evidence-v1/records.jsonl#L101) | 성능과 접근성 지표를 설정하고 개선했다. 성장 가설의 통제 실험은 확인되지 않는다. |
| DA4 SQL·Python으로 수집부터 분석·보고까지 수행 | 미확인 | — | SQL·Python 기반 마트 구축과 분석 보고 경험은 확인되지 않는다. |
| DA5 비즈니스 이해와 유연하고 신뢰할 수 있는 업무 태도 | 직접 | [쇼핑 화면 웹 접근성 개선](../assets/persona-evidence-v1/records.jsonl#L101) · [실시간 주문 현황 대시보드](../assets/persona-evidence-v1/records.jsonl#L95) | 쇼핑 이용자 문의와 운영팀의 주문 이상 탐지 문제를 제품 개선에 반영했다. |
| DA6 실험·사후 분석과 시각화로 부서의 의사결정 지원 | 부분 | [실시간 주문 현황 대시보드](../assets/persona-evidence-v1/records.jsonl#L95) | 운영 대시보드를 제공했다. A/B 테스트와 사후 분석을 수행한 기록은 없다. |
| DA7 Airflow·dbt·BigQuery 활용 | 미확인 | — | 세 도구를 활용한 기록이 없다. |

### ML · CJ올리브영 · Data Scientist (AI 추천)

| 요건 | 판정 | 대표 근거 기록 | 판단 근거 |
|---|---|---|---|
| ML1 머신러닝 기초 지식 | 미확인 | — | 학위와 프론트엔드 경험에서 머신러닝 지식의 구체적 근거를 찾기 어렵다. |
| ML2 머신러닝 적용 업무 경력 3년 이상, 특히 추천 모델 | 미확인 | — | 머신러닝 모델 실무 경력이 확인되지 않는다. |
| ML3 고객·상품·브랜드 분석에서 비즈니스 인사이트 도출 | 간접 | [쇼핑 화면 웹 접근성 개선](../assets/persona-evidence-v1/records.jsonl#L101) · [실시간 주문 현황 대시보드](../assets/persona-evidence-v1/records.jsonl#L95) | 고객 문의와 주문 이상을 해석했으나 고객·상품·브랜드 분석의 직접 근거는 부족하다. |
| ML4 스스로 문제와 해결 방향 정의 | 강한 직접 | [상품 상세 페이지 App Router 전환과 성능 개선](../assets/persona-evidence-v1/records.jsonl#L97) · [사내 디자인 시스템 '모아 UI' 구축](../assets/persona-evidence-v1/records.jsonl#L100) | 렌더링 병목과 컴포넌트 중복을 정의하고 단계적 전환 및 공통 시스템으로 해결했다. |
| ML5 모델 설계와 결과 해석을 과학적으로 문서화 | 미확인 | — | 머신러닝 모델 설계·실험 문서가 없다. |
| ML6 탐색 경험을 개선하는 추천 모델 개발 | 미확인 | — | 추천 모델 개발 기록이 없다. |
| ML7 이커머스 추천·광고 모델 개발 및 운영 | 미확인 | — | 커머스 웹 개발은 확인되지만 추천·광고 모델 운영은 미확인이다. |

### BI · 채널톡 · Data Analyst

| 요건 | 판정 | 대표 근거 기록 | 판단 근거 |
|---|---|---|---|
| BI1 DA 관련 실무 경험 1년~7년 이상(공고 표현) | 미확인 | — | 프론트엔드 개발 기간으로 DA 실무 기간을 입증할 수 없다. |
| BI2 비즈니스 문제를 구조화하고 핵심 원인 정의 | 직접 | [실시간 주문 현황 대시보드](../assets/persona-evidence-v1/records.jsonl#L95) | 주문 이상 발견 지연을 문제로 정리해 운영 대시보드를 구축했다. |
| BI3 SQL로 원자료 추출·분석 및 인사이트 도출 | 미확인 | — | SQL 원자료 분석 기록이 없다. |
| BI4 문제를 주도적으로 파고들고 새로운 지식을 습득 | 강한 직접 | [상품 상세 페이지 App Router 전환과 성능 개선](../assets/persona-evidence-v1/records.jsonl#L97) · [App Router 전환기: 상품 상세 LCP를 절반으로](../assets/persona-evidence-v1/records.jsonl#L91) | App Router를 단계적으로 도입하고 측정 결과와 전환 방법을 정리했다. |
| BI5 여러 팀과 소통·협업 | 강한 직접 | [사내 디자인 시스템 '모아 UI' 구축](../assets/persona-evidence-v1/records.jsonl#L100) | 디자이너·개발자의 반복 수정을 공통 토큰과 컴포넌트로 줄였다. |
| BI6 시각화 도구로 대시보드 구축 | 부분 | [실시간 주문 현황 대시보드](../assets/persona-evidence-v1/records.jsonl#L95) · [리듬노트(가상) 주니어 프론트엔드 개발자](../assets/persona-evidence-v1/records.jsonl#L89) | 주문·정산 대시보드와 차트를 개발했다. BI 도구 활용은 확인되지 않는다. |
| BI7 Python을 활용한 데이터 처리·분석 | 미확인 | — | Python 기반 분석 기록이 없다. |

### BE · 버즈빌 · [광고 운영 시스템] 백엔드 엔지니어(경력 무관, 전문연구요원 편입/전직 가능)

| 요건 | 판정 | 대표 근거 기록 | 판단 근거 |
|---|---|---|---|
| BE1 서버 언어로 백엔드 시스템 개발, 프로젝트 경험 인정 | 부분 | [상품 상세 페이지 App Router 전환과 성능 개선](../assets/persona-evidence-v1/records.jsonl#L97) | 서버 컴포넌트로 요청을 이동했다. 독립 백엔드 시스템을 개발한 범위는 미확인이다. |
| BE2 관계형 DB와 NoSQL 저장소 사용 | 부분 | [개인 가계부 PWA(사이드 프로젝트)](../assets/persona-evidence-v1/records.jsonl#L106) | IndexedDB를 사용했다. 관계형 DB를 함께 사용한 기록은 없다. |
| BE3 외부 시스템 API 연동 설계 및 개발 | 부분 | [실시간 주문 현황 대시보드](../assets/persona-evidence-v1/records.jsonl#L95) · [개인 가계부 PWA(사이드 프로젝트)](../assets/persona-evidence-v1/records.jsonl#L106) | 주문 이벤트 수신과 동기화를 구현했다. 외부 시스템 API의 설계 책임은 미확인이다. |
| BE4 제품에 필요한 다른 기술 영역까지 확장 | 직접 | [상품 상세 페이지 App Router 전환과 성능 개선](../assets/persona-evidence-v1/records.jsonl#L97) · [사내 디자인 시스템 '모아 UI' 구축](../assets/persona-evidence-v1/records.jsonl#L100) | 프론트엔드에서 서버 컴포넌트·공통 디자인 시스템까지 제품 범위를 넓혔다. |
| BE5 다른 직군과 소통·협업 | 강한 직접 | [사내 디자인 시스템 '모아 UI' 구축](../assets/persona-evidence-v1/records.jsonl#L100) | 디자이너와 개발자가 함께 쓰는 접근성 컴포넌트 48개를 배포했다. |
| BE6 AI 도구 도입으로 생산성 개선 | 미확인 | — | 페이지 초안 생성 도구 기록에는 AI 사용 여부가 명시되지 않는다. |
| BE7 계정·권한 관리 및 제휴사 SSO 연동 | 미확인 | — | 계정 권한 관리나 제휴사 SSO 구현 기록이 없다. |
| BE8 Kotlin·Java 등 JVM 언어로 서버 개발 | 미확인 | — | JVM 언어로 서버를 개발한 기록이 없다. |

### FE · 캐치테이블 · B2B Front-end Developer

| 요건 | 판정 | 대표 근거 기록 | 판단 근거 |
|---|---|---|---|
| FE1 React 사용 경험 | 강한 직접 | [React · Next.js](../assets/persona-evidence-v1/records.jsonl#L103) · [상품 상세 페이지 App Router 전환과 성능 개선](../assets/persona-evidence-v1/records.jsonl#L97) | React·Next.js로 실제 상품 상세를 단계적으로 전환하고 성능을 측정했다. |
| FE2 UX/UI 개발 경험 | 강한 직접 | [사내 디자인 시스템 '모아 UI' 구축](../assets/persona-evidence-v1/records.jsonl#L100) · [쇼핑 화면 웹 접근성 개선](../assets/persona-evidence-v1/records.jsonl#L101) | 공통 컴포넌트와 쇼핑 화면의 접근성을 구현·검증했다. |
| FE3 컴퓨터과학 기본 지식 | 직접 | [한빛대학교(가상) 컴퓨터공학과 학사](../assets/persona-evidence-v1/records.jsonl#L92) · [상품 상세 페이지 App Router 전환과 성능 개선](../assets/persona-evidence-v1/records.jsonl#L97) | 컴퓨터공학 학사와 서버·클라이언트 경계 및 캐시 설계 경험이 있다. |
| FE4 유관 경력 5년 이상 또는 이에 준하는 경험 | 강한 직접 | [리듬노트(가상) 주니어 프론트엔드 개발자](../assets/persona-evidence-v1/records.jsonl#L89) · [모아마켓(가상) 웹 프론트엔드팀 프론트엔드 엔지니어](../assets/persona-evidence-v1/records.jsonl#L105) | 2021년부터 이어진 두 프론트엔드 직무와 실제 제품 운영 기록이 있다. |
| FE5 유관 팀과 원활한 소통 | 강한 직접 | [사내 디자인 시스템 '모아 UI' 구축](../assets/persona-evidence-v1/records.jsonl#L100) | 공통 디자인 시스템으로 디자인·개발 간 중복 수정을 줄였다. |
| FE6 측정 지표로 웹 성능 이슈의 우선순위를 정하고 개선 | 강한 직접 | [상품 상세 페이지 App Router 전환과 성능 개선](../assets/persona-evidence-v1/records.jsonl#L97) · [웹 성능 측정(Lighthouse · Web Vitals)](../assets/persona-evidence-v1/records.jsonl#L98) | Lighthouse CI와 Web Vitals로 성능 예산을 측정하며 LCP를 개선했다. |
| FE7 다수의 웹뷰 개발 경험 | 미확인 | — | PWA·모바일 웹 경험은 있으나 네이티브 앱 내부 웹뷰 개발 기록은 없다. |

### SRE · 당근 · Site Reliability Engineer - 인프라 (클러스터)

| 요건 | 판정 | 대표 근거 기록 | 판단 근거 |
|---|---|---|---|
| SRE1 SRE·DevOps·플랫폼 인프라 운영·개선 경력 3~5년 | 미확인 | — | SRE·플랫폼 인프라 운영 연차가 확인되지 않는다. |
| SRE2 Kubernetes·Linux·네트워크 기반 복잡한 문제 해결 | 미확인 | — | Kubernetes·Linux·네트워크 인프라 운영 기록이 없다. |
| SRE3 반복되는 인프라 운영 문제를 소프트웨어로 자동화 | 간접 | [상품 상세 페이지 App Router 전환과 성능 개선](../assets/persona-evidence-v1/records.jsonl#L97) · [Vitest · Playwright](../assets/persona-evidence-v1/records.jsonl#L96) | CI 성능 검사와 테스트를 자동화했다. 클러스터 운영 자동화는 미확인이다. |
| SRE4 AI 코딩 에이전트 등 새 도구로 생산성 향상 및 안정성 검증 | 부분 | [상품 상세 페이지 App Router 전환과 성능 개선](../assets/persona-evidence-v1/records.jsonl#L97) · [Vitest · Playwright](../assets/persona-evidence-v1/records.jsonl#L96) | 개발 파이프라인에 자동 검사를 도입했다. 인프라 생산성 효과에 대한 근거는 제한적이다. |
| SRE5 운영 메트릭·로그·트레이스로 신뢰성 개선 | 간접 | [웹 성능 측정(Lighthouse · Web Vitals)](../assets/persona-evidence-v1/records.jsonl#L98) · [상품 상세 페이지 App Router 전환과 성능 개선](../assets/persona-evidence-v1/records.jsonl#L97) | 사용자 화면 지표를 모니터링했다. 인프라 장애를 운영 데이터로 분석한 기록은 없다. |
| SRE6 신뢰할 지표와 알림 설계로 장애 대응 효율 개선 | 간접 | [실시간 주문 현황 대시보드](../assets/persona-evidence-v1/records.jsonl#L95) | 이상 주문 기준을 넘으면 알림을 표시했다. 서비스 장애 온콜 알림 설계는 미확인이다. |
| SRE7 Kubernetes 인프라 운영 및 개선 | 미확인 | — | Kubernetes 인프라 운영 기록이 없다. |

## 정우진

계정 `dummy-staff-platform` · 경력 기록 100건

### DA · 여기어때 · Data Analyst [User Behavior]

| 요건 | 판정 | 대표 근거 기록 | 판단 근거 |
|---|---|---|---|
| DA1 고객 행동 등 데이터 분석 경력 5년 이상 | 미확인 | — | 플랫폼 경력과 운영 지표 분석은 있으나 고객 행동 데이터 분석 실무 5년은 확인되지 않는다. |
| DA2 퍼널·리텐션·코호트 등 프로덕트 분석 방법 이해 | 미확인 | — | 퍼널·리텐션·코호트 등 프로덕트 행동 분석 기록이 없다. |
| DA3 핵심 지표를 정하고 가설·실험으로 서비스 개선 | 간접 | [팀별 클라우드 비용 가시화](../assets/persona-evidence-v1/records.jsonl#L165) | 비용 태그 적용률과 사용률을 개선했다. 프로덕트 성장 가설과 고객 실험은 미확인이다. |
| DA4 SQL·Python으로 수집부터 분석·보고까지 수행 | 부분 | [SQL](../assets/persona-evidence-v1/records.jsonl#L207) · [팀별 클라우드 비용 가시화](../assets/persona-evidence-v1/records.jsonl#L165) | SQL로 비용·장애 데이터를 분석했다. Python 기반 분석 마트부터 보고까지의 전 과정은 미확인이다. |
| DA5 비즈니스 이해와 유연하고 신뢰할 수 있는 업무 태도 | 직접 | [바로마켓 클라우드 비용 절감 TF](../assets/persona-evidence-v1/records.jsonl#L161) · [바로마켓 스태프 엔지니어 · 플랫폼 기술 리드](../assets/persona-evidence-v1/records.jsonl#L197) | 팀별 비용 개선 과제와 본부 우선순위를 조율했다. 행동 근거로만 평가했다. |
| DA6 실험·사후 분석과 시각화로 부서의 의사결정 지원 | 부분 | [바로마켓 클라우드 비용 절감 TF](../assets/persona-evidence-v1/records.jsonl#L161) · [팀별 클라우드 비용 가시화](../assets/persona-evidence-v1/records.jsonl#L165) | 팀별 비용 대시보드와 개선 효과를 제공했다. 온라인 통제 실험은 확인되지 않는다. |
| DA7 Airflow·dbt·BigQuery 활용 | 미확인 | — | Airflow·dbt·BigQuery를 사용한 기록이 없다. |

### ML · CJ올리브영 · Data Scientist (AI 추천)

| 요건 | 판정 | 대표 근거 기록 | 판단 근거 |
|---|---|---|---|
| ML1 머신러닝 기초 지식 | 미확인 | — | 인프라 연구와 운영 경험만으로 머신러닝 기초를 확인하기 어렵다. |
| ML2 머신러닝 적용 업무 경력 3년 이상, 특히 추천 모델 | 미확인 | — | 추천 등 머신러닝 모델 실무 경력이 확인되지 않는다. |
| ML3 고객·상품·브랜드 분석에서 비즈니스 인사이트 도출 | 간접 | [팀별 클라우드 비용 가시화](../assets/persona-evidence-v1/records.jsonl#L165) · [사내 개발자 포털 · 서비스 카탈로그](../assets/persona-evidence-v1/records.jsonl#L167) | 팀별 비용과 포털 이용자 분석은 인접 경험이다. 상품·브랜드 분석은 미확인이다. |
| ML4 스스로 문제와 해결 방향 정의 | 강한 직접 | [사내 개발자 포털 · 서비스 카탈로그](../assets/persona-evidence-v1/records.jsonl#L167) · [결제 DB PostgreSQL 장애 조치 자동화](../assets/persona-evidence-v1/records.jsonl#L203) | 소유자 식별 지연과 수동 장애 조치를 정의하고 시스템으로 해결했다. |
| ML5 모델 설계와 결과 해석을 과학적으로 문서화 | 간접 | [컨테이너 오케스트레이션 환경에서 결제 서비스 가용성 분석](../assets/persona-evidence-v1/records.jsonl#L128) | 가용성을 분석한 연구 기록이 있다. 머신러닝 모델 설계·해석 문서는 미확인이다. |
| ML6 탐색 경험을 개선하는 추천 모델 개발 | 미확인 | — | 검색 자동완성 API 개발 이력에서 추천 모델 개발은 확인되지 않는다. |
| ML7 이커머스 추천·광고 모델 개발 및 운영 | 미확인 | — | 커머스 인프라 운영과 추천 모델 운영을 구분했다. 후자의 근거가 없다. |

### BI · 채널톡 · Data Analyst

| 요건 | 판정 | 대표 근거 기록 | 판단 근거 |
|---|---|---|---|
| BI1 DA 관련 실무 경험 1년~7년 이상(공고 표현) | 부분 | [SQL](../assets/persona-evidence-v1/records.jsonl#L207) · [바로마켓 클라우드 비용 절감 TF](../assets/persona-evidence-v1/records.jsonl#L161) | SQL 기반 비용·장애 분석과 비용 절감 TF 경험은 있으나 DA 직무 기간은 산정하기 어렵다. |
| BI2 비즈니스 문제를 구조화하고 핵심 원인 정의 | 강한 직접 | [팀별 클라우드 비용 가시화](../assets/persona-evidence-v1/records.jsonl#L165) | 팀별 비용 배분이 불가능한 원인을 추적해 태그 규칙·검사·대시보드로 해결했다. |
| BI3 SQL로 원자료 추출·분석 및 인사이트 도출 | 직접 | [SQL](../assets/persona-evidence-v1/records.jsonl#L207) · [팀별 클라우드 비용 가시화](../assets/persona-evidence-v1/records.jsonl#L165) | PostgreSQL 비용·장애 분석 경험과 비용 가시화 결과가 있다. |
| BI4 문제를 주도적으로 파고들고 새로운 지식을 습득 | 강한 직접 | [결제 DB PostgreSQL 장애 조치 자동화](../assets/persona-evidence-v1/records.jsonl#L203) · [Kubernetes 클러스터 업그레이드 자동화](../assets/persona-evidence-v1/records.jsonl#L139) | 반복 장애 조치와 클러스터 업그레이드를 자동화하고 훈련·운영으로 검증했다. |
| BI5 여러 팀과 소통·협업 | 강한 직접 | [바로마켓 스태프 엔지니어 · 플랫폼 기술 리드](../assets/persona-evidence-v1/records.jsonl#L197) · [결제 API SLO 도입과 알림 재설계](../assets/persona-evidence-v1/records.jsonl#L134) | 플랫폼·SRE·데이터 인프라 조직과 서비스팀 요구를 조율했다. |
| BI6 시각화 도구로 대시보드 구축 | 강한 직접 | [Grafana](../assets/persona-evidence-v1/records.jsonl#L172) · [Graphite에서 Prometheus로 모니터링 전환](../assets/persona-evidence-v1/records.jsonl#L189) | 모니터링 대시보드 120개를 이관하고 운영 지표 체계를 개선했다. |
| BI7 Python을 활용한 데이터 처리·분석 | 직접 | [Python](../assets/persona-evidence-v1/records.jsonl#L124) | Python을 비용 분석과 데이터 정리에 사용했다고 기술했다. |

### BE · 버즈빌 · [광고 운영 시스템] 백엔드 엔지니어(경력 무관, 전문연구요원 편입/전직 가능)

| 요건 | 판정 | 대표 근거 기록 | 판단 근거 |
|---|---|---|---|
| BE1 서버 언어로 백엔드 시스템 개발, 프로젝트 경험 인정 | 강한 직접 | [대양정보시스템 공공사업팀 백엔드 개발자](../assets/persona-evidence-v1/records.jsonl#L178) · [Java](../assets/persona-evidence-v1/records.jsonl#L162) · [검색어 자동완성 API 개편](../assets/persona-evidence-v1/records.jsonl#L198) | Spring 기반 민원 API와 검색 자동완성 API를 구현·최적화했다. |
| BE2 관계형 DB와 NoSQL 저장소 사용 | 강한 직접 | [결제 DB PostgreSQL 장애 조치 자동화](../assets/persona-evidence-v1/records.jsonl#L203) · [검색어 자동완성 API 개편](../assets/persona-evidence-v1/records.jsonl#L198) | PostgreSQL 장애 조치와 Redis 조회 경로 최적화를 실제 운영했다. |
| BE3 외부 시스템 API 연동 설계 및 개발 | 부분 | [장애 대응 채팅 봇](../assets/persona-evidence-v1/records.jsonl#L155) | 장애 대응 채팅 봇과 상태 페이지를 연계했다. 외부 파트너 API의 설계 주체·규격은 미확인이다. |
| BE4 제품에 필요한 다른 기술 영역까지 확장 | 강한 직접 | [사내 개발자 포털 · 서비스 카탈로그](../assets/persona-evidence-v1/records.jsonl#L167) · [팀별 클라우드 비용 가시화](../assets/persona-evidence-v1/records.jsonl#L165) | 개발자 포털과 비용 가시화 화면까지 플랫폼 제품의 범위를 확장했다. |
| BE5 다른 직군과 소통·협업 | 강한 직접 | [바로마켓 스태프 엔지니어 · 플랫폼 기술 리드](../assets/persona-evidence-v1/records.jsonl#L197) · [바로마켓 클라우드 비용 절감 TF](../assets/persona-evidence-v1/records.jsonl#L161) | 세 조직의 기술 방향과 클라우드 비용 과제를 사업 우선순위와 조율했다. |
| BE6 AI 도구 도입으로 생산성 개선 | 미확인 | — | 운영 봇과 자동화 경험에서 AI 개발 도구 사용은 확인되지 않는다. |
| BE7 계정·권한 관리 및 제휴사 SSO 연동 | 간접 | [Vault 기반 시크릿 관리 통합](../assets/persona-evidence-v1/records.jsonl#L144) | 시크릿 관리·권한 통제는 관련 경험이다. 사용자 계정과 제휴사 SSO 구현은 미확인이다. |
| BE8 Kotlin·Java 등 JVM 언어로 서버 개발 | 직접 | [Java](../assets/persona-evidence-v1/records.jsonl#L162) · [대양정보시스템 공공사업팀 백엔드 개발자](../assets/persona-evidence-v1/records.jsonl#L178) | Java·Spring으로 API와 배치를 개발했다. |

### FE · 캐치테이블 · B2B Front-end Developer

| 요건 | 판정 | 대표 근거 기록 | 판단 근거 |
|---|---|---|---|
| FE1 React 사용 경험 | 미확인 | — | 개발자 포털을 구현했으나 React 사용은 확인되지 않는다. |
| FE2 UX/UI 개발 경험 | 부분 | [사내 개발자 포털 · 서비스 카탈로그](../assets/persona-evidence-v1/records.jsonl#L167) · [팀별 클라우드 비용 가시화](../assets/persona-evidence-v1/records.jsonl#L165) | 포털에 서비스 카탈로그·비용 화면을 제공했다. UI 구현 상세는 미확인이다. |
| FE3 컴퓨터과학 기본 지식 | 강한 직접 | [한빛공과대학교 컴퓨터공학과 학사](../assets/persona-evidence-v1/records.jsonl#L120) · [검색어 자동완성 API 개편](../assets/persona-evidence-v1/records.jsonl#L198) · [결제 DB PostgreSQL 장애 조치 자동화](../assets/persona-evidence-v1/records.jsonl#L203) | 컴퓨터공학 학위와 자료구조·DB 장애 조치의 실무 사례가 있다. |
| FE4 유관 경력 5년 이상 또는 이에 준하는 경험 | 간접 | [사내 개발자 포털 · 서비스 카탈로그](../assets/persona-evidence-v1/records.jsonl#L167) · [팀별 클라우드 비용 가시화](../assets/persona-evidence-v1/records.jsonl#L165) | 포털 제품 경험은 있으나 프론트엔드 유관 경력 5년 또는 동등 범위는 미확인이다. |
| FE5 유관 팀과 원활한 소통 | 강한 직접 | [바로마켓 스태프 엔지니어 · 플랫폼 기술 리드](../assets/persona-evidence-v1/records.jsonl#L197) · [바로마켓 클라우드 비용 절감 TF](../assets/persona-evidence-v1/records.jsonl#L161) | 플랫폼·데이터·인프라 팀과 비용 절감 TF에서 요구를 조율했다. |
| FE6 측정 지표로 웹 성능 이슈의 우선순위를 정하고 개선 | 간접 | [검색어 자동완성 API 개편](../assets/persona-evidence-v1/records.jsonl#L198) | 응답 지연을 측정해 검색 API를 개선했다. 브라우저 렌더링 병목 개선은 미확인이다. |
| FE7 다수의 웹뷰 개발 경험 | 미확인 | — | 웹뷰 개발 기록이 없다. |

### SRE · 당근 · Site Reliability Engineer - 인프라 (클러스터)

| 요건 | 판정 | 대표 근거 기록 | 판단 근거 |
|---|---|---|---|
| SRE1 SRE·DevOps·플랫폼 인프라 운영·개선 경력 3~5년 | 부분 | [누리포털 인프라개발팀 배포 · 모니터링 담당](../assets/persona-evidence-v1/records.jsonl#L175) · [셈들페이 SRE팀 시니어 엔지니어](../assets/persona-evidence-v1/records.jsonl#L153) · [바로마켓 스태프 엔지니어 · 플랫폼 기술 리드](../assets/persona-evidence-v1/records.jsonl#L197) | 관련 운영 업무는 직접 확인되나 여러 인프라 직무의 합산 경력이 공고 범위 3~5년을 초과한다. |
| SRE2 Kubernetes·Linux·네트워크 기반 복잡한 문제 해결 | 강한 직접 | [Kubernetes 클러스터 업그레이드 자동화](../assets/persona-evidence-v1/records.jsonl#L139) · [Linux](../assets/persona-evidence-v1/records.jsonl#L146) · [Envoy 서비스 메시 도입](../assets/persona-evidence-v1/records.jsonl#L205) | 클러스터 업그레이드와 서비스 메시 도입 등 복잡한 인프라 문제를 해결했다. |
| SRE3 반복되는 인프라 운영 문제를 소프트웨어로 자동화 | 강한 직접 | [결제 DB PostgreSQL 장애 조치 자동화](../assets/persona-evidence-v1/records.jsonl#L203) · [Kubernetes 클러스터 업그레이드 자동화](../assets/persona-evidence-v1/records.jsonl#L139) | PostgreSQL 장애 조치를 자동화해 25분에서 30초 이내로 단축하고 훈련으로 검증했다. |
| SRE4 AI 코딩 에이전트 등 새 도구로 생산성 향상 및 안정성 검증 | 부분 | [카나리 기반 점진 배포 도입](../assets/persona-evidence-v1/records.jsonl#L119) · [PR별 임시 환경](../assets/persona-evidence-v1/records.jsonl#L131) · [Go 서비스 템플릿과 신규 서비스 자동 준비](../assets/persona-evidence-v1/records.jsonl#L154) | 카나리 배포 검증·임시 환경·Go 템플릿으로 생산성과 안정성을 개선했다. 공고가 예로 든 AI 코딩 에이전트 사용은 미확인이다. |
| SRE5 운영 메트릭·로그·트레이스로 신뢰성 개선 | 강한 직접 | [OpenTelemetry 기반 관측 전환](../assets/persona-evidence-v1/records.jsonl#L137) · [결제 API SLO 도입과 알림 재설계](../assets/persona-evidence-v1/records.jsonl#L134) | 분산 추적과 결제 API SLO를 도입해 장애 원인을 분석하고 알림 체계를 개선했다. |
| SRE6 신뢰할 지표와 알림 설계로 장애 대응 효율 개선 | 강한 직접 | [결제 API SLO 도입과 알림 재설계](../assets/persona-evidence-v1/records.jsonl#L134) · [온콜 알림을 70% 줄인 과정](../assets/persona-evidence-v1/records.jsonl#L163) · [온콜 체계를 서비스팀 소유로 개편](../assets/persona-evidence-v1/records.jsonl#L188) | SLO 기반 알림과 온콜 소유 방식을 개선해 불필요한 호출을 줄였다. |
| SRE7 Kubernetes 인프라 운영 및 개선 | 강한 직접 | [Kubernetes 클러스터 업그레이드 자동화](../assets/persona-evidence-v1/records.jsonl#L139) · [결제 서비스 Kubernetes 무중단 이전](../assets/persona-evidence-v1/records.jsonl#L145) · [Kubernetes](../assets/persona-evidence-v1/records.jsonl#L200) | 결제 서비스 무중단 이전과 클러스터 업그레이드 자동화를 직접 수행했다. |
