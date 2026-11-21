---
title: 한국어 공고 적합도 평가 세트
slug: match-model-ko-eval
stage: spec
status: accepted
intent: .intent/intent_match-model-ko-eval.md
date: 2026-11-10
---

# 한국어 공고 적합도 평가 세트 — 명세

## 요구사항

- [ ] 한국어 위주 공고(본문의 한글 글자 수 > 라틴 글자 수)를 `{jobId, title, sourceBoard, jobFamily, descriptionRaw}`로 내보내고 SHA-256을 남긴다.
- [ ] 요건 분해는 서비스의 `AiRequirementExtractor`를 백엔드 dist에서 그대로 부른다. 공고마다 결과 파일로 캐시해 다시 부르지 않는다.
- [ ] 평가 세트 파일 형식은 `fit-v1`과 같다(`profiles.jsonl` · `jobs.jsonl` · `candidate-manifest.jsonl` · `labels/suitability-labels.jsonl`). 그래서 기존 명령이 그대로 읽는다.
- [ ] 직군 대응: 백엔드 · 프론트엔드 · 데이터 · ML · AI · 모바일은 같은 이름이고, DevOps는 인프라 · 플랫폼이다. 기획 · PM · 디자인은 대응하는 공고가 없다. 대응 직군이 없는 프로필은 빼고 수를 남긴다.
- [ ] 후보는 같은 직군 5 · 인접 3 · 무작위 2이고(`llm_suitability_dataset.DEFAULT_QUOTAS`), 인접은 `match_pilot_data.ADJACENT_ROLES`를 따른다. 공고 분할은 공고 ID 해시로 검증 · 평가 반반이다.
- [ ] 교사는 `claude-sonnet-5-5`를 Claude Code CLI로 부른다. `--json-schema`를 쓰지 않는다. JSON 문법 오류는 `{"edits":[{find,replace}]}`, 규칙 위반은 `{"fixes":[{path,value}]}`로 같은 세션에서 고쳐 받는다. 위반 수가 줄어드는 동안 계속한다.
- [ ] 최종 라벨은 `llm_suitability_rubric.validate_labels`를 통과하고 `matchScore`는 루브릭 코드가 계산한다.
- [ ] `encoders` · `train-bi`는 `--eval-data` · `--eval-labels`를 받아 평가 세트로 지표를 낸다. 학습은 `--data`의 학습 분할, 조기 종료는 `--data`의 검증 분할이다.
- [ ] `eval-cross`는 `--cross-scores` 없이 `--cross-checkpoint`만 주면 평가 세트 쌍을 직접 채점한다.
- [ ] 평가 세트에 학습 분할이 없으므로 기준선(코사인 · TF-IDF · BM25)의 점수 보정은 평가 세트의 검증 분할에서 한다.

## 설계

재사용: `llm_suitability_rubric`(루브릭 · `validate_labels` · `_expand_compact_payload`), `llm_suitability_labels`(`_default_command_prefix` · `_session_limit_message`), `match_pilot_data.ADJACENT_ROLES`, `llm_suitability_dataset.DEFAULT_QUOTAS`, `pilot.prepare_cross_encoder_inputs` 흐름, 백엔드 `loadRuntimeConfig` · `createAiClient` · `AiRequirementExtractor`.

새 파일(`scripts/ml-data/`):

- `ko_postings.mjs` — Mongo에서 공고를 읽어 JSONL로 쓰고(`export`), 백엔드 dist의 추출기로 요건을 붙인다(`requirements`).
- `ko_eval_dataset.py` — 원본 프로필 폴더 · `fit-v1` 데이터 · 한국어 공고로 평가 세트 데이터 폴더를 만든다.
- `ko_teacher_labels.py` — Sonnet 교사 러너. 프롬프트는 파일럿 루브릭을 원문 공고용으로 옮긴 것이다(JTH 전용 규칙만 뺀다). 프로필 단위 결과를 캐시하고 이어 돈다.

고치는 파일: `llm_suitability_train.JOB_FIELD_LABELS`에 `title` · `description`을 앞에 추가한다(`fit-v1` 공고에는 두 키가 없어 렌더가 바뀌지 않는다). `match_evaluation.rule_requirements`는 공고에 서비스 요건(`requirements`)이 있으면 그것을 쓴다. `match_experiments.py`에 평가 세트 경로를 연결한다.

## 버린 대안

- **백엔드에 라벨링 계약 추가** — ML 도구 때문에 제품 계약 목록이 바뀐다. CLI 호출 방식만 옮긴다.
- **파일럿 라벨러 재사용** — `--json-schema`와 출력 전체 재시도라 금지된 방식이다.
- **facts(`duties` · `preferred`)로 규칙 입력 구성** — 서비스 일치도는 분해 요건을 쓴다. 다른 입력이면 baseline이 서비스 규칙이 아니다.

## 함정

- E5는 512토큰에서 자른다. 한국어 공고 원문은 중앙값 3,097자라 대부분 잘린다. 이것이 서비스 조건이므로 그대로 잰다.
- `fit-v1` `profiles.jsonl`에는 희망 직무가 없다. 원본 프로필 폴더가 필요하다.
- Claude Code 구독 한도(429 · 세션 한도)에 걸리면 러너는 멈추고, 다시 실행하면 캐시에서 이어 간다.
- 요건 분해 결과가 없거나 실패한 공고는 규칙 점수가 null이다. 그 수를 남긴다.

## 완료 기준

```
pnpm ml:data:test
node scripts/ml-data/ko_postings.mjs export --out var/ml-data/ko-postings/jobs.jsonl   # 맥 로컬 DB
```

가짜 프로필 · 가짜 CLI로 `ko_eval_dataset.py` → `ko_teacher_labels.py` → `train-bi --eval-data` → `eval-cross --cross-checkpoint`가 돌고, 한국어 세트 지표 파일이 생긴다.
