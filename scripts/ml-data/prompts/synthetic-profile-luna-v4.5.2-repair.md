# 역할

기존 Expresso 합성 프로필에서 품질 게이트가 지정한 기록만 다시 쓴다. 입력 `currentBodyMd`의
사건 의미와 `facts`를 보존하되 문장과 제목을 새로 작성한다. 사실과 모순되지 않는 상황,
작업 순서, 판단, 소통과 회고는 자유롭게 창작할 수 있다.

# 출력

입력과 같은 `shardId`를 가진 JSON 객체 하나만 출력한다.

```json
{
  "shardId": "입력 shardId",
  "profiles": [
    {
      "profileSeed": "입력 profileSeed",
      "records": [
        {"eventId": "입력 eventId", "title": "새 제목", "detailMd": "새 본문"}
      ]
    }
  ]
}
```

profile과 record는 입력 순서를 지킨다. 모든 입력 profile과 모든 입력 event를 정확히 한 번씩
출력한다. 입력에 없는 profile이나 record를 추가하지 않는다. 출력 직전에 profile 수,
각 profile의 record 수와 eventId 순서가 입력과 같은지 확인한다.
구조 필드와 프로퍼티는 조립기가 채우므로 출력하지 않는다.

# 보정 규칙

- `legacy_fixed_skeleton`: 과거 고정 첫 문장을 제거하고 facts를 자연스럽게 재서술한다.
- `repeated_final_sentence`: `forbiddenExactSentences`의 문장을 사용하지 않고 문장 구조와 관찰 지점을 바꾼다.
- `repeated_non_education_title`: `forbiddenTitles`와 다른, 사건 대상이나 결과가 드러나는 제목을 쓴다.
- `layout_mismatch`: `layoutMode`를 정확히 따른다.
- `compact_note`와 `single_paragraph`는 한 문단으로 쓴다.
- `multi_paragraph`는 두 개 이상의 문단으로 나누고 문단 사이에 빈 줄을 둔다.
- `checklist`는 각 완결 문장을 `- `로 시작하는 불릿으로 쓴다.

# 품질 계약

- `detailLength.minChars` 이상 `maxChars` 이하이면서 `targetChars`에 최대한 가깝게 쓴다.
  분량이 애매하면 줄이지 말고 사실과 모순되지 않는 작업 과정·판단·소통·회고를 더한다.
- `detailLength`는 후처리에서 일부 문장이 제거될 것을 감안한 원고 분량이다.
  `postSanitizeLength`보다 길더라도 임의로 줄이지 말고 `detailLength`를 우선한다.
- `minimumSentences`는 권장값이 아니라 하한이다. 출력 직전에 event별 문장 수를 세어
  반드시 그 이상인지 확인한다. 짧은 문장으로 개수만 채우지 않는다.
- facts의 사건, 시점, 기간, 직무, 학력, 자격, 역할, 행동, 결과와 입력 숫자·날짜를 보존한다.
- `requiredNumbers`의 모든 값을 본문에 그대로 한 번 이상 넣는다.
- `numericFacts`는 숫자 하나도 생략하지 않고 자연스러운 문장으로 재서술한다. 연도와 월이
  함께 있으면 둘 다 쓴다. 예를 들어 `2021`, `2`가 요구되면 `2021년 2월`처럼 함께 표현한다.
- `requiredEvidenceAnchors`를 빠뜨리지 않는다.
- facts의 긴 문장을 그대로 붙여 넣지 말고 어순·서술 관점·문장 경계를 바꿔 재서술한다.
- 입력에 없는 숫자·날짜·실존 기관명·회사명·학교명·자격명·제품명·고객명을 만들지 않는다.
- 구조 필드 라벨, 면접 표현, 미래 포부, 상투적 역량 자랑을 쓰지 않는다.
- `이후`, `특히`, `이를 해결하기 위해`, `확인했다`로 모든 기록을 같은 흐름으로 만들지 않는다.
- `claims`, `evidenceIds`, `recordLinks`, 기록 간 관계, 스킬 숙련도를 만들지 않는다.
