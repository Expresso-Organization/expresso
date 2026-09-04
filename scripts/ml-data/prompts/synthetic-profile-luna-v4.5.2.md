# 역할

입력 context의 사람들을 서로 다른 실제 사용자처럼 보이는 Expresso 합성 프로필로 작성한다.
입력 사건은 사실 골격이며, 사실과 모순되지 않는 상황·과정·판단·소통·회고는 자유롭게
창작한다. 결과는 면접 답변이나 자기소개서가 아니라 노션에 정리한 개인 기록이다.

# 출력 bundle

다음 모양의 JSON 객체 하나만 출력한다.

```json
{
  "shardId": "입력 shardId",
  "profiles": [
    {
      "profileSeed": "입력 profileSeed",
      "records": [
        {"eventId": "ev1", "title": "짧은 명사형", "detailMd": "본문"}
      ]
    }
  ]
}
```

각 profile과 event를 입력 순서대로 정확히 한 번씩 쓴다. `draftId`, `categoryKey`,
`properties`, `persona`, `status`는 출력하지 않는다.

# 사실 보존과 창작

- `facts`의 사건 종류, 시점, 기간, 직무, 학력, 자격, 역할, 행동과 결과를 의미상 보존한다.
- 골격 문장을 그대로 복사하거나 공통 첫 문장으로 사용하지 않고 자연스러운 과거 경험으로 재서술한다.
- `requiredEvidenceAnchors`와 입력의 숫자·날짜는 빠뜨리지 않는다.
- `requiredNumbers`의 모든 값을 본문에 그대로 한 번 이상 넣고, `numericFacts`의 숫자는
  하나도 생략하지 않는다. 연도와 월이 함께 있으면 `2021년 2월`처럼 둘 다 쓴다.
- `requiredDatePhrases`가 있으면 해당 문자열을 본문에 그대로 한 번 이상 넣는다.
  출력 직전에 각 문자열이 실제로 포함됐는지 검색해 확인한다.
- 입력과 모순되지 않는 세부 작업, 판단, 대화, 일반적인 도구와 회고는 창작할 수 있다.
- 새 숫자·날짜·실존 기관명·회사명·학교명·자격명·제품명·고객명은 만들지 않는다.
- 구조 필드 라벨과 구분 기호를 본문에 노출하지 않는다.

# 레이아웃

각 event의 `layoutMode`를 반드시 따른다.

- `compact_note`: 짧은 한 문단
- `single_paragraph`: 자연스러운 한 문단
- `multi_paragraph`: 두 개 이상의 문단, 문단 사이 빈 줄
- `checklist`: 각 문장을 `- `로 시작하는 불릿

`detailLength`와 `minimumSentences`를 지키고, 긴 본문을 한 문단에 몰아 쓰지 않는다.
`minimumSentences`는 권장값이 아니라 하한이므로 출력 직전에 event별 문장 수를 직접 센다.
`postSanitizeLength`가 함께 있으면 `detailLength`는 후처리 손실을 감안한 원고 분량이다.
원고가 `postSanitizeLength`보다 길어도 줄이지 말고 `detailLength`를 우선한다.

# 다양성

- `sentencePolicy.forbiddenSentencesAlreadyUsedByTwoProfiles`에 있는 문장을 사용하지 않는다.
- 같은 완결 문장이나 제목을 profile 간에 재사용하지 않는다.
- 공통 마무리, 협업, 문서화, 교훈 문장으로 분량을 채우지 않는다.
- 같은 family도 관찰 지점, 작업 순서, 세부 상황과 회고를 새로 쓴다.
- `이후`, `특히`, `이를 해결하기 위해`, `확인했다`를 반복적인 문단 전개 공식으로 쓰지 않는다.

# 금지

면접 표현, 미래 포부, 상투적 역량 자랑, `claims`, `evidenceIds`, `recordLinks`, 기록 간 관계,
스킬 숙련도, 원본 식별자와 민감 정보를 출력하지 않는다.
