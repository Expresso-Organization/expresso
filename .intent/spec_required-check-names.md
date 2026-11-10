---
title: main 필수 검사와 CI 검사 이름 맞춤
slug: required-check-names
stage: spec
status: draft
intent: .intent/intent_required-check-names.md
date: 2026-11-10
---

# main 필수 검사와 CI 검사 이름 맞춤 — 명세

## 요구사항

- [ ] `web-ci.yml` · `backend-ci.yml`의 `pull_request` 트리거에서 `paths`를 걷는다. `push` · `workflow_dispatch`는 그대로.
- [ ] 각 워크플로에 `changes` 작업(이름 「변경 범위」)을 둔다. PR이면 GitHub API로 바뀐 파일 목록을 받아 워크플로마다 정한 경로 정규식과 맞춰 `relevant`를 낸다. PR이 아니면 늘 `true`.
- [ ] 웹 `verify`는 `name: 웹 검사`, 백엔드 `verify`는 `name: 백엔드 검사`. 둘 다 `needs: changes`, `if: needs.changes.outputs.relevant == 'true'`. 백엔드 `e2e`도 같은 조건.
- [ ] 경로 정규식은 지금의 `paths` 목록과 같은 범위다.

## 설계

GitHub는 조건으로 건너뛴 작업을 성공으로 보고하고 필수 검사로도 통과 처리한다. 그래서 관계없는 PR은 「변경 범위」만 돌고 검사 작업은 건너뛴다. 바뀐 파일은 `gh api repos/<repo>/pulls/<n>/files --paginate`로 받는다(`pull-requests: read` 권한, 전체 이력 checkout이 필요 없다).

## 버린 대안

- 보호 규칙의 필수 검사를 `verify`로 바꾸기: 두 워크플로가 같은 이름이라 하나만 통과해도 규칙이 채워진다.
- 경로 필터만 걷기: 관계없는 PR마다 전체 CI(약 10분)가 돈다.

## 함정

- `concurrency` 그룹은 그대로라 같은 PR의 이전 실행은 취소된다.
- 정규식이 목록과 어긋나면 필요한 검사를 건너뛴다. 목록을 그대로 옮긴다.

## 완료 기준

- 이 PR에서 두 검사가 이름대로 보고되고 머지 가능 상태가 된다.
- PR #191을 최신 `main`으로 갱신한 뒤 「백엔드 검사」 통과, 「웹 검사」 건너뜀으로 머지 가능 상태가 된다.
