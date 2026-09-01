# 채용 추천 모델 파일럿 v0

## 목적

30개 합성 프로필만 있는 초기 단계에서, 프로필과 공고 임베딩을 입력받는 작은 랭커가
TF-IDF·BM25·고정 E5 cosine 기준선을 이길 가능성이 있는지 실제 RTX 5080 학습으로
확인한다. 이 실험은 제품 품질을 입증하지 않으며 다음 데이터 투자 여부를 판단하는
smoke test다.

## 고정 입력과 분할

- 프로필: `luna-v3/profiles`의 Expresso JSON 30개
- 공고: 로컬 JTH `jobs.csv`; 서버 DB는 이 파일럿에서 사용하지 않는다.
- 행동 사전학습: JTH `history.csv`의 실제 지원 전형 단계
- 프로필 분할: 안정 해시로 train 20, valid 5, test 5
- Expresso 후보: 프로필당 서로 다른 공고 20개, 총 600쌍
- 공고는 한 split에만 속하게 뽑아 평가 누수를 막는다.

JTH 단계 라벨은 다음 하나의 규칙으로 고정한다.

| 라벨 | 의미 | JTH 단계 |
| --- | --- | --- |
| 0 | 관찰되지 않은 지원 | 같은 split에서 표집한 비상호작용 |
| 1 | 지원·이력서 전달 | Application Made, Resume Sent |
| 2 | 선별·자격 검토 | Shortlist, Qualification |
| 3 | 면접·오퍼 | 1st–4th Interview, Offer Received, Offer Accepted |

동일 후보자·공고쌍이 여러 단계에 있으면 최댓값을 사용한다. 후보자와 공고 ID를 각각
안정 해시로 나눈 뒤 둘이 같은 split인 상호작용만 사용한다. 음성 표본도 같은 split
안에서만 만든다.

## Luna teacher 라벨

프로필 하나와 후보 공고 20개를 한 번의 요청에 넣어 비용을 30회 호출로 제한한다.
Luna는 각 쌍에 `teacherLabel` 0–3과 제한된 `reasonCodes`만 반환한다. 프로필 원문의
`title`, `properties`, `bodyMd`만 모델 입력으로 사용하며 lineage나 내부 검수 필드는
추천 입력에서 제외한다. 출력은 정확히 20개이며 중복·누락·범위 오류를 로컬 schema로
거부한다. 실패 시 자동 재시도하지 않는다.

## 모델

`intfloat/multilingual-e5-base`를 동결하고 다음 벡터를 만든다.

- 프로필: `query: {profile text}`
- 공고: `passage: {job text}`

두 768차원 벡터 `p`, `j`로 `[p, j, |p-j|, p*j]`를 만들고 작은 MLP가 0–3
관련성 logit을 출력한다. JTH 행동쌍으로 먼저 학습한 뒤 Expresso synthetic train 쌍으로
미세조정한다. encoder 가중치는 갱신하지 않아 16GB GPU에서도 실행 가능하고 실험 원인을
작은 ranker로 한정한다.

## 평가

같은 valid/test 후보군과 라벨을 기존 retrieval evaluation harness에 입력한다.
비교 대상은 token overlap, word/char TF-IDF, BM25, valid에서 고정한 hybrid,
고정 E5 cosine, 학습 MLP다. 주 지표는 NDCG@10이고 MAP, Recall@10, MRR@10, AUC,
hard-negative accuracy를 함께 기록한다.

사람 라벨이 없으므로 release gate는 반드시 `insufficient_human_labels`다. 학습 모델이
synthetic test에서 기준선을 이겨도 제품 품질이나 일반화의 증거로 해석하지 않는다.
특히 프로필은 한국어, JTH 공고는 영어이므로 lexical 기준선 대비 우위는 교차언어
encoder의 구조적 이점이 섞인 결과다.

## 재현성과 산출물

seed 42, 모델 revision, 입력 SHA-256, CUDA/Python/PyTorch 버전, 분할 수량과 학습
hyperparameter를 `run-manifest.json`에 저장한다. 산출물은
`var/ml-data/experiments/match-pilot-v0/` 아래 데이터셋, embedding cache, checkpoint,
candidate scores, metrics, summary로 분리한다.

