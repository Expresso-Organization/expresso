# 합성 프로필 v4 이중 렌더러 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** YP2021 경력 골격과 AI Hub 서술 제약을 동일하게 입력받아 Qwen3 30B-A3B와 GPT-5.6 Luna가 Expresso 합성 프로필을 생성하고 품질을 비교할 수 있게 합니다.

**Architecture:** 결정적 코드가 기록 수와 사건 골격을 소유하고, 모델은 제목·희소 프로퍼티·노션형 본문만 렌더링합니다. 두 모델은 같은 프롬프트와 JSON Schema를 사용하며, 모델별 초안은 동일한 코드 검증기와 Expresso 조립기를 통과합니다.

**Tech Stack:** Python 3 표준 라이브러리, JSON Schema 계약, Ollama Chat API, Codex Luna 작업자, unittest

**Spec:** `docs/architecture/synthetic-profile-generation-v4.md`

## Global Constraints

- 사용자 기록은 `title`, `properties`, `bodyMd`만 포함합니다.
- 일곱 시스템 카테고리를 모두 포함하되 빈 카테고리를 허용합니다.
- 기록당 프로퍼티는 최대 2개이며 배치 목표는 0개 65%, 1개 30%, 2개 5%입니다.
- YP2021 식별자와 보호·민감 변수는 모델 입력과 출력에 넣지 않습니다.
- 모델은 입력 골격의 사건 수·순서·사실을 바꾸거나 새 사건을 추가하지 않습니다.
- Qwen과 Luna 비교에서는 입력, 프롬프트, 스키마, 생성 후 검증을 동일하게 유지합니다.

---

### Task 1: v4 초안 계약과 검증기

**Files:**
- Create: `scripts/ml-data/synthetic_profile_draft_v4.schema.json`
- Create: `scripts/ml-data/synthetic_profile_v4.py`
- Create: `scripts/ml-data/synthetic_profile_v4_test.py`

**Interfaces:**
- Consumes: 하나의 잠재 프로필 골격 JSON과 모델 초안 JSON
- Produces: `validate_draft(input_payload, draft)`와 `assemble_profile(input_payload, draft, ...)`

- [ ] **Step 1: 실패하는 계약·금지 필드·프로퍼티 예산 테스트 작성**
- [ ] **Step 2: 테스트가 모듈 부재로 실패하는지 확인**
- [ ] **Step 3: 최소 검증기와 Expresso 조립기 구현**
- [ ] **Step 4: 단위 테스트 통과 확인**

### Task 2: v4 렌더링 프롬프트와 파일럿 골격

**Files:**
- Create: `scripts/ml-data/prompts/synthetic-profile-v4.md`
- Create: `var/ml-data/experiments/synthetic-profile-v4-renderer-comparison-v1/inputs/*.json`

**Interfaces:**
- Consumes: 보호 필드를 제거한 사건 골격과 사건별 서술 제약
- Produces: 기록 수 5·9·14개의 동일 모델 입력 세 개

- [ ] **Step 1: 렌더러가 판단할 것과 코드가 결정할 것을 프롬프트에 분리**
- [ ] **Step 2: 같은 사건을 두 모델에 제공하는 파일럿 입력 세 개 생성**
- [ ] **Step 3: 입력에 원본 조사 ID와 금지 변수가 없는지 검사**

### Task 3: Qwen·Luna 병렬 생성

**Files:**
- Create: `var/ml-data/experiments/synthetic-profile-v4-renderer-comparison-v1/drafts/qwen/*.json`
- Create: `var/ml-data/experiments/synthetic-profile-v4-renderer-comparison-v1/drafts/luna/*.json`
- Create: `var/ml-data/experiments/synthetic-profile-v4-renderer-comparison-v1/profiles/{qwen,luna}/*.json`

**Interfaces:**
- Consumes: Task 2의 동일 입력과 v4 스키마·프롬프트
- Produces: 모델별 3개 초안과 검증된 Expresso 프로필

- [ ] **Step 1: Qwen 30B-A3B를 Ollama 구조화 출력으로 실행**
- [ ] **Step 2: Luna 작업자에게 같은 세 입력 전달**
- [ ] **Step 3: 두 결과를 같은 검증기와 조립기로 처리**

### Task 4: 품질 비교와 아키텍처 문서 반영

**Files:**
- Modify: `docs/architecture/synthetic-profile-generation-v4.md`
- Create: `var/ml-data/experiments/synthetic-profile-v4-renderer-comparison-v1/comparison.json`
- Create: `var/ml-data/experiments/synthetic-profile-v4-renderer-comparison-v1/comparison.md`

**Interfaces:**
- Consumes: 모델별 검증 결과와 생성 시간
- Produces: 스키마, 사건 충실도, 중복, 프로퍼티 분포, 본문 길이, 문체 비교

- [ ] **Step 1: 자동 지표를 계산하고 모델별 실패를 기록**
- [ ] **Step 2: 같은 골격의 본문을 나란히 표본 검토**
- [ ] **Step 3: 권장 렌더러와 운영 경계를 문서에 확정**

### Task 5: 검증과 인계

**Files:**
- Test: `scripts/ml-data/synthetic_profile_v4_test.py`

- [ ] **Step 1: v4 단위 테스트와 Python 컴파일 실행**
- [ ] **Step 2: `pnpm typecheck`와 `pnpm test` 실행**
- [ ] **Step 3: 결과 파일 수와 비교 계산을 독립 검산**
- [ ] **Step 4: 변경을 커밋하고 원격 브랜치에 푸시**
