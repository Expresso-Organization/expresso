# 공고 추천 baseline·평가 harness

## 목적

합성 프로필과 채용 공고의 관련성 점수를 내는 후보 모델이 단순 검색 방식보다 실제로
나은지 같은 데이터와 같은 지표로 판정합니다. 평가 코드는 특정 학습 알고리즘에
종속되지 않습니다. TF-IDF·BM25 baseline과 bi-encoder·LightGBM 등의 외부 점수 파일을
한 harness에서 비교합니다.

이 harness는 모델 학습, 합성 라벨 생성, 임베딩 추론을 수행하지 않습니다. 입력 데이터의
누수를 검사하고, baseline 점수를 만들고, 전달받은 후보 모델 점수를 평가하고, 승인 기준을
기계적으로 판정하는 데까지만 책임집니다.

## 기존 설계와의 관계

`docs/design-doc/04-AI학습모델의-설계.md`는 고정 임베딩 특징과 LightGBM LambdaMART를
제품 후보로 정합니다. `docs/operations/P5_ML_DATA_COLLECTION_REPORT.md`는 bi-encoder
실험을 다음 단계로 제안합니다. 어느 쪽을 선택하더라도 평가는 같아야 하므로 모델은
`candidate-scores.jsonl`만 제출합니다.

공식 배포 기준은 `docs/design-doc/09-성능시험지표.md`를 따릅니다.

- NDCG@10은 0.80 이상이어야 합니다.
- label 3 대 나머지 AUC는 0.85 이상이어야 합니다.
- 교사와 사람의 Cohen's kappa는 0.6 이상이어야 합니다.
- 학생과 사람의 일치도는 규칙 baseline보다 상대적으로 20% 이상 좋아야 합니다.
- 사람 검수 표본은 300쌍 이상이어야 합니다.

이와 별도로 연구 후보가 복잡성을 정당화하려면 가장 강한 검색 baseline보다 test
NDCG@10이 상대적으로 5% 이상 높고, 프로필 bootstrap 차이의 95% 신뢰구간 하한이
0보다 커야 합니다.

## 입력 계약

모든 파일은 UTF-8 JSONL입니다. 한 줄은 JSON 객체 하나이며 ID는 파일 안에서
유일해야 합니다. 알 수 없는 필드는 허용하지 않습니다.

### `profiles.jsonl`

```json
{"profileId":"p-001","text":"데이터 분석 프로젝트 ...","split":"test","sourceAtomIds":["aih-71592-a"]}
```

| 필드 | 계약 |
| --- | --- |
| `profileId` | 비어 있지 않은 문자열, 유일 |
| `text` | baseline이 읽을 정규화 전 프로필 텍스트 |
| `split` | `train`, `valid`, `test` 중 하나 |
| `sourceAtomIds` | AI Hub 근거 ID 배열, 프로필 사이 중복은 가능하지만 split을 넘을 수 없음 |

프로필 텍스트에는 목표 직무, 경력 연차, 기록 제목·본문, 기술 이름을 포함합니다. 성별과
연령은 넣지 않습니다.

### `jobs.jsonl`

```json
{"jobId":"j-001","text":"데이터 엔지니어 Python SQL ...","split":"test","duplicateGroupId":"job-family-001"}
```

| 필드 | 계약 |
| --- | --- |
| `jobId` | 비어 있지 않은 문자열, 유일 |
| `text` | 공고 제목·직무·요건·담당 업무를 합친 텍스트 |
| `split` | `train`, `valid`, `test` 중 하나 |
| `duplicateGroupId` | 중복·재게시 공고가 공유하는 그룹 ID |

### `labels.jsonl`

```json
{"profileId":"p-001","jobId":"j-001","split":"test","teacherLabel":3,"humanLabel":2,"reasonCodes":["ROLE_MATCH"]}
```

| 필드 | 계약 |
| --- | --- |
| `profileId` | `profiles.jsonl`에 존재 |
| `jobId` | `jobs.jsonl`에 존재 |
| `split` | 프로필·공고의 split과 동일 |
| `teacherLabel` | 합성 교사 라벨 0–3 |
| `humanLabel` | 사람 라벨 0–3 또는 `null` |
| `reasonCodes` | 라벨 근거 코드 배열 |

같은 `(profileId, jobId)` 쌍은 한 번만 나옵니다. 한 프로필의 평가 후보군은 최소 두
공고이며, 공식 NDCG@10 평가 후보군은 열 공고 이상이어야 합니다.

### `candidate-scores.jsonl`

```json
{"model":"bi-encoder-v1","profileId":"p-001","jobId":"j-001","score":0.8123}
```

`model`, `profileId`, `jobId` 조합은 유일해야 합니다. 점수는 유한한 실수입니다. 한
모델이 valid 또는 test split의 일부 쌍만 제출하면 해당 모델 평가는 실패합니다. train
점수는 제출하지 않아도 됩니다.

## 텍스트 정규화

baseline은 입력 텍스트를 Unicode NFKC로 정규화하고 소문자로 바꾼 뒤 연속 공백을
하나로 줄입니다. 원문 파일은 변경하지 않습니다.

- word 토큰은 한글·영문·숫자로 이루어진 연속 문자열입니다.
- word n-gram은 1–2gram입니다.
- char n-gram은 공백을 정리한 문자열의 3–5gram입니다.
- 빈 텍스트는 입력 오류입니다.

TF-IDF의 문서 빈도는 라벨을 보지 않고 전체 공고 텍스트에서 계산합니다. 이는 실제
서비스가 현재 공고 인덱스 전체를 알고 있는 것과 같은 조건이며, baseline을 약하게 만들기
위해 test 공고를 숨기지 않습니다. 프로필 텍스트는 IDF 계산에 넣지 않습니다.

## baseline

### 토큰 겹침

프로필과 공고의 고유 word 토큰 집합에 대해 Jaccard 유사도를 계산합니다. 기존 문자열
부분 일치보다 안정적인 최소 baseline입니다.

### word TF-IDF

word 1–2gram에 sublinear TF와 smooth IDF를 적용하고 L2 정규화한 뒤 cosine 유사도를
계산합니다.

### char TF-IDF

char 3–5gram에 같은 TF-IDF와 cosine을 적용합니다. 한국어 띄어쓰기와 활용 차이에 덜
민감하므로 word 방식과 별도 baseline으로 유지합니다.

### BM25

word unigram으로 BM25 점수를 계산합니다. 기본값은 `k1=1.5`, `b=0.75`입니다.

### hybrid

각 프로필 후보군 안에서 char TF-IDF와 BM25 점수를 0–1로 정규화합니다. valid
NDCG@10이 가장 높은 가중치를 `[0, 0.25, 0.5, 0.75, 1]`에서 고르고 test에서는 그
가중치를 고정합니다. 가중치는 char TF-IDF의 비중이며 동점이면 더 단순한 char
TF-IDF 비중이 큰 값을 선택합니다. valid 튜닝에는 `teacherLabel`만 사용합니다.

baseline별 동점은 `jobId` 오름차순으로 깨서 실행마다 같은 순위를 만듭니다.

## 누수 검사

평가 전에 다음 조건을 모두 검사합니다. 하나라도 어기면 점수를 계산하지 않고 종료합니다.

1. 같은 `profileId`는 하나의 split에만 속합니다.
2. 같은 `sourceAtomId`를 가진 프로필은 하나의 split에만 속합니다.
3. 같은 `jobId`는 하나의 split에만 속합니다.
4. 같은 `duplicateGroupId`는 하나의 split에만 속합니다.
5. label의 split은 참조하는 프로필과 공고의 split과 같습니다.
6. 후보 점수는 해당 모델의 평가 대상 쌍을 빠짐없이 포함합니다.

## 평가 지표

지표는 먼저 프로필별로 계산한 뒤 macro average합니다. 후보군 크기가 `k`보다 작으면
그 프로필에서는 실제 후보군 크기를 사용합니다.

| 지표 | 정의 |
| --- | --- |
| NDCG@10 | 라벨 gain `[0, 1, 3, 7]`을 사용한 정규화 DCG |
| MAP | label 2 이상을 relevant로 보는 average precision의 프로필 평균 |
| Recall@10 | label 2 이상인 공고 중 상위 10개에 들어온 비율 |
| MRR@10 | label 3 공고가 처음 등장한 순위의 역수 |
| AUC | label 3 대 나머지의 pairwise AUC |
| hard-negative accuracy | label 2 이상 공고가 label 0–1 공고보다 높은 점수를 받은 쌍의 비율 |

사람 라벨이 있는 쌍에서는 teacher–human kappa와 후보 모델–human 지표를 별도로
계산합니다. 합성 라벨만 있는 valid·test 결과는 `teacherLabel`을 정답으로 사용하고,
사람 기준 test 결과는 `humanLabel`이 있는 쌍만 별도 후보군으로 구성합니다. 합성 라벨만
있는 결과를 사람 기준 성능으로 표시하지 않습니다.

AUC는 양성과 음성이 모두 있는 프로필에서만 계산하고 유효 프로필끼리 macro
average합니다. 유효 프로필이 없으면 값은 `null`이며 출력에 경고를 남깁니다. 다른
지표도 정답 분모가 없는 프로필은 값이 0이 아니라 `null`이고 macro average에서
제외합니다.

## bootstrap과 비교

프로필을 복원 추출하는 paired bootstrap을 2,000회 수행합니다. 난수 seed는 42입니다.
각 반복에서 후보 모델과 baseline의 동일 프로필 NDCG@10 차이를 평균합니다. 2.5와
97.5 백분위수를 95% 신뢰구간으로 기록합니다.

valid split에서 baseline 하나를 고르고 test split에서는 그 baseline만 후보 모델과
비교합니다. baseline 선택은 valid `teacherLabel` NDCG@10으로 하며, test 결과를 보고
baseline이나 hybrid 가중치를 바꾸지 않습니다. 사람 라벨이 300쌍 이상이면 공식
bootstrap 비교는 사람 라벨 후보군의 프로필별 NDCG@10을 사용합니다. 그보다 적으면
`teacherLabel` 기준 참고용 신뢰구간만 기록합니다.

## 승인 판정

평가 결과의 `gate.status`는 다음 중 하나입니다.

| 상태 | 조건 |
| --- | --- |
| `insufficient_human_labels` | test 사람 라벨이 300쌍 미만 |
| `teacher_untrusted` | 사람 라벨 300쌍 이상이고 teacher–human kappa가 0.6 미만 |
| `baseline_not_beaten` | 후보 NDCG 상대 개선이 5% 미만이거나 bootstrap 하한이 0 이하 |
| `metric_threshold_failed` | 사람 기준 NDCG@10 0.80, AUC 0.85, 규칙 baseline 대비 상대 개선 20% 또는 프로필당 사람 라벨 후보 10개 미달 |
| `passed` | 위 실패 조건이 없고 기존 설계서의 사람 기준 개선 조건도 충족 |

사람 라벨이 부족해도 합성 라벨 기준 지표와 baseline 비교값은 기록합니다. 다만 공식 통과
표시는 하지 않습니다.

여기서 기존 설계서의 “학생과 사람의 일치도”는 사람 라벨 후보군에서 계산한 후보 모델
NDCG@10으로 측정합니다. 규칙 baseline은 토큰 겹침 Jaccard이며, 후보 NDCG@10이 이
값보다 상대적으로 20% 이상 높아야 합니다. 가장 강한 검색 baseline 대비 5% 개선은 이와
별도의 연구 gate입니다. 비교 대상 baseline NDCG가 0이면 상대 개선 대신 절대 차이가
양수인지 판정하고 결과에 `relativeImprovement: null`을 기록합니다.

## 출력

기본 출력 위치는 `var/ml-data/evaluation/<dataset-version>/`입니다.

### `metrics.json`

- 입력 파일 SHA-256
- 실행 시각과 코드 커밋
- split별 프로필·공고·쌍 수
- baseline별 valid·test 지표
- 선택된 strongest baseline과 hybrid 가중치
- 후보 모델별 지표
- bootstrap 신뢰구간
- 사람 라벨 수, kappa, 승인 상태와 실패 사유

### `summary.md`

사람이 바로 비교할 수 있도록 모델별 NDCG@10·MAP·Recall@10·MRR@10·AUC와 gate
판정을 표로 씁니다. 이 파일은 `metrics.json`에서 결정론적으로 생성합니다.

## 명령행 인터페이스

```powershell
python scripts/ml-data/evaluate_retrieval.py `
  --profiles var/ml-data/evaluation/match-v1/profiles.jsonl `
  --jobs var/ml-data/evaluation/match-v1/jobs.jsonl `
  --labels var/ml-data/evaluation/match-v1/labels.jsonl `
  --candidate-scores var/ml-data/evaluation/match-v1/candidate-scores.jsonl `
  --output var/ml-data/evaluation/match-v1/results
```

`--candidate-scores`는 생략할 수 있습니다. 이 경우 baseline만 계산합니다. 입력 오류와
누수는 종료 코드 2, 계산 중 오류는 종료 코드 1, 정상 완료는 종료 코드 0입니다. 모델이
gate를 통과하지 못하는 것은 평가 결과이지 실행 오류가 아니므로 종료 코드 0입니다.

## 코드 경계

| 파일 | 책임 |
| --- | --- |
| `scripts/ml-data/retrieval_baselines.py` | 정규화, 토큰화, TF-IDF, BM25, hybrid 점수 |
| `scripts/ml-data/ranking_evaluation.py` | 입력 계약, 누수 검사, 지표, bootstrap, gate |
| `scripts/ml-data/evaluate_retrieval.py` | CLI, 파일 입출력, 결과 직렬화 |
| `scripts/ml-data/retrieval_baselines_test.py` | baseline의 수치와 순위 회귀 테스트 |
| `scripts/ml-data/ranking_evaluation_test.py` | 지표·누수·bootstrap·gate 회귀 테스트 |

표준 Python 라이브러리만 사용합니다. dense 모델과 LightGBM 의존성은 평가 harness에
추가하지 않습니다.

## 검증

단위 테스트는 손으로 계산 가능한 작은 후보군을 사용합니다.

1. 관련 단어가 겹치는 공고가 모든 lexical baseline에서 무관 공고보다 위에 옵니다.
2. 정답 순위가 완전할 때 NDCG@10·MAP·Recall@10·MRR@10·AUC가 1입니다.
3. source atom과 중복 공고가 split을 넘으면 실패합니다.
4. 후보 점수가 한 쌍이라도 빠지면 실패합니다.
5. 같은 seed의 bootstrap 결과는 완전히 같습니다.
6. 사람 라벨 300쌍 미만에서는 공식 통과가 나오지 않습니다.
7. CLI fixture 실행이 `metrics.json`과 `summary.md`를 만듭니다.

저장소 검증은 다음 명령으로 수행합니다.

```powershell
pnpm ml:data:test
pnpm typecheck
pnpm test
```
