---
title: main 필수 검사와 CI 검사 이름 맞춤
slug: required-check-names
stage: plan
status: draft
intent: .intent/intent_required-check-names.md
spec: .intent/spec_required-check-names.md
date: 2026-11-10
---

# main 필수 검사와 CI 검사 이름 맞춤 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `.github/workflows/web-ci.yml` | PR 경로 필터 제거, `changes` 작업, `verify` 이름 「웹 검사」 |
| `.github/workflows/backend-ci.yml` | PR 경로 필터 제거, `changes` 작업, `verify` 이름 「백엔드 검사」, `e2e` 조건 |

## 작업 순서

1. 두 워크플로 수정 — YAML 문법 확인
2. PR을 열어 두 검사 이름과 머지 가능 상태 확인 후 머지
3. PR #191을 `main`으로 갱신, 검사 결과 확인 후 머지

## 가장 위험한 단계

2단계. 바뀐 파일 목록 조회가 실패하면 `changes` 작업이 실패해 모든 PR이 막힌다. 이 PR 자체가 그 경로를 지나므로 머지 전에 드러난다. 되돌리기는 이 커밋 되돌림이다.

## 검증

```
python3 -c "import yaml,sys;[yaml.safe_load(open(f)) for f in sys.argv[1:]]" .github/workflows/web-ci.yml .github/workflows/backend-ci.yml
gh pr checks <이 PR>
gh pr view <이 PR> --json mergeStateStatus
```
