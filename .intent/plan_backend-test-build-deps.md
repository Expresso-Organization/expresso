---
title: backend 테스트 스크립트 의존 패키지 빌드 선행 정합
slug: backend-test-build-deps
stage: plan
status: accepted
intent: .intent/intent_backend-test-build-deps.md
spec: .intent/spec_backend-test-build-deps.md
date: 2026-10-16
---

# backend 테스트 스크립트 의존 패키지 빌드 선행 정합 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/backend/package.json` | `test` · `test:infra` · `test:load` 빌드 선행을 `^...` 선택자로 |
| `scripts/test-infra.mjs` | 빌드 세 단계를 `@expresso/backend^...` 한 단계로 |
| `AGENTS.md` | 「끝내기 전에」 backend 예외 문구 삭제 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. backend 스크립트 수정 — dist를 지우고 `pnpm --filter @expresso/backend test`
   출력에서 editor 빌드가 먼저 찍히고 exit 0인지 본다.
2. `test-infra.mjs` 수정 — dist를 지우고 `pnpm test:infra` exit 0.
3. AGENTS.md 수정.
4. 루트 `pnpm test` exit 0.

## 가장 위험한 단계

2단계. CI `backend-ci.yml`이 `test:infra`를 backend 스크립트로 부르므로 1단계
변경도 CI 경로에 닿는다. 깨지면 해당 스크립트 줄을 되돌린다.

## 검증

```
rm -rf packages/*/dist && pnpm --filter @expresso/backend test
rm -rf packages/*/dist && pnpm test:infra
pnpm test
```
