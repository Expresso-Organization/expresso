---
title: backend 테스트 스크립트 의존 패키지 빌드 선행 정합
slug: backend-test-build-deps
stage: spec
status: accepted
intent: .intent/intent_backend-test-build-deps.md
date: 2026-10-16
---

# backend 테스트 스크립트 의존 패키지 빌드 선행 정합 — 명세

## 요구사항

- [ ] `services/backend`의 `test` · `test:infra` · `test:load`가 빌드 선행을
      `pnpm --filter "@expresso/backend^..." build` 하나로 한다.
- [ ] 루트 `scripts/test-infra.mjs`의 빌드 단계도 같은 선택자 하나로 바꾼다.
      이 스크립트는 backend 스크립트를 거치지 않고 `exec vitest`를 직접 부르며,
      같은 이유로 editor가 빠져 있다.
- [ ] `packages/*/dist`를 모두 지운 상태에서 `pnpm --filter @expresso/backend test`가
      exit 0.
- [ ] dist를 모두 지운 상태에서 루트 `pnpm test:infra`가 exit 0(로컬 인프라 사용).
- [ ] 루트 `pnpm test`가 exit 0.
- [ ] AGENTS.md 「끝내기 전에」에서 backend 예외 문구를 지운다.

## 설계

- backend의 워크스페이스 의존은 contracts · editor · database ·
  portfolio-renderer 넷이다. `^...`는 이 넷을 의존 순서(editor → contracts →
  database · portfolio-renderer)로 빌드한다. 직전 변경과 같은 방식이다.
- `test:load`는 지금 portfolio-renderer를 빌드하지 않지만, 선택자로 바꾸면 함께
  빌드된다. 의존 목록에 있는 패키지이므로 빌드해도 문제가 없다. 그만큼 시간이
  늘어난다.
- `test-infra.mjs`의 `for` 목록에서 빌드 세 줄을
  `["--filter", "@expresso/backend^...", "build"]` 한 줄로 바꾼다.

## 버린 대안

- **목록에 editor만 추가** — 의존이 늘 때마다 같은 누락이 반복된다. 다른 패키지와
  방식도 갈린다.

## 함정

- `test:infra`는 루트 스크립트가 넘기는 `TEST_MONGODB_URL` · `TEST_REDIS_URL`이
  있어야 의미가 있다. 로컬 인프라(57017 · 56379)가 떠 있으므로 루트
  `pnpm test:infra`로 확인한다.
- `test:load`는 CI에서 단독으로 돈다. 로컬에서는 빌드 단계까지만 확인할 수 있으면
  그렇게 보고한다.

## 완료 기준

```
rm -rf packages/*/dist && pnpm --filter @expresso/backend test   # exit 0
rm -rf packages/*/dist && pnpm test:infra                        # exit 0
pnpm test                                                        # exit 0
```
