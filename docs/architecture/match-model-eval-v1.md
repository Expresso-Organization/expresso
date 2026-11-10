# 적합도 모델 인코더 비교 · 평가 · 지연 측정 실험 v1

작성일 2026-11-10 · 데이터 `fit-v1`(파일럿 10,000쌍) · 대상 설계서 4.4 · 9.2

설계서 9.2 「지표별 측정 현황」의 빈칸 다섯 개를 파일럿 데이터로 채우는 실험이다. 다섯 칸은
인코더 비교, ROC · AUC, 스크리닝 Recall@K, 모델 B NDCG@10, p95 지연이다. 새 교사 라벨링,
합성 프로필 v5, 사람 평가 세트는 이번 실험에 넣지 않는다. 본 학습 계획
([match-model-training-v1.md](./match-model-training-v1.md)) 3장의 선행 작업은 그대로 남는다.

## 1. 실험

| 번호 | 실험 | 명령 | 여는 분할 | 산출물 | 채우는 자리 |
| --- | --- | --- | --- | --- | --- |
| K | 한국어 평가 세트 구성 · Sonnet 교사 라벨 | `ko_postings.mjs` → `ko_eval_dataset.py` → `ko_teacher_labels.py` | — | `ko-eval-v1/` | 성능 판정 기준 세트 |
| E0 | 데이터 · 가중치 확인 | `Get-FileHash` | — | 해시 일치 여부 | 본 학습 계획 3.7 |
| E1 | 인코더별 토큰 길이 | `match_experiments.py token-stats` | 전체(라벨 미사용) | `token-stats.json` | 본 학습 계획 3.2 |
| E2 | 인코더 4종 비교 | `match_experiments.py encoders` | 검증 | `encoder-comparison.json` | 설계서 4.4 2단계 |
| E3 | Bi-Encoder+MLP 학습 · 평가 | `match_experiments.py train-bi` | 검증 · 평가 | `bi-v1-NNN/` | 9.2 모델 A · ROC · Recall@K |
| E4 | Cross-Encoder · 모델 B 평가 | `match_experiments.py eval-cross` | 검증 · 평가 | `cross-v1-NNN/` | 9.2 모델 A · 모델 B |
| E4b | 외부 API 재정렬 · 모델 B (Decisions API · Jev) | `match_api_scorer.py` → `eval-cross` | 검증 · 평가 | `api-*/`, `cross-v1-NNN/` | Cross-Encoder 자리를 API로 바꿀지 |
| E5 | ONNX 내보내기 · CPU 지연 | `match_onnx.py` | — | `latency-*.json` | 9.2 p95 지연 · 처리량 |

평가 분할은 E3과 E4에서 한 번씩만 연다. E2가 검증 분할만으로 인코더를 정한 뒤에 연다
(설계서 4.4 5단계).

## 2. 고정한 조건

| 조건 | 값 | 출처 |
| --- | --- | --- |
| 적합 기준 (ROC 양성 · MAP · MRR · Recall@K) | 교사 점수 60점 이상 | 설계서 9.2 |
| 공고쌍 순서 일치율 | 정답 차 5점 이상인 쌍만 | 설계서 9.2 평가 조건 |
| 주요 지표 | NDCG@10 | 설계서 9.2 |
| 부트스트랩 | 평가 프로필 단위 paired · 20,000회 · seed 42 | 파일럿 리포트 · 설계서 9.2 표 |
| MLP · 손실 · 조기 종료 | 파일럿과 같음 | 설계서 4.3 |
| Cross-Encoder 학습 | 파일럿 `llm_suitability_train.py --mode cross` 그대로 | 설계서 4.3 |

### 인코더

| 키 | 모델 | pooling | 프로필 prompt | 공고 prompt | 모델 한도 |
| --- | --- | --- | --- | --- | ---: |
| `e5` | `intfloat/multilingual-e5-base` | mean | `query: ` | `passage: ` | 512 |
| `kure` | `nlpai-lab/KURE-v1` | CLS | 없음 | 없음 | 8,192 |
| `bge-m3` | `BAAI/bge-m3` | CLS | 없음 | 없음 | 8,192 |
| `qwen3` | `Qwen/Qwen3-Embedding-0.6B` | last-token | `Instruct: …\nQuery:` | 없음 | 32,768 |

- pooling과 정규화는 각 저장소의 `1_Pooling/config.json`을 sentence-transformers가 그대로 읽는다.
- prompt는 `config_sentence_transformers.json`의 `prompts`와 모델 카드를 따른다(2026-11-10 조회).
- Qwen3 지시문은 모델 카드 권고대로 과제에 맞춰 영어로 썼다. 원문은 `match_encoders.py`의 `QWEN3_PROFILE_PROMPT`에 있다.
- 최대 길이는 `min(모델 한도, fit-v1 텍스트의 그 토크나이저 최대 토큰 수)`다. 데이터보다 길게 잡으면 메모리만 더 쓴다. 잘린 비율은 E1 · E2 결과에 남는다.
- 배치는 파일럿 값 32에서 시작한다. GPU 메모리가 넘치면 절반으로 줄여 다시 돈다. 실제로 쓴 배치 크기를 결과에 남긴다.

### 규칙 baseline

서비스 함수 `calculateExplainableMatch()`(`jobs/match-score.ts`)와 `rankMaterials()`(`materials/ranking.ts`)를
`rule_baselines.mjs`가 Node로 직접 부른다. Python으로 옮기지 않았다.

- JTH 공고에는 서비스가 AI로 분해한 요건이 없다. 그래서 교사가 요건으로 읽은 구조화 필드를 서비스 계약 `JobRequirements`에 옮긴다(`match_evaluation.rule_requirements`).
  - 기술 필드는 `technologies`에 넣는다.
  - 소프트 스킬 · 자격 · 언어 · 학력은 `roles`에 넣는다.
  - 필요 연차는 「N years」로 바꾼다. 소수 연차는 올림한다.
  - 축은 점수를 바꾸지 않는다. 일치도는 전체 요건 중 닿은 비율이다.
- 요건을 하나도 읽지 못한 공고(`null`)는 서비스에서 점수가 없다. 그래서 순위에서는 맨 뒤에 두고 MAE에서는 뺀다. 그 수는 `nullPredictions`에 남는다.

### 스크리닝 Recall@K

- 평가 프로필마다 평가 분할 공고 전체(파일럿 228건)를 채점해 K = 1부터 풀 크기까지 곡선을 그린다.
- `kForFullRecall`은 모든 프로필의 적합 공고가 다 들어오는 가장 작은 K다.
- 같은 곡선을 동결 코사인과 규칙 함수로도 그린다.

### 모델 B

- 대상은 평가 분할 (공고, 프로필) 쌍이다. 프로필의 기록마다 점수를 매기고 NDCG@10을 낸다.
- 기록의 정답은 교사가 그 기록을 연결한 요건 충족 점수의 최댓값이다. 충족 점수는 strong 100 · adequate 75 · partial 50 · transferable 25이고, 연결이 없으면 0이다(설계서 9.2 시험내용).
- 정답이 모두 0인 쌍은 어떤 순서도 같은 값이 나오므로 빼고, 그 수를 `skippedAllZero`에 남긴다.
- Cross-Encoder 입력은 학습 때와 같은 틀(`build_selected_profile_text`)에 기록 하나만 넣은 것이다. 학습 때는 기록 최대 8개 묶음이었으므로, 이 실험이 그 입력 단위 차이를 잰다.
- 비교 대상은 같은 인코더의 (공고, 기록) 코사인과 `rankMaterials()`다.

### 외부 API 재정렬 (E4b)

Bi-Encoder+MLP는 직접 학습하고, 재정렬(모델 A)과 기록 채점(모델 B)만 외부 API가 맡는 안을 비교한다.
맥 측정에서 Cross-Encoder가 1,536토큰 쌍당 약 1초였기 때문이다(5절).

| 항목 | Decisions API | Jev |
| --- | --- | --- |
| 엔드포인트 | `POST https://api.openai.com/v1/decisions` | `POST https://api.typesafe.ai/v1/systemone` |
| 모델 | `gpt-6-luna`(유일한 모델) | `jev-1.14.0`(2026-10-14 출시판으로 고정) |
| 키 환경 변수 | `OPENAI_API_KEY` | `TYPESAFE_API_KEY` |
| 입력 100만 토큰당 | $0.10 · 출력 무료 | $0.042 · 출력 무료 |
| 한도 | 질문 1–400개 | 요청당 64k · 질문당 32k 토큰 |

출처: [Decisions 가이드](https://developers.openai.com/api/docs/guides/decisions) · [Create decision](https://developers.openai.com/api/reference/resources/decisions/methods/create) · [Jev 모델](https://docs.typesafe.ai/models.md) · [System One API](https://docs.typesafe.ai/api/system-one.md)(2026-11-10 조회).

- **요청 모양은 서비스가 부를 모양과 같다.**
  - 모델 A는 입력에 프로필 1건을 두고, 후보 공고마다 score 질문을 하나씩 둔다.
  - 모델 B는 입력에 공고 1건을 두고, 기록마다 score 질문을 하나씩 둔다.
- **등급은 교사 루브릭의 근거 판정 5단계다.** not_evidenced부터 strong까지 낮은 것부터 두고, 설명 문장도 교사 프롬프트와 같다. 등급 번호 × 25가 루브릭 충족 점수이므로, API 점수 `score`(등급 번호의 기댓값)를 0–100으로 옮겨 교사 점수와 같은 눈금으로 읽는다. 보정은 하지 않는다.
- **같은 요청은 다시 보내지 않는다.** 요청 본문 해시로 응답을 캐시하므로 끊긴 실행을 이어서 돈다.
- **오류 처리:** 429 · 529 · 5xx는 지수 대기 후 다시 보낸다. 400 · 401 · 422는 바로 멈춘다(Jev 오류 표).
- **거절:** API가 거절한 질문은 점수가 없다. 모델 A에서는 순위 맨 뒤에 두고 MAE에서 뺀다. 모델 B에서는 그 쌍을 빼고 `unscoredPairs`에 수를 남긴다.
- **라벨 출처별 지표:** `eval-cross`는 평가 분할 지표를 교사별로도 나눠 낸다(`testByLabelSource`). 파일럿 라벨 9,260건을 GPT-5.6 Luna가, 740건을 Claude Sonnet이 만들었다. 그래서 같은 계열인 `gpt-6-luna`는 Luna 라벨에서만 높게 나올 수 있다. Sonnet 라벨에서의 값과 함께 본다.
- **지연:** `summary.json`의 요청당 p50 · p95는 프로필 하나에 후보 공고 10개를 채점한 값이다. 5절의 「재정렬 10쌍」과 같은 단위다.

## 3. 결과를 읽을 때

- **적합 공고가 있는 평가 프로필은 13명이다**(60점 이상 라벨 4.1%). ROC · Recall@K · MAP는 이 13명이 정한다.
- **Recall@K는 낮은 쪽으로 치우친다.** 풀의 공고 대부분은 그 프로필에 라벨이 없고, 부적합으로 센다.
- **규칙 baseline은 언어가 갈린다.** JTH 필드는 영어이고 프로필은 한국어다. 문자열이 그대로 들어 있어야 닿는 규칙 함수는 매우 낮게 나온다. 서비스에서도 영어 요건과 한국어 기록은 같은 이유로 닿지 않는다.
- **순서 일치율이 파일럿 수치와 다르다.** 파일럿 0.8025 · 0.7903은 1점 차이도 셌다. 이번 `pairwiseMinGap5`는 설계서 정의(5점 이상)를 따른다. 파일럿 정의의 값도 `pairwiseAccuracy`에 함께 남는다.
- **성능은 한국어 세트로 판정한다.** `fit-v1` 공고는 영어(JTH)라 서비스 성능을 말하지 못한다. 모델은 아직 영어 공고로만 학습했으므로, 한국어 세트 수치는 학습과 평가의 공고 원천이 다른 조건의 값이다.
- **한국어 세트 정답은 Sonnet 5.5 교사 하나다.** 사람 판정과 맞춰 보지 않았다(사용자 결정). 교사와 사람의 일치도는 이 실험이 답하지 않는다.
- **지연은 구조와 입력 길이의 값이다.** 무작위 토큰과 학습 전 가중치로 잰다. 같은 구조면 학습한 가중치도 같은 시간이 걸린다. 맥과 운영 서버(aarch64 Ampere 4 vCPU, 공용 장비)는 CPU가 다르다. Cross-Encoder 유지 판정은 운영 서버에서 잰 값으로 한다(본 학습 계획 5.1).

## 4. 오늘 저녁 실행 절차 (학습 PC · PowerShell)

순서대로 친다. 중간에 끊겨도 앞 단계의 결과 파일은 남는다. E2는 인코더 하나가 끝날 때마다
`encoder-comparison.json`을 덮어쓴다. `$runs`는 새 폴더로 둔다. `encoder-comparison.json`은 실행마다 행을 합치므로,
`--eval-data` 없이 돌린 행과 섞이면 안 된다.

### 준비

```powershell
$repo = "C:\code\expresso"                                     # PC의 저장소 위치로 바꾼다
$exp  = "$repo\var\ml-data\experiments\match-llm-labels-1000-v1"  # 파일럿 실험 폴더(파일럿 리포트 기준)
$data = "$exp\data"                                            # profiles.jsonl 등이 있는 폴더. 이름은 확인하지 못했다 — 다르면 바꾼다
$labels = "$exp\labels-final"                                  # suitability-labels.jsonl
$runs = "$repo\var\ml-data\experiments\match-eval-v1"

cd $repo
git fetch origin
git switch feat/match-model-eval
pnpm install --frozen-lockfile
pnpm --filter "@expresso/contracts..." build                   # 규칙 baseline이 계약 dist를 읽는다
node --version                                                 # 24 이상(저장소 기준). rule_baselines.mjs가 .ts를 그대로 import한다

uv venv var\ml-venv --python 3.12
var\ml-venv\Scripts\activate
uv pip install torch==2.7.0 --index-url https://download.pytorch.org/whl/cu128
uv pip install numpy==2.3.2 transformers==4.55.4 scipy==1.16.1 sentence-transformers==5.1.0 onnx==1.23.2 onnxruntime==1.31.0
python -c "import torch; print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0))"
python scripts\ml-data\match_experiments_test.py               # 가짜 인코더로 명령 전체 확인(CPU)
# PC 캐시에 없는 인코더 3종을 E0 · E1 동안 받아 둔다. KURE · bge-m3은 fp32 가중치만 각 2.27GB다
python -c "from sentence_transformers import SentenceTransformer as S; [S(m, device='cpu') for m in ('nlpai-lab/KURE-v1', 'BAAI/bge-m3', 'Qwen/Qwen3-Embedding-0.6B')]"
```

- RTX 5080(Blackwell)은 CUDA 12.8 빌드가 필요하다. 파일럿과 같은 torch 2.7.0+cu128을 쓴다.
- 모델 다운로드가 401로 실패하면 저장된 토큰이 만료된 것이다. `$env:HF_HUB_DISABLE_IMPLICIT_TOKEN = "1"`을 두고 다시 친다. 네 인코더는 모두 공개 모델이다.

### E0 데이터 · 가중치 확인

```powershell
Get-FileHash "$data\profiles.jsonl", "$data\jobs.jsonl", "$data\candidate-manifest.jsonl", "$labels\suitability-labels.jsonl" -Algorithm SHA256 | Format-Table Hash, Path
Get-ChildItem "$exp\models-llm-v1\e5-mlp", "$exp\models-llm-v1\cross-encoder"
```

파일럿 리포트(`docs/assets/p5-training-results-2026-09-06/analysis.json`)의 해시와 같아야 한다.
PowerShell은 대문자로 출력한다.

| 파일 | SHA-256 |
| --- | --- |
| profiles.jsonl | `d6b23abd6ad7d0d93981e18fd267c6c9443c0ce4e02f589d1994cab41dce6ee8` |
| jobs.jsonl | `6160c26b57071b6faa13f6b3d919beae59728123b9a56beab3d7db7e5aff8605` |
| candidate-manifest.jsonl | `1042e4740fbe660674c7fa4c67f26586c2301eb8faeff028ab1871ed82362e62` |
| suitability-labels.jsonl | `cbf35b5357d70452c486a6b803c65cf31eed92f44b3b91cca8abb660e769e56f` |

해시가 다르면 E1 이후 수치를 파일럿과 나란히 읽을 수 없다. 이때는 진행하지 말고 차이를 먼저 확인한다.

### K 한국어 평가 세트

**성능 판정은 한국어 세트로 한다**(2026-11-10 결정). `fit-v1`은 학습 데이터로만 쓴다. 영어 `fit-v1` 평가 분할 수치는
학습 분포 안의 참고값이다. 정답은 Claude Sonnet 5.5 교사 하나가 매기고 사람 판정은 두지 않는다(사용자 결정).

K0은 맥에서 이미 끝냈다. 로컬 DB에서 한국어 위주 공고 295건을 내보내고 서비스 요건 추출기로 요건을 붙였다.
결과 `var/ml-data/ko-postings/jobs-with-requirements.jsonl`을 PC의 같은 자리로 옮긴다. 공고 원문이라 저장소에는
올리지 않는다.

```powershell
$koJobs = "$repo\var\ml-data\ko-postings\jobs-with-requirements.jsonl"
$ko = "$repo\var\ml-data\experiments\ko-eval-v1\data"
$koLabels = "$repo\var\ml-data\experiments\ko-eval-v1\labels"
Get-FileHash $koJobs -Algorithm SHA256                          # 맥에서 낸 값과 같아야 한다(5절 아래)

# K1 합성 프로필 원본 폴더(<run-root>\profiles\<분할>\*.json)를 찾는다
Get-ChildItem "$repo\var\ml-data" -Recurse -Directory -Filter profiles | Where-Object { Test-Path "$($_.FullName)\valid" } | Select-Object FullName
$runRoot = "<위에서 찾은 profiles 폴더의 부모>"

# K2 세트 구성: 검증 · 평가 프로필 × 한국어 공고 10건(같은 직군 5 · 인접 3 · 무작위 2)
python scripts\ml-data\ko_eval_dataset.py --fit-data $data --profile-root $runRoot --jobs $koJobs --output $ko

# K3 Sonnet 5.5 교사 라벨. Claude Code에 로그인된 창에서 돌린다. 끊기면 같은 명령으로 이어 간다
python scripts\ml-data\ko_teacher_labels.py --data $ko --output $koLabels --workers 2
```

- K2의 `data-manifest.json`에서 프로필 수, 대응 직군이 없어 빠진 프로필 수(`excludedProfiles`), 요건 분해가 빠진 공고 수(`jobsWithoutRequirements`)를 먼저 본다.
- K3는 교사 호출이 프로필당 1회이고, 걸린 칸이 있으면 같은 대화에서 고친다. `label-summary.json`의 `failedProfiles`가 비어야 `suitability-labels.jsonl`이 생긴다.
- 실패한 프로필이 있으면 같은 명령을 다시 친다. 실패한 프로필만 새 대화로 다시 부른다.
- 구독 세션 한도에 걸리면 멈춘다. 한도가 풀린 뒤 같은 명령으로 이어 간다.
- **K3를 가장 먼저 시작한다.** GPU가 필요 없고 가장 오래 걸린다. 맥 시험에서 공고 3건이 약 1.2만 토큰 · 15초였으므로, 공고 10건 × 160명이면 입력이 수백만 토큰이다. 세션 한도에 한 번 이상 걸린다고 보고 일정을 잡는다.
- K3가 도는 동안 다른 창에서 E1 · E2를 돌린다. E2의 비교 지표는 한국어 검증 라벨이 있어야 나오므로, E2는 K3가 끝난 뒤에 친다. 그 전에는 E0 · E1과 인코더 다운로드를 한다.
- 호출 하나에 시간 상한이 없다(저장소 지침). 한 대화가 멈춘 채 오래가면 Ctrl-C로 끊고 같은 명령을 다시 친다. 끝난 프로필은 캐시에서 읽는다.

### E1 토큰 길이

```powershell
python scripts\ml-data\match_experiments.py token-stats --data $ko --labels $koLabels --output $runs
```

### E2 인코더 비교 (한국어 검증 분할)

```powershell
python scripts\ml-data\match_experiments.py encoders --data $data --labels $labels --eval-data $ko --eval-labels $koLabels --output $runs --encoders e5 kure bge-m3 qwen3
```

- 학습과 조기 종료는 `fit-v1`(학습 · 검증 분할)로 하고, 비교 지표는 한국어 세트의 검증 분할이다.
- 인코더는 한국어 검증 NDCG@10이 가장 높은 것으로 정한다(설계서 9.2 주요 지표). 차이가 작으면 시간 · 메모리 · 벡터 용량을 함께 보고 사람이 정한다.
- E5는 512토큰에서 자른다. 한국어 공고 원문은 중앙값 3,097자라 대부분 잘린다. 잘린 비율은 `inputLengths.evalData`에 있다.

### E3 Bi-Encoder+MLP 학습 · 평가

```powershell
python scripts\ml-data\match_experiments.py train-bi --data $data --labels $labels --eval-data $ko --eval-labels $koLabels --output $runs --encoder <E2에서 정한 키>
```

- `metrics.json`의 모델 지표 · ROC · 스크리닝 Recall@K는 한국어 세트로 낸 값이다. 스크리닝 풀은 한국어 평가 분할 공고 전체다.
- 기준선(코사인 · TF-IDF · BM25)은 한국어 세트에 학습 분할이 없으므로 검증 분할에서 점수를 보정한다.
- E2의 임베딩 캐시를 다시 읽으므로 이번 실행에는 임베딩 측정값이 없다. `metrics.json`의 `embedding`은 E2에서 잰 값을 `source: encoder-comparison.json`과 함께 옮겨 둔다.

### E4 Cross-Encoder · 모델 B

파일럿 가중치로 한국어 쌍을 직접 채점한다. 기록 선택은 학습 때와 같이 E5 코사인 상위 기록이다.

```powershell
python scripts\ml-data\match_experiments.py eval-cross --data $ko --labels $koLabels --output $runs --encoder <E2에서 정한 키> `
  --cross-checkpoint "$exp\models-llm-v1\cross-encoder\trainable-state.pt" `
  --e5-model-path "C:\Users\parkm\.cache\huggingface\hub\models--intfloat--multilingual-e5-base\snapshots\d128750597153bb5987e10b1c3493a34e5a4502a"
```

가중치가 없으면 파일럿 방식으로 다시 학습한 뒤 같은 명령을 친다. 학습은 `fit-v1`으로 한다.

```powershell
python scripts\ml-data\llm_suitability_train.py --data $data --labels $labels --output "$runs\pilot-cross" --mode cross
# 이후 --cross-checkpoint "$runs\pilot-cross\cross-encoder\trainable-state.pt"
```

### E4b 외부 API 재정렬 · 모델 B

E2 · E3과 GPU를 나눠 쓰지 않으므로 E2가 도는 동안 다른 창에서 돌려도 된다. 키는 이 창에서만 환경 변수로 둔다.
파일이나 명령 기록에 남기지 않는다.

```powershell
$env:OPENAI_API_KEY = Read-Host "OpenAI API key"
$env:TYPESAFE_API_KEY = Read-Host "TypeSafe API key"
foreach ($p in "decisions", "jev") {
  python scripts\ml-data\match_api_scorer.py --provider $p --data $ko --labels $koLabels --output $runs --dry-run     # 요청 수 · 글자 수
  python scripts\ml-data\match_api_scorer.py --provider $p --data $ko --labels $koLabels --output $runs --limit 1     # 키 · 형식 확인
  python scripts\ml-data\match_api_scorer.py --provider $p --data $ko --labels $koLabels --output $runs
}
python scripts\ml-data\match_experiments.py eval-cross --data $ko --labels $koLabels --output $runs --encoder <E2에서 정한 키> `
  --cross-scores "$runs\api-decisions\scores.jsonl" --record-scores "$runs\api-decisions\record-scores.jsonl" --cross-model-name decisions-gpt-6-luna
python scripts\ml-data\match_experiments.py eval-cross --data $ko --labels $koLabels --output $runs --encoder <E2에서 정한 키> `
  --cross-scores "$runs\api-jev\scores.jsonl" --record-scores "$runs\api-jev\record-scores.jsonl" --cross-model-name jev-1.14.0
```

- 요청 수는 모델 A가 한국어 세트 프로필 수만큼, 모델 B가 쌍 수만큼이다. 비용은 `--dry-run` 글자 수와 실행 뒤 `summary.json`의 `estimatedUsd`로 확인한다. 한국어 공고 원문이 길어 `fit-v1`보다 입력이 크다.
- 429가 이어지면 `--workers`를 줄인다.
- Jev 키가 없으면 Decisions만 돌린다. Jev는 early access라 대기 목록을 거쳐 키를 받는다.
- 한국어 세트 정답은 Sonnet 교사라서, Luna 계열 Decisions API와 교사가 겹치는 문제가 없다.

### E5 ONNX 내보내기 · 지연

```powershell
python scripts\ml-data\match_onnx.py export-mlp --checkpoint "$runs\bi-v1-001\checkpoint.pt" --output "$runs\onnx\mlp"
python scripts\ml-data\match_onnx.py export-encoder --model <E2에서 정한 모델 ID> --output "$runs\onnx\encoder" --quantize
python scripts\ml-data\match_onnx.py export-cross --model BAAI/bge-reranker-v2-m3 --checkpoint "$exp\models-llm-v1\cross-encoder\trainable-state.pt" --output "$runs\onnx\cross" --quantize
python scripts\ml-data\match_onnx.py latency --encoder "$runs\onnx\encoder" --mlp "$runs\onnx\mlp" --cross "$runs\onnx\cross" --threads 4 --quantized --output "$runs\latency-pc-int8.json"
```

- 2GB를 넘는 모델(bge-reranker-v2-m3 · KURE · bge-m3)은 가중치가 `model.onnx` 옆의 외부 파일 수백 개로 나뉜다. 옮길 때는 폴더 전체를 옮긴다. `manifest.json`의 `files`가 폴더 내용이다.
- Qwen3-Embedding은 내보내지 않는다. 디코더라 transformers 4.55의 mask 생성(vmap)을 TorchScript가 추적하지 못한다. 우회하면 추적할 때의 길이가 그래프에 고정된다(2026-11-10 시험). E2에서 Qwen3가 정해지면 지연은 별도로 잰다. 인코더 선정 자체는 ONNX와 무관하다.
- `--profile-tokens`는 E1의 프로필 p90과 정한 인코더의 최대 길이 중 작은 값으로 바꾼다.
- `--rerank-pairs`에는 E3의 `kForFullRecall`과 10을 함께 준다.
- 운영 서버 측정은 `$runs\onnx`를 옮긴 뒤 같은 `latency` 명령으로 한다. 서버 작업이라 따로 승인을 받는다.

### 결과 가져오기

`$runs` 아래의 JSON(`token-stats.json`, `encoder-comparison.json`, `bi-v1-*/metrics.json` · `metadata.json`,
`cross-v1-*/metrics.json` · `metadata.json`, `api-*/summary.json`, `latency-*.json`)만 이 브랜치의
`docs/assets/match-model-eval-2026-11-10/`에 커밋한다. 가중치 · 임베딩 캐시 · ONNX 파일은 올리지 않는다.
가중치를 어디에 둘지는 본 학습 계획 5.4의 결정 사항이다.

## 5. 맥 CPU 지연 (2026-11-10)

학습 전 가중치와 무작위 토큰으로 잰 값이다. 운영 서버가 4 vCPU라 ONNX Runtime 스레드를 4로 묶었다.

장비는 Apple M4 Max(14코어)이고, 운영 서버 Ampere A1과는 CPU가 다르다. 원본은
`docs/assets/match-model-eval-2026-11-10/latency-mac-*.json`에 있다.

| 요청 | 모델 | 입력 | 반복 | fp32 p50 · p95 | INT8 p50 · p95 |
| --- | --- | --- | ---: | --- | --- |
| 프로필 1건 임베딩 | multilingual-e5-base | 512토큰 | 100 | 75 · 106 ms | 64 · 74 ms |
| 스크리닝 | MLP(파일럿 구조) | 공고 368건 | 100 | 0.4 · 0.5 ms | 0.4 · 0.5 ms |
| 재정렬 1쌍 | bge-reranker-v2-m3 | 1,536토큰 | 10 | 1,031 · 1,185 ms | 967 · 1,039 ms |
| 재정렬 10쌍 | bge-reranker-v2-m3 | 1,536토큰 × 10 | 10 | 11.3 · 23.2 s | 9.2 · 9.9 s |
| 기록 20건 채점(모델 B) | bge-reranker-v2-m3 | 1,536토큰 × 20 | 10 | 55.8 · 377.9 s | 27.6 · 73.0 s |

- Cross-Encoder 행은 10회만 반복했다. 그래서 p95는 사실상 10회 중 최댓값이다.
- 기록 20건 fp32의 p95(377.9초)는 20쌍을 한 배치로 넣어 메모리가 모자랐던 회차다. 연산 시간으로 읽지 않는다. 서비스는 쌍을 나눠 넣는다.
- Bi-Encoder 경로(임베딩 + 스크리닝)는 INT8 기준 p95 74ms다.
- Cross-Encoder는 1,536토큰에서 쌍당 약 1초다. 재정렬 10쌍이 INT8로도 p95 9.9초다. 서비스 공고 원문은 중앙값이 1,431토큰이라(본 학습 계획 3.2) 대부분 이 길이까지 찬다.
- 운영 서버는 4 vCPU 공용 장비라 이보다 느릴 가능성이 크다. 유지 판정은 운영 서버 측정과 본 학습 계획 5.4의 기준값으로 한다. 그 전에 입력 길이를 줄이는 비교(기록 단위 입력, 짧은 최대 길이)가 필요하다.
