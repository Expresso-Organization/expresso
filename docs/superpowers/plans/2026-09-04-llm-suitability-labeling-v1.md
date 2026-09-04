# LLM Suitability Labeling v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 합성 프로필 1,000개와 JTH 공고로 10,000개의 Claude Code Sonnet 적합도 라벨을 생성합니다.

**Architecture:** 후보 데이터 구성, 루브릭 프롬프트와 검증, Claude Code 실행과 재개, 최종 품질 감사를 서로 분리합니다. 모든 생성 호출은 도구와 사용자 설정을 끈 Sonnet 구조화 출력으로 실행합니다.

**Tech Stack:** Python 3.12 표준 라이브러리, Claude Code 2.1.260, JSONL, unittest

**Spec:** `docs/architecture/llm-suitability-labeling-v1.md`

## Global Constraints

- 적합도는 합격 확률이 아니라 현재 프로필에 기록된 경력 근거의 공고 부합도입니다.
- 제품과 학습 데이터의 외부 점수는 0~100 정수 `matchScore` 하나입니다.
- 필수요건 불충족에 점수 상한 또는 탈락 규칙을 적용하지 않습니다.
- 기존 `structured-weak-label-v1` 점수를 교사 라벨로 사용하지 않습니다.
- Claude Code는 `--model sonnet --safe-mode --tools "" --disable-slash-commands --no-session-persistence`로 실행합니다.
- profile family와 공고 ID가 train, valid, test를 넘지 않게 합니다.

---

### Task 1: 후보 데이터 구성

**Files:**
- Create: `scripts/ml-data/llm_suitability_dataset.py`
- Test: `scripts/ml-data/llm_suitability_dataset_test.py`

**Interfaces:**
- Consumes: 합성 프로필 run root, JTH `jobs.csv`, 프로필당 후보 quota
- Produces: `build_label_dataset(run_root, jobs_path, output_dir, quotas) -> dict`

- [x] 프로필 1,000개를 읽고 family split과 파일 해시를 검증하는 실패 테스트를 작성합니다.
- [x] 테스트를 실행해 1,000개 계약과 후보 생성 함수 부재로 실패하는지 확인합니다.
- [x] 프로필 텍스트에서 생성 메타데이터와 희망 직무를 제외하고 기록 ID를 보존하는 구현을 작성합니다.
- [x] 동일 직무 5건, 인접 직무 3건, 무작위 2건을 split 안에서 안정적으로 선택합니다.
- [x] `profiles.jsonl`, `jobs.jsonl`, `candidate-manifest.jsonl`, `data-manifest.json`을 쓰고 테스트를 통과시킵니다.

### Task 2: 루브릭과 출력 검증

**Files:**
- Create: `scripts/ml-data/llm_suitability_rubric.py`
- Test: `scripts/ml-data/llm_suitability_rubric_test.py`

**Interfaces:**
- Consumes: 프로필 한 건과 후보 공고 10건
- Produces: `build_prompt(profile, jobs) -> str`, `output_schema(profile_id, jobs) -> dict`, `validate_labels(...) -> list[dict]`

- [x] 5단계 coverage, 세 평가 축, record ID 무결성, 0~100 범위를 검증하는 실패 테스트를 작성합니다.
- [x] 테스트를 실행해 루브릭 모듈 부재로 실패하는지 확인합니다.
- [x] `job-profile-fit-v1` 프롬프트와 JSON Schema를 구현합니다.
- [x] 요구사항 평균, 적용 축 가중 평균, 최종 점수의 반올림 일치를 검증합니다.
- [x] 빈 preferred 축의 비중 재분배와 기록이 없는 프로필을 테스트합니다.

### Task 3: Claude Code Sonnet 실행과 재개

**Files:**
- Create: `scripts/ml-data/llm_suitability_labels.py`
- Test: `scripts/ml-data/llm_suitability_labels_test.py`

**Interfaces:**
- Consumes: Task 1 데이터셋, Task 2 프롬프트와 스키마, Claude Code 실행 파일
- Produces: `suitability-labels.jsonl`, `raw/*.json`, `label-manifest.json`

- [x] 가짜 Claude 실행기를 사용해 성공, 계약 오류, 재시도, 완료 배치 건너뛰기의 실패 테스트를 작성합니다.
- [x] 테스트를 실행해 실행기 부재로 실패하는지 확인합니다.
- [x] 프로필당 후보 10건을 한 호출로 평가하고 구조화 출력을 저장합니다.
- [x] 최대 3회 재시도와 원자적 raw 응답 저장, JSONL 재구축을 구현합니다.
- [x] 모델명, token 사용량, 비용 추정, latency를 manifest에 합산하고 테스트를 통과시킵니다.

### Task 4: 교정 배치와 본 생성

**Files:**
- Create: `var/ml-data/experiments/match-llm-labels-1000-v1/data/*`
- Create: `var/ml-data/experiments/match-llm-labels-1000-v1/labels/*`

**Interfaces:**
- Consumes: Task 1~3 CLI
- Produces: 검증된 10,000쌍 및 품질 감사

- [x] 전체 후보 데이터 10,000쌍을 생성하고 manifest 수치를 확인합니다.
- [x] train, valid, test에서 각 2개 프로필을 Sonnet으로 라벨링합니다.
- [x] 계약 오류, 점수 분포, 근거 record ID, 모델 canonical name을 확인합니다.
- [ ] 교정 배치가 통과하면 남은 프로필을 재개 모드로 생성합니다.
- [ ] 최종 품질 게이트와 전체 Python 및 저장소 테스트를 실행합니다.
