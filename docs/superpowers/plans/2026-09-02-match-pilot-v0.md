# 채용 추천 모델 파일럿 v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** JTH 행동 이력과 30개 Expresso 합성 프로필로 동결 E5+MLP 랭커를 RTX 5080에서 학습하고 기존 기준선과 같은 하네스에서 비교합니다.

**Architecture:** 데이터 계약, Luna teacher 라벨, 동결 encoder/MLP 학습을 독립 모듈로 분리합니다. 실제 데이터와 모델은 무시되는 `var/ml-data/experiments/match-pilot-v0`에 저장하고 코드·테스트·설계만 추적합니다. 상세 계약은 `docs/architecture/match-pilot-v0.md`입니다.

**Tech Stack:** Python 3.12, PyTorch 2.7 CUDA, Transformers, scikit-learn, 기존 표준 라이브러리 평가 harness

---

### Task 1: 데이터 계약과 JTH/Expresso dataset builder

**Files:**
- Create: `scripts/ml-data/match_pilot_data_test.py`
- Create: `scripts/ml-data/match_pilot_data.py`

- [ ] 실패 테스트로 단계 라벨, 안정 분할, 프로필 직렬화, 누수 없는 음성 표집을 고정한다.
- [ ] `uv run python scripts/ml-data/match_pilot_data_test.py`의 실패를 확인한다.
- [ ] JTH pretrain JSONL과 30×20 Expresso 후보 manifest를 생성하는 최소 구현을 추가한다.
- [ ] focused test와 실제 30개 프로필/JTH dry-run을 통과시킨다.

### Task 2: Luna teacher 라벨 계약

**Files:**
- Create: `scripts/ml-data/match_pilot_labels_test.py`
- Create: `scripts/ml-data/match_pilot_labels.py`
- Create: `scripts/ml-data/prompts/match-pilot-teacher-v1.md`

- [ ] 정확히 20개 결과, 유효 label/reason code, 중복·누락 거부 테스트를 먼저 작성한다.
- [ ] 테스트 실패를 확인한 뒤 prompt builder와 strict validator를 구현한다.
- [ ] Luna subagent에 프로필당 한 묶음으로 30회 생성하고 로컬 validator를 통과시킨다.

### Task 3: E5 embedding과 MLP 랭커

**Files:**
- Create: `scripts/ml-data/match_pilot_model_test.py`
- Create: `scripts/ml-data/match_pilot_model.py`

- [ ] feature 결합, 결정적 학습, checkpoint round-trip, candidate score 계약 테스트를 먼저 작성한다.
- [ ] 동결 E5 embedding cache와 JTH pretrain/Expresso fine-tune MLP를 구현한다.
- [ ] 작은 fixture CPU test 후 실제 RTX 5080에서 전체 학습을 완료한다.

### Task 4: 실험 조립과 평가

**Files:**
- Create: `scripts/ml-data/run_match_pilot_test.py`
- Create: `scripts/ml-data/run_match_pilot.py`
- Modify: `package.json`

- [ ] dry-run orchestration 실패 테스트를 먼저 작성한다.
- [ ] 데이터·라벨·embedding·학습·기존 harness를 연결하고 manifest/summary를 기록한다.
- [ ] `pnpm ml:data:test`, `pnpm typecheck`, `pnpm test`를 실행한다.
- [ ] 변경을 커밋하고 `codex/p5-data-collection`에 push한다.

