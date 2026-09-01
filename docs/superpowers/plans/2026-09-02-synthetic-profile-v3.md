# Synthetic Profile v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Luna가 실제 수행 근거만으로 Expresso 합성 프로필을 만들고, 기록 관계와 합성 스킬 평가는 제거하면서 원본 근거 추적은 보존합니다.

**Architecture:** 모델에는 비식별 임시 근거 ID와 버전 고정 프롬프트를 전달합니다. 한 번의 구조화 생성 결과를 Python 조립기가 검증하고 Expresso 객체로 변환하며, 원본 atom ID는 모델 밖의 매핑으로 복원합니다.

**Tech Stack:** Python 3 표준 라이브러리, `unittest`, JSON Schema 문서, Expresso MongoDB seed

**Spec:** `docs/architecture/synthetic-profile-generation-v3.md`

## Global Constraints

- Luna 호출은 프로필당 한 번만 허용합니다.
- `recordLinks`는 항상 빈 배열입니다.
- `skills`는 빈 배열이고 `skillEvidenceBySkillId`는 빈 객체입니다.
- `provenance.recordLineage`는 모든 기록에 대해 유지합니다.
- 기록이 없어도 프로필을 생성하며, 기록 수는 0~6개입니다.
- `recordCoverage`는 검수 메타데이터로만 사용합니다.
- 원본 atom ID와 성별이 드러나는 파일명은 Luna 입력에서 제외합니다.
- 사람 검토 전 자동 재생성을 수행하지 않습니다.

---

### Task 1: v3 초안 계약과 Expresso 조립 규칙

**Files:**
- Create: `scripts/ml-data/synthetic_profile_draft_v3.schema.json`
- Modify: `scripts/ml-data/synthetic_profile_test.py`
- Modify: `scripts/ml-data/synthetic_profile.py`

**Interfaces:**
- Consumes: v3 Luna draft with `status: generated`, 0~6 `records`, and top-level `recordEvidence`
- Produces: Expresso profile with empty relation and skill collections plus `recordLineage`

- [ ] **Step 1: 실패 테스트 작성**

  관계와 스킬이 든 초안을 조립해도 결과의 `recordLinks`와 `skills`가 비어 있고,
  각 기록의 임시 근거 ID가 원본 atom ID로 복원되는 테스트를 작성합니다.

- [ ] **Step 2: 실패 확인**

  Run: `python -m unittest scripts/ml-data/synthetic_profile_test.py -v`

  Expected: FAIL because the current assembler emits record links and generated skills.

- [ ] **Step 3: 최소 구현**

  `assemble_profile`이 관계와 스킬 초안을 소비하지 않게 하고, 명시적으로 빈 컬렉션을
  출력합니다. `evidence_id_map`으로 기록 근거를 원본 atom ID에 복원합니다.

- [ ] **Step 4: 통과 확인**

  Run: `python -m unittest scripts/ml-data/synthetic_profile_test.py -v`

  Expected: PASS

### Task 2: 비식별 Luna 입력과 프롬프트 v3

**Files:**
- Create: `scripts/ml-data/prompts/synthetic-profile-v3.md`
- Modify: `scripts/ml-data/synthetic_profile_test.py`
- Modify: `scripts/ml-data/synthetic_profile.py`

**Interfaces:**
- Consumes: AI Hub evidence atoms and profile manifest
- Produces: sanitized Luna input and model-external evidence mapping

- [ ] **Step 1: 실패 테스트 작성**

  준비된 Luna 입력에 원본 atom ID, ZIP 이름, entry 이름이 없고 `e1`부터 시작하는
  임시 ID만 존재하는지 검증합니다. 별도 provenance mapping에는 양방향 복원에 필요한
  값만 남는지 검증합니다.

- [ ] **Step 2: 실패 확인**

  Run: `python -m unittest scripts/ml-data/synthetic_profile_test.py -v`

  Expected: FAIL because v1 inputs expose source paths and atom IDs.

- [ ] **Step 3: 최소 구현**

  `prepare_generation_inputs`가 모델 입력과 provenance mapping을 분리해 씁니다.
  프롬프트에는 실제 수행·학습만 허용하고 관계·스킬·가정·포부 생성을 금지합니다.

- [ ] **Step 4: 통과 확인**

  Run: `python -m unittest scripts/ml-data/synthetic_profile_test.py -v`

  Expected: PASS

### Task 3: 파일럿 재생성과 검증

**Files:**
- Modify: `var/ml-data/derived/aihub/71592/pilot/luna-v3/inputs/*.json`
- Modify: `var/ml-data/derived/aihub/71592/pilot/luna-v3/provenance/*.json`
- Modify: `var/ml-data/derived/aihub/71592/pilot/luna-v3/drafts/*.json`
- Modify: `var/ml-data/derived/aihub/71592/pilot/luna-v3/profiles/*.json`

**Interfaces:**
- Consumes: 기존 파일럿 manifest와 AI Hub ZIP
- Produces: v3 파일럿 5개와 사람이 검토할 프로필 JSON

- [ ] **Step 1: 입력 5개 준비**

  기존 manifest를 v3 준비 명령에 전달해 sanitized input과 provenance mapping을 생성합니다.

- [ ] **Step 2: Luna 초안 5개 생성**

  각 입력에 같은 `synthetic-profile-v3` 프롬프트를 사용하고 자동 재시도하지 않습니다.

- [ ] **Step 3: 프로필 조립과 파일럿 게이트 실행**

  다섯 프로필에 관계·스킬이 없고 모든 기록에 원본 근거가 있는지 확인합니다.

- [ ] **Step 4: 전체 검증과 커밋**

  Run: `python -m unittest scripts/ml-data/synthetic_profile_test.py -v && pnpm typecheck && pnpm test`

  ```bash
  git add docs/architecture/synthetic-profile-generation-v3.md docs/superpowers/plans/2026-09-02-synthetic-profile-v3.md scripts/ml-data var/ml-data/derived/aihub/71592/pilot/luna-v3
  git commit -m "feat: 근거 기반 합성 프로필 v3 추가"
  git push
  ```
