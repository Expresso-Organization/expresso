# P5 학습 데이터 수집 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학과 연구 프로젝트 범위에서 여러 채용 데이터셋을 출처별 허용 용도에 맞게 결합해 구조적 합성 프로필, 한국어 커리어 기록, 요건–근거 및 프로필–공고 학습쌍을 재현 가능하게 만들고 RTX 5080 학습기로 인계합니다.

**Architecture:** 기존 `jobs/ingest`가 허용된 공고를 수집하고 MongoDB에 원문을 보존합니다. 별도 학습 데이터 빌더가 원문 스냅샷을 정규 계약으로 내보낸 뒤, 구조적 사실을 먼저 생성하고 한국어 표현과 라벨을 파생합니다. 모든 산출물은 원천·라이선스·허용 용도·생성기·프롬프트·Git 커밋·checksum을 담은 manifest로 봉인합니다. 원천별 shard는 분리하고 실험 단계에서만 조합해, 각 데이터셋을 뺐을 때 성능이 어떻게 변하는지 ablation할 수 있게 합니다.

**Tech Stack:** Node.js 24, pnpm 11, TypeScript 7, Zod 4, MongoDB 7, Vitest 4, JSONL dataset shards, SHA-256 manifests

**Spec:** `C:/Users/parkm/.codex/attachments/a33f09c0-f5dc-483a-9051-2a8e5ef9a495/pasted-text.txt`

## Global Constraints

- 요청·응답과 학습 데이터 계약의 유일한 출처는 `packages/contracts`의 Zod 스키마입니다.
- 공고 원문은 수집 뒤 수정하지 않으며, 변경된 공고는 새 `job_version_id`로 보존합니다.
- 모든 실험·체크포인트·보고서는 `academic-research-only`로 표시하고 상업 서비스 배포와 유료 제공을 범위에서 제외합니다.
- 원천마다 `train`, `evaluation-only`, `structure-only`, `code-only`, `unavailable` 허용 용도를 기록합니다. 공개 열람 또는 API 접근 가능성만으로 번역·변경·학습 권한을 추정하지 않습니다.
- 현재 backend Work24 adapter가 가리키는 공공데이터포털 워크넷 API는 공공저작물 제4유형(상업 이용·변경 금지)이므로 원문을 변경하거나 번역·합성 파생물을 만드는 학습에는 넣지 않습니다. 제공기관 확인 전에는 원문 보존과 분포 확인만 수행합니다.
- JTH는 CC BY-NC 4.0 조건과 출처표시를 지키는 학과 연구에서 학습·평가에 사용할 수 있지만, JTH가 들어간 체크포인트와 파생 데이터의 상업 사용을 금지합니다.
- 국민대–DACON 데이터는 현재 다운로드할 수 없으므로 허가와 원본 아티팩트를 확보하기 전에는 계획의 의존성이 아닙니다.
- Djinni는 논문이 데이터의 MIT 라이선스를 밝히지만 실제 데이터 아티팩트와 전처리 코드의 라이선스를 각각 확인하고 checksum과 함께 기록한 뒤 사용합니다.
- LLM은 구조적 사실을 한국어로 표현하지만 사실, 적합도 구간, 필수 요건 충족 여부를 새로 결정하지 않습니다.
- `profile_family_id`, 회사, 동일 공고의 모든 버전은 train/valid/test 중 하나에만 들어갑니다.
- 데이터셋 v0 파일럿은 `ML · AI` 직무군의 중복 제거 공고 500건을 목표로 하며, Djinni·JTH·허용된 한국 공고를 source shard로 분리합니다. 수집 경로가 검증된 뒤 20,000~50,000건으로 확장합니다.
- 초기 5080 인계 게이트는 구조적 프로필 500개, 한국어 기록 2,000건 이상, 요건–근거 쌍 10,000건 이상, 사람 검토 평가 사례 100건 이상입니다.

---

## 원천 사용 결정

| 원천 | v0 역할 | 허용 용도 | 실행 조건 |
| --- | --- | --- | --- |
| 공공데이터포털 워크넷 API | 한국 공고 원문·분포 확인 | structure-only | 제4유형의 변경 금지를 지키고 파생 학습은 별도 확인 |
| 고용24 직접 OPEN API | 한국 공고 원문 후보 | unavailable | 기업회원 심사와 연구 학습·파생 허용 확인 뒤 재분류 |
| 파트너·기업 ATS | 한국 공고 원문 후보 | unavailable | 연구 학습·보관·파생 조건 확인 뒤 재분류 |
| NCS·KECO | 직무·능력·코드 뼈대 | structure-only | 배포·가공 조건과 버전 기록 |
| Djinni | 경력 구조 통계와 프로필·공고 텍스트 | train | 실제 아티팩트 라이선스와 checksum 확인 뒤 사용 |
| JTH | 콜드스타트·시간 분할·채용 단계 | train/evaluation | CC BY-NC 4.0과 출처표시, 상업 사용 금지 |
| 국민대–DACON | 한국 지원 이력 검증 후보 | unavailable | 합법적으로 원본을 확보할 때만 추가 |
| ConFit v2 | HYRE·runner-up hard negative 구현 참고 | code-only | MIT 코드 재사용 고지, 원본 데이터 별도 판정 |

### Task 1: 학습 데이터 계약과 원천 allowlist

**Files:**
- Create: `packages/contracts/src/ml-data.ts`
- Create: `packages/contracts/src/ml-data.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `docs/architecture/ml-data-sources.md`

**Interfaces:**
- Consumes: 기존 `JobSourceSpanSchema`, `JobRequirementAxisSchema`, `JobSourceProviderSchema`
- Produces: `MlSourceLicenseSchema`, `MlJobVersionSchema`, `MlConceptSchema`, `MlLatentProfileSchema`, `MlCareerRecordSchema`, `MlTrainingPairSchema`, `MlDatasetManifestSchema`

- [ ] **Step 1: 계약 실패 테스트 작성**

  `ml-data.test.ts`에 다음 불변식을 검증합니다: `evaluation-only`, `structure-only`, `code-only`, `unavailable` 원천이 train split에 들어가면 실패, 문장 `factIds`가 빈 배열이면 실패, `jobVersionId`와 원문 checksum이 없으면 실패, 반사실 샘플은 `profileFamilyId`와 변경한 단일 `deltaField`를 요구합니다.

- [ ] **Step 2: 실패 확인**

  Run: `pnpm --filter @expresso/contracts test -- ml-data.test.ts`

  Expected: FAIL because `./ml-data.js` and its schemas do not exist.

- [ ] **Step 3: 최소 Zod 계약 구현**

  원천 계약에는 `sourceId`, `artifactId`, `allowedUses: ("train" | "evaluation-only" | "structure-only" | "code-only" | "unavailable")[]`, `licenseId`, `termsUrl`, `reviewedAt`, `checksum`을 둡니다. 학습쌍에는 `task: "requirement_evidence" | "profile_job_rank"`, 입력 ID, label, provenance를 둡니다. manifest에는 `academic-research-only`, schema/data/generator/prompt/git 버전과 모든 shard checksum을 둡니다.

- [ ] **Step 4: 계약과 기존 전체 테스트 통과 확인**

  Run: `pnpm --filter @expresso/contracts test && pnpm --filter @expresso/contracts typecheck`

  Expected: PASS.

- [ ] **Step 5: 원천 판정 문서 작성**

  `ml-data-sources.md`에 원천별 사용 목적, 금지 용도, 확인한 URL, 승인 증빙 위치, 재검토 날짜를 기록합니다. 고용24 직접 API는 확인 전 `unavailable`, Work24·NCS·KECO는 `structure-only`, JTH·Djinni는 조건 확인 뒤 `train`, DACON은 `unavailable`로 시작합니다.

- [ ] **Step 6: 커밋**

  ```bash
  git add packages/contracts/src/ml-data.ts packages/contracts/src/ml-data.test.ts packages/contracts/src/index.ts docs/architecture/ml-data-sources.md
  git commit -m "feat: ML 학습 데이터 계약과 원천 등급 추가"
  ```

### Task 2: 허용된 한국 공고 수집 파일럿과 불변 공고 버전

**Files:**
- Modify: `services/backend/src/modules/jobs/ingest/work24.ts`
- Create: `services/backend/src/modules/jobs/ingest/work24.test.ts`
- Modify: `services/backend/src/modules/jobs/ingest/service.ts`
- Modify: `services/backend/src/modules/jobs/ingest/ingest.integration.test.ts`
- Modify: `packages/database/src/documents/jobs.ts`
- Modify: `packages/database/src/collections.ts`
- Create: `packages/database/src/mongodb-migrations/0005/migration.ts`

**Interfaces:**
- Consumes: 연구 학습 또는 구조 분석이 허용된 `JobSourceAdapter`, 기존 `RawPosting`, `JobPostingDoc`
- Produces: `JobPostingVersionDoc`, 공고별 불변 원문 버전과 checksum, license artifact가 없는 수집을 막는 gate

- [ ] **Step 1: 원천 허가 gate 실패 테스트 작성**

  `allowedUses`에 `train` 또는 `structure-only`가 없거나 증빙 checksum이 없는 source는 collection을 시작하지 못하고, 수집 목적이 원천의 허용 용도를 넘으면 실패하는지 검증합니다.

- [ ] **Step 2: 실패 확인**

  Run: `pnpm --filter @expresso/backend test -- work24.test.ts`

  Expected: FAIL because source license metadata is not enforced.

- [ ] **Step 3: 원천 허가 gate와 호출 보호 구현**

  collection 입력에 `licenseArtifactId`와 `intendedUse`를 요구하고, 허용 용도를 넘는 source를 실행 전에 거절합니다. 승인된 adapter에는 요청 간격·최대 페이지·AbortSignal을 적용하고 인증키와 응답 본문을 로그에 남기지 않습니다. Work24 원문은 `structure-only` shard에만 저장하고 번역·파생 학습 shard에서 제외합니다.

- [ ] **Step 4: 공고 버전 저장 실패 테스트 작성**

  같은 `externalId`의 원문 checksum이 같으면 버전을 추가하지 않고, checksum이 달라지면 새 `job_posting_versions` 문서를 만들며 기존 버전은 유지하는 통합 테스트를 추가합니다.

- [ ] **Step 5: MongoDB 타입·컬렉션·마이그레이션 구현**

  `JobPostingVersionDoc`에 `_id`, `jobPostingId`, `externalId`, `descriptionRaw`, `sourceUrl`, `sourceBoard`, `collectedAt`, `validFrom`, `contentHash`, `licenseArtifactId`를 둡니다. `(jobPostingId, contentHash)` 고유 인덱스와 `collectedAt` 인덱스를 추가합니다.

- [ ] **Step 6: 파일럿 수집 검증**

  Run: `pnpm --filter @expresso/backend test -- work24.test.ts ingest.integration.test.ts`

  Expected: unit tests PASS; integration tests PASS when `TEST_MONGODB_URL` is set.

- [ ] **Step 7: 커밋**

  ```bash
  git add services/backend/src/modules/jobs/ingest packages/database/src/documents/jobs.ts packages/database/src/collections.ts packages/database/src/mongodb-migrations/0005
  git commit -m "feat: 허용된 공고 수집과 원문 버전 보존"
  ```

### Task 3: 공고·요건 학습 스냅샷 내보내기

**Files:**
- Create: `services/backend/src/modules/jobs/training-export.ts`
- Create: `services/backend/src/modules/jobs/training-export.test.ts`
- Create: `services/backend/scripts/export-ml-jobs.ts`
- Modify: `services/backend/package.json`

**Interfaces:**
- Consumes: `job_posting_versions`, `job_posting_requirements`, `MlJobVersionSchema`
- Produces: `jobs.jsonl`, `requirements.jsonl`, `source-licenses.jsonl`, `manifest.json`

- [ ] **Step 1: 결정적 export 실패 테스트 작성**

  입력 순서와 무관하게 ID 순으로 정렬되고, 같은 MongoDB fixture를 두 번 export하면 파일 checksum이 동일한지 검증합니다. 원천의 `allowedUses`와 맞지 않는 train/evaluation/structure export는 실패해야 합니다.

- [ ] **Step 2: 실패 확인**

  Run: `pnpm --filter @expresso/backend test -- training-export.test.ts`

  Expected: FAIL because the exporter does not exist.

- [ ] **Step 3: streaming JSONL exporter 구현**

  `exportMlJobs(context, outputDir, { family: "ML · AI", intendedUse: "train" })`를 구현합니다. 임시 파일에 쓴 뒤 checksum 검증 후 rename하고, manifest에는 source shard, query 조건과 행 수를 기록합니다.

- [ ] **Step 4: CLI와 root script 연결**

  `services/backend/package.json`에 `ml:data:export-jobs`를 추가합니다. CLI는 출력 디렉터리, 직무군, 기준 시각을 인자로 받고 비밀 값과 MongoDB URL을 manifest에 쓰지 않습니다.

- [ ] **Step 5: 검증**

  Run: `pnpm --filter @expresso/backend test -- training-export.test.ts && pnpm --filter @expresso/backend typecheck`

  Expected: PASS.

- [ ] **Step 6: 커밋**

  ```bash
  git add services/backend/src/modules/jobs/training-export.ts services/backend/src/modules/jobs/training-export.test.ts services/backend/scripts/export-ml-jobs.ts services/backend/package.json
  git commit -m "feat: 학습용 공고 스냅샷 내보내기"
  ```

### Task 4: 직무·기술 개념 사전과 정규화

**Files:**
- Create: `services/backend/src/modules/jobs/ml-concepts.ts`
- Create: `services/backend/src/modules/jobs/ml-concepts.test.ts`
- Create: `services/backend/assets/ml-concepts/aliases.ko.json`
- Create: `services/backend/scripts/build-ml-concepts.ts`

**Interfaces:**
- Consumes: 승인된 NCS·KECO 스냅샷과 `requirements.jsonl`
- Produces: `concepts.jsonl`, `requirement-concepts.jsonl`, concept coverage report

- [ ] **Step 1: 정규화 실패 테스트 작성**

  `Vector DB`, `벡터 데이터베이스`, `Qdrant`가 각각 canonical concept 또는 product concept에 연결되고, 원문에 없는 별칭을 임의로 추가하지 않으며, 다의어는 자동 확정하지 않는 사례를 작성합니다.

- [ ] **Step 2: 실패 확인**

  Run: `pnpm --filter @expresso/backend test -- ml-concepts.test.ts`

  Expected: FAIL because the concept normalizer does not exist.

- [ ] **Step 3: 결정적 alias normalizer 구현**

  NFKC·대소문자·공백 정규화 뒤 승인된 alias만 매핑합니다. 매핑 결과에는 `matchedSpan`, `conceptId`, `mappingRuleVersion`, `confidence: "exact" | "alias" | "review"`를 남깁니다.

- [ ] **Step 4: 품질 보고서 구현**

  직무군별 요건 수, concept 매핑률, 미매핑 상위 표현, review 비율을 JSON으로 출력합니다. v0 게이트는 `ML · AI` 필수 요건의 exact+alias 매핑률 80% 이상입니다.

- [ ] **Step 5: 검증과 커밋**

  Run: `pnpm --filter @expresso/backend test -- ml-concepts.test.ts`

  ```bash
  git add services/backend/src/modules/jobs/ml-concepts.ts services/backend/src/modules/jobs/ml-concepts.test.ts services/backend/assets/ml-concepts services/backend/scripts/build-ml-concepts.ts
  git commit -m "feat: ML 직무 기술 개념 정규화 추가"
  ```

### Task 5: 잠재 프로필과 반사실 family 생성

**Files:**
- Create: `services/backend/src/modules/jobs/ml-profile-generator.ts`
- Create: `services/backend/src/modules/jobs/ml-profile-generator.test.ts`
- Create: `services/backend/scripts/generate-ml-profiles.ts`

**Interfaces:**
- Consumes: `concepts.jsonl`, 한국 공고 분포, 승인된 Djinni 집계 통계
- Produces: `latent-profiles.jsonl`, `profile-families.jsonl`, distribution report

- [ ] **Step 1: 생성기 불변식 테스트 작성**

  같은 seed는 같은 프로필을 만들고, 경력 구간이 모순되지 않으며, 기술 사용 기간이 해당 경력 기간을 넘지 않고, 반사실 sibling은 정확히 하나의 필드만 바뀌는지 검증합니다.

- [ ] **Step 2: 실패 확인**

  Run: `pnpm --filter @expresso/backend test -- ml-profile-generator.test.ts`

  Expected: FAIL because the generator does not exist.

- [ ] **Step 3: 구조적 생성기 구현**

  직무, 연차, 경력 사건, 역할, 기술 깊이·최근성, 지역·근무 선호를 먼저 생성합니다. Djinni 원문을 번역하지 않고 승인된 집계 분포만 sampler parameter로 사용합니다.

- [ ] **Step 4: 반사실 생성기 구현**

  `minimumYears`, `criticalSkill`, `roleDepth`, `location`, `workType` 중 하나만 바꾼 sibling을 생성하고 `deltaField`, before/after 값을 기록합니다.

- [ ] **Step 5: 분포 게이트 검증**

  생성 분포와 한국 공고 요구 분포의 직무·연차·기술 빈도를 비교합니다. 한 source dataset의 분포를 그대로 복제하지 않았는지 source contribution을 함께 출력합니다.

- [ ] **Step 6: 커밋**

  ```bash
  git add services/backend/src/modules/jobs/ml-profile-generator.ts services/backend/src/modules/jobs/ml-profile-generator.test.ts services/backend/scripts/generate-ml-profiles.ts
  git commit -m "feat: 구조적 합성 프로필과 반사실 생성기 추가"
  ```

### Task 6: 한국어 기록 렌더링과 fact provenance

**Files:**
- Create: `services/backend/src/modules/jobs/ml-record-renderer.ts`
- Create: `services/backend/src/modules/jobs/ml-record-renderer.test.ts`
- Create: `services/backend/scripts/render-ml-records.ts`
- Create: `services/backend/fixtures/ai/ml-record-renderer-v1.json`

**Interfaces:**
- Consumes: `MlLatentProfileSchema`, 기존 platform AI client
- Produces: `career-records.ko.jsonl`, sentence→fact span links, rejected sample report

- [ ] **Step 1: 렌더링 검증 실패 테스트 작성**

  출력 문장마다 `factIds`가 존재하고, 입력에 없는 기술·수치·기간을 포함하면 거절하며, 동일 seed/profile/prompt version은 동일 fixture를 읽는지 검증합니다.

- [ ] **Step 2: 실패 확인**

  Run: `pnpm --filter @expresso/backend test -- ml-record-renderer.test.ts`

  Expected: FAIL because the renderer does not exist.

- [ ] **Step 3: 구조화 출력 렌더러 구현**

  LLM에는 허용 fact 목록과 출력 Zod schema를 전달합니다. 반환된 각 문장을 입력 fact와 concept allowlist에 대조하고, 검증 실패 샘플은 학습 shard에 넣지 않고 reason code와 함께 격리합니다.

- [ ] **Step 4: 규칙 기반 fallback 구현**

  AI가 꺼져 있어도 프로젝트 불릿 형식의 결정적 renderer로 작은 데이터셋을 만들 수 있게 합니다. AI 렌더링과 fallback은 서로 다른 `generatorId`를 사용합니다.

- [ ] **Step 5: 검증과 커밋**

  Run: `pnpm --filter @expresso/backend test -- ml-record-renderer.test.ts && pnpm --filter @expresso/backend typecheck`

  ```bash
  git add services/backend/src/modules/jobs/ml-record-renderer.ts services/backend/src/modules/jobs/ml-record-renderer.test.ts services/backend/scripts/render-ml-records.ts services/backend/fixtures/ai/ml-record-renderer-v1.json
  git commit -m "feat: 사실 추적 한국어 커리어 기록 렌더러 추가"
  ```

### Task 7: 적합도·요건 근거·hard negative 라벨

**Files:**
- Create: `services/backend/src/modules/jobs/ml-labeler.ts`
- Create: `services/backend/src/modules/jobs/ml-labeler.test.ts`
- Create: `services/backend/scripts/build-ml-training-pairs.ts`

**Interfaces:**
- Consumes: 공고 요건, concept mapping, latent profiles, rendered records
- Produces: `requirement-evidence-pairs.jsonl`, `profile-job-pairs.jsonl`, `hard-negatives.jsonl`

- [ ] **Step 1: BaseFit·coverage 실패 테스트 작성**

  필수 기술·최소 연차·직무·명시적 선호를 분리해 계산하고, critical missing이 strong을 만들 수 없으며, `covered`와 `partial`에는 원문 문장 ID가 반드시 연결되는 사례를 작성합니다.

- [ ] **Step 2: 실패 확인**

  Run: `pnpm --filter @expresso/backend test -- ml-labeler.test.ts`

  Expected: FAIL because the labeler does not exist.

- [ ] **Step 3: 결정적 라벨러 구현**

  `Strong | Partial | Weak | Negative` 밴드와 `covered | partial | missing | unknown` 요건 상태를 구조적 사실로 계산합니다. LLM 교사 출력은 별도 `teacherScore`로만 저장하고 결정적 제약을 덮지 못하게 합니다.

- [ ] **Step 4: hard negative 구성 구현**

  각 positive에 같은 직무 반사실 3개, 인접 직무 3개, random negative 2개를 우선 구성합니다. 동일 profile family sibling이 split 경계를 넘지 않게 합니다.

- [ ] **Step 5: 누수 검사 구현**

  회사, canonical job, job version, profile family, 원문 checksum의 split 교차를 0건으로 강제합니다. 위반 시 dataset manifest를 만들지 않습니다.

- [ ] **Step 6: 검증과 커밋**

  Run: `pnpm --filter @expresso/backend test -- ml-labeler.test.ts`

  ```bash
  git add services/backend/src/modules/jobs/ml-labeler.ts services/backend/src/modules/jobs/ml-labeler.test.ts services/backend/scripts/build-ml-training-pairs.ts
  git commit -m "feat: 적합도 근거와 하드 네거티브 라벨 생성"
  ```

### Task 8: dataset v0.1 봉인과 RTX 5080 인계

**Files:**
- Create: `services/backend/src/modules/jobs/ml-dataset-manifest.ts`
- Create: `services/backend/src/modules/jobs/ml-dataset-manifest.test.ts`
- Create: `services/backend/scripts/seal-ml-dataset.ts`
- Create: `docs/operations/ML_DATASET_RELEASE.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: 모든 JSONL shard와 품질 보고서
- Produces: immutable `dataset-v0.1` directory, `manifest.json`, `checksums.sha256`, 5080 handoff command

- [ ] **Step 1: manifest 실패 테스트 작성**

  행 수·checksum·schema version이 실제 shard와 다르면 봉인을 거부하고, source shard의 `allowedUses`가 manifest의 용도와 어긋나면 실패하는 테스트를 작성합니다.

- [ ] **Step 2: 실패 확인**

  Run: `pnpm --filter @expresso/backend test -- ml-dataset-manifest.test.ts`

  Expected: FAIL because the sealer does not exist.

- [ ] **Step 3: dataset sealer 구현**

  임시 디렉터리에서 계약 검증, 행 수, split 누수, reject rate, source mix, checksum을 검사하고 모두 통과할 때만 `dataset-v0.1`로 원자적으로 rename합니다.

- [ ] **Step 4: 5080 인계 게이트 구현**

  다음을 모두 요구합니다: 공고 500건, 프로필 500개, 기록 2,000건, 요건–근거 쌍 10,000건, 사람 검토 100건, hard negative 비율 30~50%, split 누수 0건, 용도 미확인 shard 0건. 충족하지 못한 항목은 정확한 현재 수량과 함께 실패합니다.

- [ ] **Step 5: 운영 절차와 root 명령 추가**

  `ML_DATASET_RELEASE.md`에 원천 승인, 파일럿 수집, 생성, 봉인, 5080 복사, checksum 재검증, 회수 절차를 적습니다. root `package.json`에는 `ml:data:export`, `ml:data:build`, `ml:data:seal`을 추가합니다.

- [ ] **Step 6: 전체 검증**

  Run: `pnpm typecheck && pnpm test && pnpm test:infra`

  Expected: all commands PASS. 인프라가 준비되지 않았다면 `pnpm infra:up` 후 다시 실행합니다.

- [ ] **Step 7: 커밋**

  ```bash
  git add services/backend/src/modules/jobs/ml-dataset-manifest.ts services/backend/src/modules/jobs/ml-dataset-manifest.test.ts services/backend/scripts/seal-ml-dataset.ts docs/operations/ML_DATASET_RELEASE.md package.json
  git commit -m "feat: ML 데이터셋 봉인과 5080 인계 게이트 추가"
  ```

## 단계별 착수 순서와 중단 기준

1. **용도 게이트:** 각 원천의 라이선스와 접근 조건을 확인해 `train`, `evaluation-only`, `structure-only`, `code-only`, `unavailable`로 분류한 뒤 외부 수집을 시작합니다. Work24처럼 변경 금지가 있는 원천은 다른 train shard와 합치지 않습니다.
2. **500건 파일럿:** Task 1~4만 수행해 실제 공고 500건과 요건 정규화 품질을 검증합니다.
3. **합성 파일럿:** Task 5~7로 프로필 100개를 먼저 생성합니다. 사실 위반 reject rate가 5%를 넘으면 규모를 늘리지 않습니다.
4. **5080 조기 시작:** 요건–근거 쌍 10,000건과 평가 사례 100건이 봉인되면 전체 2만~5만 공고 수집 완료를 기다리지 않고 frozen encoder benchmark를 시작합니다.
5. **규모 확장:** 첫 모델의 오류를 hard negative와 분포 sampler에 반영한 뒤 공고 20,000~50,000건, 프로필 5,000~10,000개로 확장합니다.

## Linear 연결

| 실행 Task | Linear 이슈 |
| --- | --- |
| Task 1 | T14.1.1, T14.1.2, T14.1.4 |
| Task 2~3 | T14.2.1, T14.2.2 |
| Task 4 | T14.2.3, T14.2.4 |
| Task 5 | T14.3.1~T14.3.4 |
| Task 6 | T14.4.1~T14.4.4 |
| Task 7 | T14.5.1~T14.5.3 |
| Task 8 | T14.7.3, T14.12.3 |

## 확인한 원천

- [공공데이터포털 워크넷 채용정보 API](https://www.data.go.kr/data/3038225/openapi.do): 무료, 공공저작물 제4유형, 상업 이용·변경 금지
- [고용24 OPEN API 소개](https://www.work24.go.kr/cm/e/a/0110/selectOpenApiIntro.do): 기업회원 인증키 신청과 담당자 심사 필요
- [Djinni Recruitment Dataset 논문](https://aclanthology.org/2024.unlp-1.2/): 15만여 공고와 23만여 후보자, 논문상 MIT 라이선스
- [Djinni 전처리 저장소](https://github.com/Stereotypes-in-LLMs/recruitment-dataset): Apache 2.0 코드와 데이터 경로 제공
- [JTH 공식 저장소](https://github.com/Aunsiels/JTH): CC BY-NC 4.0, 비상업 연구·교육 전용
- [국민대–DACON 데이터 안내](https://dacon.io/competitions/official/236170/data): 라이선스 사유로 대회 종료 뒤 다운로드 불가
- [ConFit v2 공식 구현](https://github.com/jasonyux/ConFit-v2): MIT 코드, HYRE와 runner-up hard-negative mining 절차
