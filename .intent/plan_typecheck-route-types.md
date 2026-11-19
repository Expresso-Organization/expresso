---
title: 타입 검사의 경로 타입 생성
slug: typecheck-route-types
stage: plan
status: accepted
intent: .intent/intent_typecheck-route-types.md
spec: .intent/spec_typecheck-route-types.md
date: 2026-11-20
---

# 타입 검사의 경로 타입 생성 — 구현 계획

## 바뀌는 파일

| 파일 | 바꾸는 것 |
|---|---|
| `services/web/package.json` | `typecheck`에 `next typegen` 추가 |
| `services/web/next-env.d.ts` | 저장소에서 제거(`git rm --cached`) |
| `services/web/.gitignore` | `next-env.d.ts` 추가 |
| `scripts/operations/deploy.sh` | `next-env.d.ts` 되돌리기 줄과 주석 제거 |
| `services/web/src/tsconfig.test.ts` | `typecheck` 스크립트의 순서 확인 |
| `AGENTS.md` · `docs/operations/DEPLOYMENT.md` | 타입 검사가 경로 타입을 만든다는 것, `next-env.d.ts` 미추적 |
| `.sitrep/…/20261115-1330-agent-home/` | #247 머지 · 배포 기록(앞선 미커밋분)과 이번 수정 |

## 작업 순서

```mermaid
flowchart LR
  A[고치기 전 장면 기록<br/>.next 없음 · 옛 타입] --> B[package.json · .gitignore · git rm --cached]
  B --> C[deploy.sh 줄 제거]
  C --> D[타입 검사 장면 넷]
  D --> E[테스트 · 문서]
  E --> F[커밋]
  F --> G[실제 커밋으로 git 구간 네 경로]
  G --> H[typecheck · test · 푸시 · PR]
  H --> I[CI 로그에서 타입 생성 확인]
```

## 가장 위험한 단계

`deploy.sh`다. 되돌리기 줄이 남으면 이 변경이 배포된 뒤 서버의 스크립트가 그 줄에서 멈추고, 그 뒤의 모든 배포도 같은 스크립트로 시작해 멈춘다. 서버를 손으로 고쳐야 풀린다. 커밋을 만든 뒤 스크래치패드의 워크트리에서 두 판의 스크립트에서 git 구간을 그대로 뽑아 돌린다.

## 검증

- 타입 검사는 실제 명령 `pnpm --filter @expresso/web typecheck`로 본다.
  - `.next` 없음 · `next-env.d.ts` 없음: 정상 코드 통과, 없는 경로 링크 실패(고치기 전에는 통과).
  - 옛 `.next/types`(`/goal` 없음) 남음: 정상 코드 통과(고치기 전에는 `TS2322`), 화면을 지우고 링크를 남기면 실패.
  - 검사 뒤 `git status`에 `next-env.d.ts` 없음.
- git 구간: 첫 배포(서버처럼 `.next-build` 경로로 고쳐 둔 `next-env.d.ts`) · 보통 배포 · 되돌리기 · 다시 앞으로. 줄을 지우지 않은 판이 pathspec 오류로 멈추는 것도 본다.
- 서버의 git 판 확인(읽기 전용).
- `pnpm typecheck` · `pnpm test` · `NEXT_DIST_DIR` 없는 웹 빌드 · `deploy.sh`의 웹 빌드 구간.
- PR의 「웹 검사」 타입 검사 단계 로그에 `Generating route types...`.
- 운영 확인: 머지되면 배포 conclusion과 서버 `git status`에서 `M services/web/next-env.d.ts`가 사라졌는지.
