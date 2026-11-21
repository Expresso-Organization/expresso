---
title: 적합도 모델 인코더 비교 · 평가 · 지연 측정 실험
slug: match-model-eval
stage: plan
status: accepted
intent: .intent/intent_match-model-eval.md
spec: .intent/spec_match-model-eval.md
date: 2026-11-10
---

# 적합도 모델 인코더 비교 · 평가 · 지연 측정 실험 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `scripts/ml-data/match_evaluation.py` (새로) | ROC · 5점 순서 일치율 · Recall@K 곡선 · 기록 정답 · NDCG · 규칙 입력 · 버전 · 메타데이터 |
| `scripts/ml-data/match_evaluation_test.py` (새로) | 위 함수 단위 시험 |
| `scripts/ml-data/rule_baselines.mjs` (새로) | 서비스 규칙 함수 두 개를 JSONL로 호출 |
| `scripts/ml-data/rule_baselines.test.mjs` (새로) | 실제 TS 함수 호출 확인 |
| `scripts/ml-data/match_encoders.py` (새로) | 인코더 표와 sentence-transformers 래퍼 |
| `scripts/ml-data/match_experiments.py` (새로) | `token-stats` · `encoders` · `train-bi` · `eval-cross` |
| `scripts/ml-data/match_experiments_test.py` (새로) | 가짜 인코더 · 가짜 데이터로 명령 끝까지 실행 |
| `scripts/ml-data/match_api_scorer.py` (새로) | Decisions API · Jev 채점기 |
| `scripts/ml-data/match_api_scorer_test.py` (새로) | 가짜 HTTP 응답으로 요청 형식 · 캐시 · 재시도 · 거절 시험 |
| `scripts/ml-data/match_fixture.py` (새로) | 두 실험 시험이 함께 쓰는 작은 데이터 |
| `scripts/ml-data/match_onnx.py` (새로) | `export` · `latency` |
| `scripts/ml-data/match_onnx_test.py` (새로) | 코드로 만든 작은 XLM-R로 내보내기 · 지연 측정 |
| `package.json` | 새 테스트를 `ml:data:test` · `ml:model:test`에 추가 |
| `docs/architecture/match-model-eval-v1.md` (새로) | 실험 설계와 오늘 저녁 실행 절차 |

## 작업 순서

1. `match_evaluation.py`와 시험 — `uv run python match_evaluation_test.py` 통과.
2. `rule_baselines.mjs`와 시험 — contracts를 지은 뒤 `node --test` 통과. 손으로 계산한 일치도와 같다.
3. `match_encoders.py` — 가짜 SentenceTransformer로 prompt · 최대 길이 · OOM 재시도를 시험.
4. `match_experiments.py`와 시험 — 가짜 데이터 10프로필로 `encoders` · `train-bi` · `eval-cross`가 끝까지 돌고 산출물 키가 있다.
5. `match_onnx.py`와 시험 — Python 3.12에서 작은 XLM-R 내보내기 후 ONNX 출력이 torch 출력과 1e-4 안에서 같고, `latency`가 p50 · p95를 낸다.
6. 맥에서 실제 `multilingual-e5-base` · `bge-reranker-v2-m3`로 CPU 지연을 한 번 잰다(학습 전 가중치. 지연은 구조와 길이로 정해진다).
7. `package.json` · 실험 설계 문서 — `pnpm ml:data:test` 전체 통과.
8. 외부 API 채점기와 `eval-cross` 점수 파일 입력 — 가짜 HTTP 응답으로 채점 → `eval-cross`가 모델 A · B 지표와 교사별 지표를 낸다.

## 가장 위험한 단계

4단계. 파일럿 학습 함수를 다른 인코더 벡터로 쓰면서 차원(768 → 1,024)과 캐시 키가 어긋날 수 있다. 가짜 인코더를 1,024차원으로 두고 시험해 잡는다. 깨지면 `match_experiments.py`만 되돌리면 되고 기존 파일럿 경로는 건드리지 않는다.

## 검증

```
cd scripts/ml-data
uv run python match_evaluation_test.py
node --test rule_baselines.test.mjs
uv run --with torch==2.7.0 --with numpy==2.3.2 --with transformers==4.55.4 --with scipy==1.16.1 --with sentence-transformers==5.1.0 python match_experiments_test.py
uv run --python 3.12 --with torch==2.7.0 --with transformers==4.55.4 --with onnx==1.23.2 --with onnxruntime==1.31.0 python match_onnx_test.py
cd ../.. && pnpm ml:data:test
```
