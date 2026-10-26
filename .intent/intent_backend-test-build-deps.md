---
title: backend 테스트 스크립트 의존 패키지 빌드 선행 정합
slug: backend-test-build-deps
stage: intent
status: accepted
author: Nedian0Brien
date: 2026-10-16
---

# backend 테스트 스크립트 의존 패키지 빌드 선행 정합

## 문제

`services/backend`의 `test` · `test:infra` · `test:load`는 빌드할 패키지를 손으로
나열한다(contracts · database · portfolio-renderer, `test:load`는 앞의 둘만).
`@expresso/editor`는 목록에 없다. contracts dist가 editor dist
(`@expresso/editor/commands` 등)를 가져오므로, editor dist가 없는 새 워크트리에서
`pnpm --filter @expresso/backend test`를 단독으로 돌리면 실패한다.

직전 변경(`root-test-stale-dist`)에서 web · contracts · database ·
portfolio-renderer는 `pnpm --filter "<자기>^..." build`로 바꿨고, backend만 손으로
쓴 목록이 남아 AGENTS.md에도 예외로 적혀 있다. 손으로 쓴 목록은 의존이 늘 때
빠뜨리기 쉽고, 이번 editor 누락이 그 예다.

## 원하는 결과

- `packages/*/dist`를 모두 지운 상태에서 `pnpm --filter @expresso/backend test`가
  통과한다.
- backend의 세 테스트 스크립트가 `package.json` 의존 목록에서 빌드 대상을 가져온다.
- 루트 `pnpm test`가 계속 통과한다.
- AGENTS.md에서 backend 예외 문구가 빠진다.

## 영향 범위

- `services/backend/package.json`의 `test` · `test:infra` · `test:load`.
- `AGENTS.md` 「끝내기 전에」.
- CI `backend-ci.yml`의 `test:infra` · `test:load` 단계(빌드가 editor · portfolio-renderer
  만큼 늘어난다).

## 제약

- backend의 `build` · `typecheck` 스크립트는 건드리지 않는다.
- 인프라가 필요한 `test:infra` · `test:load`는 로컬에서 인프라 없이 돌릴 수 없으면
  빌드 단계까지만 확인하고 그렇게 보고한다.

## 범위 밖

- backend `build` · `typecheck`의 빌드 선행 정리.
- 테스트 내용 변경.

## 열린 질문

없음.
