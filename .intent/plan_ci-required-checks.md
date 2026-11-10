---
title: 경로 밖 PR도 필수 검사를 받는 CI
slug: ci-required-checks
stage: plan
status: draft
intent: .intent/intent_ci-required-checks.md
spec: .intent/spec_ci-required-checks.md
date: 2026-11-10
---

# 경로 밖 PR도 필수 검사를 받는 CI — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `.github/workflows/web-ci.yml` | PR `paths` 제거 · `changes` 잡 · `verify` 이름 `웹 검사` · 조건 |
| `.github/workflows/backend-ci.yml` | 같은 변경 · `e2e`도 같은 조건 · 이름 `백엔드 검사` |
| `AGENTS.md` | 필수 검사 이름과 `paths`를 다시 두지 말라는 한 줄 |

## 작업 순서

1. 두 워크플로 수정 — `actionlint` 통과, 감지 셸을 가짜 `gh`로 돌려 문서/백엔드/인프라/모바일 경우 확인
2. PR 생성 → 브랜치 보호 필수 검사를 `웹 검사` · `백엔드 검사`로 교체 → auto-merge
3. 머지 뒤 문서만 바꾼 PR에서 검사가 건너뜀으로 끝나는지 확인

## 가장 위험한 단계

2단계. 보호 규칙 이름과 실제 잡 이름이 어긋나면 모든 PR이 막힌다. 되돌리기: 보호 필수 검사를 `verify`로 되돌리고 이 PR을 revert한다.

## 검증

```
actionlint .github/workflows/web-ci.yml .github/workflows/backend-ci.yml
gh pr checks <PR>
```
