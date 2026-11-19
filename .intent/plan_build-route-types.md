---
title: 운영 빌드의 경로 타입 검사
slug: build-route-types
stage: plan
status: accepted
intent: .intent/intent_build-route-types.md
spec: .intent/spec_build-route-types.md
date: 2026-11-20
---

# 운영 빌드의 경로 타입 검사 — 구현 계획

## 바뀌는 파일

| 파일 | 바꾸는 것 |
|---|---|
| `services/web/next.config.ts` | phase를 받는 함수로 바꾸고, 운영 빌드 + `NEXT_DIST_DIR`일 때 `typescript.tsconfigPath` 지정 · 파일이 없으면 오류 |
| `services/web/tsconfig.next-build.json` | 새 파일. `.next-build/types`를 읽는 `include` |
| `services/web/tsconfig.json` | `incremental` 제거 |
| `services/web/src/tsconfig.test.ts` | 새 파일. 두 `include`의 차이, `deploy.sh`의 폴더 이름, 증분 캐시 꺼짐 확인 |
| `services/web/src/app/(app)/home/ProposalFeed.tsx` · `features/agent-chat/JobGoalDraftCard.tsx` | `/goal` 링크 세 곳의 `as Route` 제거 |
| `docs/operations/DEPLOYMENT.md` | `.next-build` 문단에 타입 검사가 읽는 폴더 |
| `.sitrep/…/20261115-1330-agent-home/` | #240 · #242 · #243 · #244 머지와 배포 실패 · 복구, 이번 수정 기록 |

## 작업 순서

```mermaid
flowchart LR
  A[재현: #240의 .next + #242<br/>배포 절차 그대로] --> B[next.config.ts · tsconfig.next-build.json]
  B --> C[재현 장면 다시: 통과]
  C --> D[없는 경로 링크: 실패]
  D --> E[지운 화면: 통과]
  E --> F[as Route 제거 · 테스트 · 문서]
  F --> G[typecheck · test · 기본 빌드]
  G --> H[커밋 · 푸시 · PR]
```

## 가장 위험한 단계

검증의 해석이다. 수정 뒤 빌드가 통과해도 링크 타입이 아예 빠진 것일 수 있다. 같은 `.next`(#240) 위에서 통과 장면과 실패 장면을 둘 다 본다.

## 검증

- 재현 장면: `rm -rf .next-build` → `.next/cache`를 옮김 → `NEXT_DIST_DIR=.next-build NEXT_PUBLIC_API_BASE_URL=… pnpm --filter @expresso/web build`. `deploy.sh`의 구간 그대로.
- 실패 장면 셋: 없는 경로의 링크, tsconfig가 없는 폴더 이름(`NEXT_DIST_DIR=.next-other`), 직전 배포의 캐시가 있는 상태에서 화면만 지우고 링크를 남긴 변경.
- 통과 장면은 직전 배포의 `.next/cache`를 옮겨 온 상태(서버와 같은 조건)로도 본다.
- `NEXT_DIST_DIR=.next-e2e-v2 next dev`가 설정 단계를 지나 뜨는지.
- `pnpm typecheck` · `pnpm test` · `NEXT_DIST_DIR` 없는 `pnpm --filter @expresso/web build`.
- 운영 확인: 이 PR의 배포는 고치기 전이어도 통과한다. 새 화면을 더하는 다음 배포가 운영에서의 확인이다.
