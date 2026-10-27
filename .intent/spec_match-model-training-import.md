---
title: 적합도 모델 학습 파이프라인 main 반영
slug: match-model-training-import
stage: spec
status: accepted
intent: .intent/intent_match-model-training-import.md
date: 2026-10-27
---

# 적합도 모델 학습 파이프라인 main 반영 — 명세

## 요구사항

1. `origin/codex/p5-data-collection`의 커밋 66개를 커밋 단위 그대로 main 이력에 넣는다. 각 커밋의 작성자와 날짜를 보존한다.
2. 충돌은 `.gitignore` 한 곳이다. main의 줄은 모두 남기고, 브랜치가 더한 `__pycache__/` · `.worktree/`를 합친다.
3. `origin/docs/match-model-training-plan`의 2커밋도 같은 방식으로 넣는다.
4. `docs/architecture/match-model-training-v1.md`를 다음과 같이 고친다.
   - 4절 주차 기준: `services/dev-portal/status/scanner/config.json`의 `semester.week2Start`(2026-08-31, 월요일 시작)
     - 10/26–11/1이 10주차다.
     - 15주차가 11/30–12/6이다.
   - 「역할」 줄: 1.3 역할표(PR #110)에 맞춰 학습 데이터 · 라벨 · 학습 · 평가 · AI학습서버 담당을 박민재로 바꾼다.
5. 기존 `pnpm test` · CI 경로에 학습 코드를 넣지 않는다. 학습 테스트는 루트 `ml:*` 스크립트로만 돈다.
6. `codex/match-pilotT01`은 가져오지 않는다. 그 브랜치에만 있는 `bed3248b` · `dd1c5f14`는 p5의 `c7811450` · `4790ae23`과 파일 blob이 같다.

## 설계

- **가져오는 방법:** `git merge --no-ff`를 쓴다.
  - 66커밋의 작성 기록과 `git blame`이 남는다.
  - squash는 버린다. 9월 작업 단위(합성 프로필 v3–v4.5.2, 라벨링 v1)가 커밋 하나로 뭉개지기 때문이다.
  - rebase도 버린다. 9월 날짜의 커밋 해시가 바뀌어, 계획 문서(`aa8cdec0` 등)와 설계서가 가리키는 커밋을 찾을 수 없게 된다.
- **커밋 순서:** 병합 커밋 두 개와 계획 문서 정정 커밋 하나다. 아티팩트 커밋(intent · spec · plan)은 그 앞에 둔다.
- **스캐너:** `paths.AI`에 이미 `scripts/ml-data`가 있다. 머지되면 AI 그룹이 다시 판정된다. 스캐너 설정은 바꾸지 않는다.

## 확인 기준

- 루트 `pnpm ml:data:test`가 종료 코드 0으로 끝난다(`ml:model:test` 포함).
- PR에서 백엔드 CI와 웹 CI가 통과한다.
- 머지 뒤 아래 리포트와 그림 6개가 200으로 열린다.
  - `https://dev.expresso.ai.kr/p5-model-training-results-2026-09-06.html`
- `git log --format=%an origin/main | grep -c MinjaePark`가 66 이상이다.
