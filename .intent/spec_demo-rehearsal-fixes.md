# Spec: 시연 리허설 수정

- `jobBoardFilter`: `country === "한국"`이면 `locationRegion: null`도 포함한다. `summary.countries`의 한국 수에 같은 공고를 더한다. `summary`의 `location`은 회사 이름과 같으면 null이다.
- 공고 상세 머리: `analyzePostingAction` 폼. `job.brew` 유무로 이름을 가른다.
- `Reanalyze`: `analyzing` prop(`queued`·`running`) 동안 `useRefreshWhile`. 실패 상태에서는 단추가 열린다.
- `sourceLines`: `#{1,6}` 줄은 제목, 내용 없으면 빈 줄. 이스케이프에 `. # ! +`를 더한다.
- `keywordMet(keyword, source, careerYears)`: 낱말 일치 또는 연차 충족 + 남은 낱말 일치. `calculateExplainableMatch`와 `calculateRequirementCoverage`가 공용한다.
- `careerYearsOf`: `experience` 범주 기록의 `period`를 겹침 없이 합친 연수. `recordPeriod`를 재료와 기록 목록이 쓴다.
- `metricValueAllowed`: `METRIC_VALUE_PATTERN` 또는 출처에 그대로 있는 공백 없는 낱말. `metricUnitsAgree`: 시간과 건수가 갈리면 위반이고, 고쳐도 남으면 싣지 않는다.
- `metricBeforeGrounded`: 이전 값은 출처에 그대로 있고 값과 달라야 한다. 위반은 목록을 고쳐 받고, 남으면 이전 값만 뺀다.
- `HttpStatusError.publicMessage`: 있으면 오류 처리기가 공통 문구 대신 쓴다. 지면 경로는 한글이 있는 `PageServiceError` 문장만 싣는다.
- `INSTRUCT_SYSTEM`: note에 내부 이름 금지, 칸 수정으로 못 하는 요청은 이유와 지면 구성 편집을 안내한다.
- fanout 멱등 키에 `sourcePropertyId`와 원본 버전을 넣는다.

```mermaid
flowchart LR
  A[공고 검색] --> B[공고 상세] --> C[이 공고로 만들기] --> D[분석 · 재료 · 질문] --> E[생성] --> F[부분 수정] --> G[배포]
```

Open questions: 없음.
