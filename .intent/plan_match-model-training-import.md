---
title: 적합도 모델 학습 파이프라인 main 반영
slug: match-model-training-import
stage: plan
status: accepted
intent: .intent/intent_match-model-training-import.md
spec: .intent/spec_match-model-training-import.md
date: 2026-10-27
---

# 적합도 모델 학습 파이프라인 main 반영 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `scripts/ml-data/**` | p5 병합으로 생긴다. Python · Node 스크립트, 테스트, 프롬프트, 스키마 |
| `docs/architecture/*.md` 7개 · `docs/superpowers/plans/*.md` 5개 | p5 병합 |
| `docs/p5-model-training-results-2026-09-06.html` · `docs/assets/p5-training-results-2026-09-06/*` | p5 병합. 그림 일부는 이미 main에 같은 내용으로 있다 |
| `docs/index.html` · `docs/operations/P5_ML_DATA_COLLECTION_REPORT.md` | p5 병합. 대비 목록에 리포트 카드가 붙는다 |
| `package.json` | p5 병합. `ml:data:test` · `ml:model:test` · `ml:data:collect` · `ml:data:profile` · `ml:eval`. 병합본은 9/4 이후 추가된 테스트 8개(`llm_suitability_*` 6개 · `synthetic_profile_v452_repair` · `job_analysis_local_benchmark`)를 돌리지 않으므로 두 스크립트에 더한다. `llm_suitability_train_test.py`는 torch가 필요해 `ml:model:test`에 둔다 |
| `.gitignore` | 충돌 해소. main 줄 + `__pycache__/` · `.worktree/` |
| `docs/architecture/match-model-training-v1.md` | 계획 브랜치 병합 후 4절 주차와 역할 줄 정정 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. `git merge --no-ff origin/codex/p5-data-collection`을 실행하고 `.gitignore` 충돌을 푼다.
2. `pnpm ml:data:test`를 돌린다. `uv`가 고르는 Python에서 실패하면 원인부터 확인한다. 브랜치가 쓰던 Python 버전을 찾고, 그 근거를 커밋에 남긴다.
3. `git merge --no-ff origin/docs/match-model-training-plan`을 실행한다.
4. 계획 문서의 주차와 역할을 고친다. 주차는 `semester.week2Start`에서 계산한다.
5. `pnpm typecheck` · `pnpm test`를 돌려 기존 경로가 그대로인지 본다. 그다음 푸시하고 PR을 올린다.
6. 머지 뒤에는 개발 포털의 리포트 주소와 다음 스캔의 AI 그룹 판정을 확인한다.
7. 머지 뒤 원격 `codex/p5-data-collection` · `codex/match-pilotT01` · `docs/match-model-training-plan`을 지운다(intent 열린 질문의 답).

## 가장 위험한 단계

2단계다.

- `ml:model:test`는 `torch==2.7.0`과 `transformers==4.55.4`를 내려받는다. 9월에는 Windows · CUDA 장비에서 돌렸다.
- macOS arm64에서 휠이 없거나 테스트가 GPU를 가정하면 실패한다.
- 실패하면 실패한 테스트와 원인을 PR에 그대로 적는다. 병합 자체는 되돌리지 않는다. 코드는 이미 브랜치에서 검증되었고, 이번 변경은 위치만 옮긴다.

## 검증

```
pnpm ml:data:test
pnpm typecheck
pnpm test
```
