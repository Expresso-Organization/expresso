---
title: 한국어 공고 적합도 평가 세트
slug: match-model-ko-eval
stage: plan
status: accepted
intent: .intent/intent_match-model-ko-eval.md
spec: .intent/spec_match-model-ko-eval.md
date: 2026-11-10
---

# 한국어 공고 적합도 평가 세트 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `scripts/ml-data/ko_postings.mjs` (새로) | 한국어 공고 내보내기 · 서비스 추출기로 요건 분해 |
| `scripts/ml-data/ko_postings.test.mjs` (새로) | 한국어 판정 · 행 변환 시험 |
| `scripts/ml-data/ko_eval_dataset.py` (새로) | 직군 대응 · 후보 구성 · 분할 · fit-v1 형식 쓰기 |
| `scripts/ml-data/ko_teacher_labels.py` (새로) | Sonnet 교사 러너(같은 세션 고침) |
| `scripts/ml-data/ko_eval_test.py` (새로) | 후보 구성 · 러너 고침 흐름 · 끝까지 실행 시험 |
| `scripts/ml-data/llm_suitability_train.py` | `JOB_FIELD_LABELS`에 제목 · 원문 추가 |
| `scripts/ml-data/match_evaluation.py` | 규칙 입력에 서비스 요건 우선 |
| `scripts/ml-data/match_experiments.py` | `--eval-data` · `--eval-labels`, 검증 분할 보정, Cross-Encoder 직접 채점 |
| `scripts/ml-data/match_experiments_test.py` | 평가 세트 경로 시험 |
| `package.json` | 새 시험 연결 |
| `docs/architecture/match-model-eval-v1.md` | 한국어 세트 절과 실행 절차 |

## 작업 순서

1. `ko_postings.mjs` export — 맥 로컬 DB에서 한국어 공고 수가 295건 근처로 나온다.
2. `ko_postings.mjs requirements` — 공고 2건으로 실제 추출기를 돌려 요건이 붙는다. 나머지는 백그라운드로 돌린다.
3. `ko_eval_dataset.py` · 시험 — 가짜 프로필로 1인당 10쌍, 분할 겹침 0건.
4. `ko_teacher_labels.py` · 시험 — 가짜 CLI가 첫 응답에 문법 오류 · 규칙 위반을 내고 `--resume`으로 고친 뒤 `validate_labels`를 통과한다.
5. `match_experiments.py` 평가 세트 연결 · 시험 — `train-bi --eval-data`와 `eval-cross --cross-checkpoint`가 평가 세트 지표를 쓴다.
6. 문서 · `package.json` — `pnpm ml:data:test` 통과.

## 가장 위험한 단계

5단계. 학습 데이터와 평가 데이터가 다른 임베딩 캐시 · 인덱스를 쓴다. 섞이면 다른 공고 벡터로 채점한다. 캐시 경로에 데이터 해시를 넣고, 시험에서 평가 세트 쌍 수가 맞는지 본다. 깨지면 `--eval-data` 분기만 되돌린다.

## 검증

```
cd scripts/ml-data
node --test ko_postings.test.mjs
uv run --with torch==2.7.0 --with numpy==2.3.2 --with transformers==4.55.4 --with scipy==1.16.1 --with sentence-transformers==5.1.0 python ko_eval_test.py
cd ../.. && pnpm ml:data:test
```
