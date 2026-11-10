---
title: 경로 밖 PR도 필수 검사를 받는 CI
slug: ci-required-checks
stage: spec
status: draft
intent: .intent/intent_ci-required-checks.md
date: 2026-11-10
---

# 경로 밖 PR도 필수 검사를 받는 CI — 명세

## 요구사항

- [ ] `web-ci.yml` · `backend-ci.yml`의 `pull_request` 트리거에 `paths`가 없다. `push`의 `paths`는 그대로다.
- [ ] 각 워크플로에 `changes` 잡이 있고, PR이면 `GET /pulls/{n}/files`(옛 이름 포함)를 기존 경로 목록과 맞춰 `relevant`를 낸다. PR이 아니면 늘 `true`다.
- [ ] `verify`(와 백엔드 `e2e`)는 `needs: changes`이고 `!cancelled() && (needs.changes.result != 'success' || relevant == 'true')`일 때만 돈다.
- [ ] `verify`의 `name`은 `웹 검사` · `백엔드 검사`다.
- [ ] 브랜치 보호 필수 검사가 이 두 이름(GitHub Actions, app_id 15368)이다.

## 설계

경로 판정은 셸 `case` 글롭으로 한다(`services/web/**` → `services/web/*`, `case`의 `*`는 `/`도 맞춘다). 외부 액션을 들이지 않고 `gh api`만 쓴다.
권한은 `pull-requests: read`를 더한다. 판정 실패는 `set -euo pipefail`로 잡을 실패시키고, 실패한 감지는 `verify`를 돌게 한다.

## 버린 대안

- `dorny/paths-filter`: 외부 액션 의존이 늘고, 셸 몇 줄로 같은 일을 한다.
- 항상 도는 집계 잡 하나: 잡 의존이 워크플로를 넘지 못해 다른 워크플로 결과를 기다리려면 폴링이 필요하다.

## 함정

- 건너뛴 잡은 필수 검사에서 통과다 — 감지 실패를 건너뜀으로 만들면 안 된다.
- `pull_request` 실행은 PR의 머지 커밋 워크플로를 쓰므로, 이 변경이 `main`에 들어가기 전까지 다른 PR은 옛 `verify` 이름을 낸다.

## 완료 기준

`actionlint`가 통과하고, 이 PR에서 두 검사가 성공한 뒤 auto-merge로 머지된다.
