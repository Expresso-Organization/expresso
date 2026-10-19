---
title: 루트 pnpm test의 web 테스트 dist 의존 경쟁 조건 제거
slug: root-test-stale-dist
stage: intent
status: accepted
author: Nedian0Brien
date: 2026-10-16
---

# 루트 pnpm test의 web 테스트 dist 의존 경쟁 조건 제거

## 문제

루트 `pnpm test`에서 web 테스트 다섯 개가 간헐적으로 실패한다
(`useAgentConversation.test.tsx` 세 개, `api/agent/[...path]/route.test.ts`
「취소 요청에 유효한 빈 JSON을 전달한다」, `api/agent/credential/route.test.ts`
「키 저장 응답은 상태만 반환하고 삭제 요청도 전달한다」).
`pnpm --filter @expresso/web test`나 파일 단독 실행은 통과한다.

조사 결과 원인은 타이머나 CPU 부하가 아니라 빌드 산출물이다.

- web은 `@expresso/contracts`를 `dist/index.js`로 가져온다(`exports.default`).
  `exports.types`는 `src`라 타입 검사는 dist가 낡아도 알아채지 못한다.
- web의 `test` 스크립트는 contracts를 빌드하지 않는다. AGENTS.md는 "각 패키지의
  test 스크립트가 그 둘을 먼저 짓게 되어 있다"고 적지만 web은 예외다.
- 루트 `pnpm test`는 패키지를 최대 4개 동시에 돌리고, contracts를 다시 빌드하는
  곳은 web과 함께 도는 backend의 `test` 스크립트뿐이다. tsc는 내용이 같아도
  dist 파일을 전부 다시 쓴다.
- 그래서 web 테스트가 보는 dist가 낡았는지, 재작성 중인지가 실행 전 상태와
  순서에 따라 달라진다.

재현: 이 워크트리의 `packages/contracts/dist`에서 `agent-chat.*`와 그 re-export를
지우고 루트 `pnpm test`를 돌리면 위 다섯 개가 2/2회 같은 형태로 실패한다 —
hook 테스트는 스키마가 `undefined`라 응답 파싱이 예외를 내고 `issue`로 삼켜져
`waitFor` 기본 1000ms에서 시간 초과, route 테스트는 즉시 실패. 스키마를 쓰지 않는
401 테스트는 통과한다. main 체크아웃의 contracts dist도 9월 28일 빌드로
`agent-chat.js`가 없다.

같은 문제로 새 워크트리에서는 contracts 테스트가 `@expresso/editor` dist가 없어
먼저 실패한다(contracts의 `test`도 editor를 빌드하지 않는다).

## 원하는 결과

- 루트 `pnpm test`가 dist 상태(없음 · 낡음 · 최신)와 무관하게 같은 결과를 낸다.
- contracts dist를 일부러 낡게 만든 상태에서도 루트 `pnpm test`와
  `pnpm --filter @expresso/web test`가 통과한다.
- 최신 dist 상태에서 루트 `pnpm test` 3회 이상 연속 통과.
- 테스트 실행 중 어떤 패키지의 빌드도 다른 패키지 테스트의 dist 읽기와 겹치지 않는다.

## 영향 범위

- 루트 `package.json`의 `test` 스크립트, web · contracts 패키지의 `test` 스크립트.
- AGENTS.md 「끝내기 전에」 설명.
- 개발자의 로컬 `pnpm test` 실행 시간(동시 실행 → 순차 실행으로 늘어난다).

## 제약

- AGENTS.md의 "테스트는 dist를 본다" 원칙을 유지한다. 테스트를 src로 돌리는
  방식으로 바꾸지 않는다.
- CI(`web-ci.yml` · `backend-ci.yml`)와 `scripts/operations/deploy.sh`의 순서를
  깨지 않는다.
- 실패한 테스트 파일과 `useAgentConversation.ts`는 원인이 아니므로 고치지 않는다.

## 범위 밖

- tsc 증분 빌드(`tsc -b`, `incremental`)로 재작성 자체를 없애는 방식. 모든
  패키지의 tsconfig와 후처리 스크립트를 건드려야 해서 이번에 하지 않는다.
- backend 테스트 스크립트의 빌드 선행 구성 변경.
- vitest 설정(타임아웃 · 풀) 변경.

## 열린 질문

- 루트 테스트를 순차 실행으로 바꾸면 실행 시간이 늘어난다. 측정값을 spec에
  적고, 받아들이기 어려운 수준이면 범위 밖의 증분 빌드 방식을 다시 검토한다.
