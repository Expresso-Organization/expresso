# 적합도 모델 인코더 비교 · 평가 · 지연 측정 실험 v1

작성일 2026-11-10 · 데이터 `fit-v1`(파일럿 10,000쌍) · 대상 설계서 4.4 · 9.2

설계서 9.2 「지표별 측정 현황」의 빈칸 다섯 개를 파일럿 데이터로 채우는 실험이다. 다섯 칸은
인코더 비교, ROC · AUC, 스크리닝 Recall@K, 모델 B NDCG@10, p95 지연이다. 새 교사 라벨링,
합성 프로필 v5, 사람 평가 세트는 이번 실험에 넣지 않는다. 본 학습 계획
([match-model-training-v1.md](./match-model-training-v1.md)) 3장의 선행 작업은 그대로 남는다.

## 1. 실험

| 번호 | 실험 | 명령 | 여는 분할 | 산출물 | 채우는 자리 |
| --- | --- | --- | --- | --- | --- |
| E0 | 데이터 · 가중치 확인 | `Get-FileHash` | — | 해시 일치 여부 | 본 학습 계획 3.7 |
| E1 | 인코더별 토큰 길이 | `match_experiments.py token-stats` | 전체(라벨 미사용) | `token-stats.json` | 본 학습 계획 3.2 |
| E2 | 인코더 4종 비교 | `match_experiments.py encoders` | 검증 | `encoder-comparison.json` | 설계서 4.4 2단계 |
| E3 | Bi-Encoder+MLP 학습 · 평가 | `match_experiments.py train-bi` | 검증 · 평가 | `bi-v1-NNN/` | 9.2 모델 A · ROC · Recall@K |
| E4 | Cross-Encoder · 모델 B 평가 | `match_experiments.py eval-cross` | 검증 · 평가 | `cross-v1-NNN/` | 9.2 모델 A · 모델 B |
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

## 3. 결과를 읽을 때

- **적합 공고가 있는 평가 프로필은 13명이다**(60점 이상 라벨 4.1%). ROC · Recall@K · MAP는 이 13명이 정한다.
- **Recall@K는 낮은 쪽으로 치우친다.** 풀의 공고 대부분은 그 프로필에 라벨이 없고, 부적합으로 센다.
- **규칙 baseline은 언어가 갈린다.** JTH 필드는 영어이고 프로필은 한국어다. 문자열이 그대로 들어 있어야 닿는 규칙 함수는 매우 낮게 나온다. 서비스에서도 영어 요건과 한국어 기록은 같은 이유로 닿지 않는다.
- **순서 일치율이 파일럿 수치와 다르다.** 파일럿 0.8025 · 0.7903은 1점 차이도 셌다. 이번 `pairwiseMinGap5`는 설계서 정의(5점 이상)를 따른다. 파일럿 정의의 값도 `pairwiseAccuracy`에 함께 남는다.
- **지연은 구조와 입력 길이의 값이다.** 무작위 토큰과 학습 전 가중치로 잰다. 같은 구조면 학습한 가중치도 같은 시간이 걸린다. 맥과 운영 서버(aarch64 Ampere 4 vCPU, 공용 장비)는 CPU가 다르다. Cross-Encoder 유지 판정은 운영 서버에서 잰 값으로 한다(본 학습 계획 5.1).

## 4. 오늘 저녁 실행 절차 (학습 PC · PowerShell)

순서대로 친다. 중간에 끊겨도 앞 단계의 결과 파일은 남는다. E2는 인코더 하나가 끝날 때마다
`encoder-comparison.json`을 덮어쓴다.

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

uv venv var\ml-venv --python 3.12
var\ml-venv\Scripts\activate
uv pip install torch==2.7.0 --index-url https://download.pytorch.org/whl/cu128
uv pip install numpy==2.3.2 transformers==4.55.4 scipy==1.16.1 sentence-transformers==5.1.0 onnx==1.23.2 onnxruntime==1.31.0
python -c "import torch; print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0))"
python scripts\ml-data\match_experiments_test.py               # 가짜 인코더로 명령 전체 확인(CPU)
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

### E1 토큰 길이

```powershell
python scripts\ml-data\match_experiments.py token-stats --data $data --labels $labels --output $runs
```

### E2 인코더 비교 (검증 분할)

```powershell
python scripts\ml-data\match_experiments.py encoders --data $data --labels $labels --output $runs --encoders e5 kure bge-m3 qwen3
```

- `e5` 행의 검증 NDCG@10이 파일럿 검증값 0.9406에 가까운지 먼저 본다. sentence-transformers가 같은 mean pooling을 하므로 같은 범위여야 한다.
- 인코더는 검증 NDCG@10이 가장 높은 것으로 정한다(설계서 9.2 주요 지표). 차이가 작으면 시간 · 메모리 · 벡터 용량을 함께 보고 사람이 정한다.

### E3 Bi-Encoder+MLP 학습 · 평가

```powershell
python scripts\ml-data\match_experiments.py train-bi --data $data --labels $labels --output $runs --encoder <E2에서 정한 키>
```

### E4 Cross-Encoder · 모델 B

파일럿 가중치가 있으면 그대로 쓴다.

```powershell
python scripts\ml-data\match_experiments.py eval-cross --data $data --labels $labels --output $runs --encoder <E2에서 정한 키> `
  --cross-scores "$exp\models-llm-v1\cross-encoder\scores.jsonl" `
  --cross-checkpoint "$exp\models-llm-v1\cross-encoder\trainable-state.pt"
```

가중치가 없으면 파일럿 방식으로 다시 학습한 뒤 같은 명령을 친다. `--e5-model-path` · `--cross-model-path`의
기본값은 PC의 Hugging Face 캐시 경로다.

```powershell
python scripts\ml-data\llm_suitability_train.py --data $data --labels $labels --output "$runs\pilot-cross" --mode cross
# 이후 --cross-scores "$runs\pilot-cross\cross-encoder\scores.jsonl" --cross-checkpoint "$runs\pilot-cross\cross-encoder\trainable-state.pt"
```

### E5 ONNX 내보내기 · 지연

```powershell
python scripts\ml-data\match_onnx.py export-mlp --checkpoint "$runs\bi-v1-001\checkpoint.pt" --output "$runs\onnx\mlp"
python scripts\ml-data\match_onnx.py export-encoder --model <E2에서 정한 모델 ID> --output "$runs\onnx\encoder" --quantize
python scripts\ml-data\match_onnx.py export-cross --model BAAI/bge-reranker-v2-m3 --checkpoint "$exp\models-llm-v1\cross-encoder\trainable-state.pt" --output "$runs\onnx\cross" --quantize
python scripts\ml-data\match_onnx.py latency --encoder "$runs\onnx\encoder" --mlp "$runs\onnx\mlp" --cross "$runs\onnx\cross" --threads 4 --quantized --output "$runs\latency-pc-int8.json"
```

- `--profile-tokens`는 E1의 프로필 p90과 정한 인코더의 최대 길이 중 작은 값으로 바꾼다.
- `--rerank-pairs`에는 E3의 `kForFullRecall`과 10을 함께 준다.
- 운영 서버 측정은 `$runs\onnx`를 옮긴 뒤 같은 `latency` 명령으로 한다. 서버 작업이라 따로 승인을 받는다.

### 결과 가져오기

`$runs` 아래의 JSON(`token-stats.json`, `encoder-comparison.json`, `bi-v1-*/metrics.json` · `metadata.json`,
`cross-v1-*/metrics.json` · `metadata.json`, `latency-*.json`)만 이 브랜치의
`docs/assets/match-model-eval-2026-11-10/`에 커밋한다. 가중치 · 임베딩 캐시 · ONNX 파일은 올리지 않는다.
가중치를 어디에 둘지는 본 학습 계획 5.4의 결정 사항이다.

## 5. 맥 CPU 지연 (2026-11-10)

학습 전 가중치와 무작위 토큰으로 잰 값이다. 운영 서버가 4 vCPU라 ONNX Runtime 스레드를 4로 묶었다.

측정 중. 결과는 이 절에 채운다.
