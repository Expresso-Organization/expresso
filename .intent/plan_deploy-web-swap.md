---
title: 배포 중 웹 화면 오류 제거
slug: deploy-web-swap
stage: plan
status: accepted
intent: .intent/intent_deploy-web-swap.md
spec: .intent/spec_deploy-web-swap.md
date: 2026-11-10
---

# 배포 중 웹 화면 오류 제거 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `scripts/operations/deploy.sh` | 웹을 `.next-build`에 짓고, 이전 판 정적 파일을 복사하고, stop → 교체 → start로 바꾼다 |
| `services/web/.gitignore` | `.next-build/`, `.next-prev/` 추가 |
| `docs/operations/DEPLOYMENT.md` | 흐름도와 「실패와 복구」에 웹 교체와 `.next-prev` 되돌리기 추가 |

## 작업 순서

1. `deploy.sh` 수정 — `bash -n` 통과.
2. `.gitignore` 수정 — 빌드 뒤 `git status`에 새 폴더가 안 보인다.
3. 로컬 시험 — 기존 `.next`를 하나 지어 두고, 수정한 스크립트의 웹 단계와 같은 명령으로 새 판을 지어 교체한다. `next start`에서 `/login` 200, 새 청크 200, 이전 판 청크 200을 확인한다.
4. 문서 수정.
5. 커밋 · 푸시 · PR.

## 가장 위험한 단계

머지 뒤 첫 운영 배포다. `deploy.sh`는 대상 커밋의 스크립트로 다시 시작하므로 이 PR의 머지 배포가 곧 새 절차의 첫 실행이다. 교체 뒤 웹이 뜨지 않으면 서버에서 `sudo systemctl stop expresso-web && cd ~/expresso/services/web && mv .next .next-bad && mv .next-prev .next && sudo systemctl start expresso-web`로 되돌린다. 스크립트 자체는 `git revert`로 되돌린다.

## 검증

```
bash -n scripts/operations/deploy.sh
# 로컬 웹 단계 시험(3단계)
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:<포트>/login
# 머지 뒤 배포 중
curl -s -o /dev/null -w '%{http_code}' https://expresso.ai.kr/_next/static/chunks/<배포 전 청크>.js
```
