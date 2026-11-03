---
title: 배포 스크립트 자기 교체 뒤 새 버전 실행
slug: deploy-self-reexec
stage: plan
status: accepted
date: 2026-11-03
---

# Plan — 배포 스크립트 자기 교체 뒤 새 버전 실행

## 파일

| 파일 | 변경 |
|---|---|
| `scripts/operations/deploy.sh` | `PREVIOUS`를 `EXPRESSO_DEPLOY_PREVIOUS`에서 받기. fetch · checkout · exec를 `{ … }` 묶음으로. |
| `docs/operations/DEPLOYMENT.md` | 「실행」 절에 재시작 동작과 첫 배포의 예외를 적기. |

## 순서

1. `deploy.sh` 수정.
2. 시험 저장소로 재현 검증 — 아래 「검증」.
3. 문서 수정.
4. `fix: 배포 스크립트 checkout 뒤 새 버전 재실행` 커밋 · PR.

## 검증

1. 임시 디렉터리에 bare 저장소와 작업 저장소를 만든다. 커밋 A에는 지금 `main`의 `deploy.sh`를, 커밋 B에는 수정한 `deploy.sh`에 마지막 줄 표시를 하나 더한 것을 둔다.
2. `pnpm` · `docker` · `sudo` · `curl` · `journalctl`은 `EXPRESSO_NODE_BIN` 자리의 대체 스크립트로 바꾼다. `curl`은 요청에 따라 200 · 307 · 101을 낸다.
3. 작업 저장소를 커밋 C(수정한 `deploy.sh`)에 두고 `deploy.sh B`를 돌린다. B의 표시 줄이 찍히고 `.last-deployed-commit`이 C인지 본다.
4. 같은 시험을 수정 전 스크립트로 돌려, B의 표시 줄이 찍히지 않는 현재 결함을 재현한다.
5. `bash -n scripts/operations/deploy.sh`.
