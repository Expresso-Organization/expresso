# 공고 추천 baseline·평가 harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프로필–공고 후보 모델이 lexical 검색 baseline을 유의하게 이기는지 재현 가능하게 판정하는 독립 평가 CLI를 만듭니다.

**Architecture:** 표준 라이브러리만 쓰는 Python 모듈 세 개로 나눕니다. `retrieval_baselines.py`는 입력 공고 전체로 lexical index를 만들고 점수만 반환합니다. `ranking_evaluation.py`는 JSONL 계약·누수·랭킹 지표·bootstrap·gate를 순수 함수로 제공합니다. `evaluate_retrieval.py`가 파일을 읽고 valid에서 hybrid와 strongest baseline을 고정한 뒤 test 결과와 보고서를 기록합니다.

**Tech Stack:** Python 3 표준 라이브러리, `unittest`, pnpm 11 script runner, JSONL

**Spec:** `docs/architecture/retrieval-evaluation-harness.md`

---

### Task 1: lexical baseline 점수기

**Files:**
- Create: `scripts/ml-data/retrieval_baselines_test.py`
- Create: `scripts/ml-data/retrieval_baselines.py`

- [ ] **Step 1: 실패 테스트 작성**

  NFKC·공백 정규화, 관련 공고가 토큰 겹침·word TF-IDF·char TF-IDF·BM25 모두에서 무관 공고보다 높은 점수를 받는 사례, 상수 점수의 0–1 정규화 사례를 작성합니다.

- [ ] **Step 2: 실패 확인**

  Run: `uv run python scripts/ml-data/retrieval_baselines_test.py`

  Expected: FAIL because `retrieval_baselines` does not exist.

- [ ] **Step 3: 최소 구현**

  `normalize_text`, word·char feature extractor, sublinear TF/smooth IDF/L2 cosine index, BM25 index, Jaccard, 후보군 min-max와 hybrid 결합을 구현합니다. 모든 동점 순서는 호출자가 `jobId`로 결정할 수 있도록 점수만 반환합니다.

- [ ] **Step 4: 통과 확인**

  Run: `uv run python scripts/ml-data/retrieval_baselines_test.py`

  Expected: PASS.

### Task 2: 계약·누수·랭킹 지표

**Files:**
- Create: `scripts/ml-data/ranking_evaluation_test.py`
- Create: `scripts/ml-data/ranking_evaluation.py`

- [ ] **Step 1: 지표와 누수 실패 테스트 작성**

  완전한 순위에서 NDCG@10·MAP·Recall@10·MRR@10·AUC·hard-negative accuracy가 1인 사례, `sourceAtomId`와 `duplicateGroupId`가 split을 넘는 사례, 후보 점수가 빠진 사례를 작성합니다.

- [ ] **Step 2: 실패 확인**

  Run: `uv run python scripts/ml-data/ranking_evaluation_test.py`

  Expected: FAIL because `ranking_evaluation` does not exist.

- [ ] **Step 3: 계약과 지표 구현**

  엄격한 JSONL schema validator, ID·쌍 유일성, split 누수, valid/test 점수 완전성, 프로필별 랭킹과 macro 집계를 구현합니다. 정의되지 않는 metric은 `None`으로 두고 macro 분모에서 제외합니다.

- [ ] **Step 4: 통과 확인**

  Run: `uv run python scripts/ml-data/ranking_evaluation_test.py`

  Expected: PASS for contract, leakage, completeness, and metric cases.

### Task 3: bootstrap·gate·전체 평가 조립

**Files:**
- Modify: `scripts/ml-data/ranking_evaluation_test.py`
- Modify: `scripts/ml-data/ranking_evaluation.py`

- [ ] **Step 1: 비교와 gate 실패 테스트 작성**

  seed 42 paired bootstrap의 결정성, 사람 라벨 299쌍의 `insufficient_human_labels`, 낮은 kappa의 `teacher_untrusted`, weakest comparison의 `baseline_not_beaten`, 모든 기준을 만족하는 `passed`를 작성합니다.

- [ ] **Step 2: 실패 확인**

  Run: `uv run python scripts/ml-data/ranking_evaluation_test.py`

  Expected: FAIL on missing bootstrap and gate functions.

- [ ] **Step 3: 비교와 gate 구현**

  프로필 복원 추출 bootstrap, relative improvement, Cohen's kappa, 명시된 우선순위의 gate를 구현합니다. hybrid는 valid teacher NDCG로 가중치를 고르고 strongest baseline도 valid에서만 선택합니다.

- [ ] **Step 4: 통과 확인**

  Run: `uv run python scripts/ml-data/ranking_evaluation_test.py`

  Expected: PASS.

### Task 4: CLI·결과 보고서·root 명령

**Files:**
- Create: `scripts/ml-data/evaluate_retrieval.py`
- Modify: `scripts/ml-data/ranking_evaluation_test.py`
- Modify: `package.json`

- [ ] **Step 1: CLI fixture 실패 테스트 작성**

  임시 profiles/jobs/labels/candidate JSONL을 실행해 `metrics.json`과 `summary.md`가 생기고, 누수 입력은 종료 코드 2를 반환하는 테스트를 추가합니다.

- [ ] **Step 2: 실패 확인**

  Run: `uv run python scripts/ml-data/ranking_evaluation_test.py`

  Expected: FAIL because the CLI does not exist.

- [ ] **Step 3: CLI와 보고서 구현**

  입력 SHA-256, Git commit, UTC 실행 시각, split counts, 모든 baseline·candidate 지표, hybrid 선택값, bootstrap, gate를 `metrics.json`에 씁니다. 동일 결과 객체에서 사람이 읽는 `summary.md`를 생성합니다. 입력·누수 오류만 종료 코드 2로 바꿉니다.

- [ ] **Step 4: root script 연결**

  `ml:data:test`에 두 Python 테스트를 추가하고 `ml:eval`에 평가 CLI를 연결합니다.

- [ ] **Step 5: 전체 검증**

  Run: `pnpm ml:data:test`

  Expected: PASS.

  Run: `pnpm typecheck`

  Expected: PASS.

  Run: `pnpm test`

  Expected: PASS.

- [ ] **Step 6: 커밋과 push**

  ```powershell
  git add scripts/ml-data/retrieval_baselines.py scripts/ml-data/retrieval_baselines_test.py scripts/ml-data/ranking_evaluation.py scripts/ml-data/ranking_evaluation_test.py scripts/ml-data/evaluate_retrieval.py package.json docs/superpowers/plans/2026-09-02-retrieval-evaluation-harness.md
  git commit -m "feat: 공고 추천 baseline 평가 harness 추가"
  git push
  ```
