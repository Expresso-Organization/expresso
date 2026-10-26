---
title: 루트 pnpm test의 web 테스트 dist 의존 경쟁 조건 제거
slug: root-test-stale-dist
stage: spec
status: accepted
intent: .intent/intent_root-test-stale-dist.md
date: 2026-10-16
---

# 루트 pnpm test의 web 테스트 dist 의존 경쟁 조건 제거 — 명세

## 요구사항

- [ ] 다른 워크스페이스 패키지의 dist를 읽는 패키지의 `test` 스크립트는 그
      의존 패키지를 먼저 빌드한다. 대상: web(editor · contracts),
      contracts(editor), database(editor · contracts),
      portfolio-renderer(editor · contracts). backend는 이미 그렇게 되어 있다.
- [ ] 루트 `pnpm test`는 패키지를 한 번에 하나씩, 의존 순서대로 돌린다.
      어느 패키지의 빌드도 다른 패키지 vitest의 dist 읽기와 겹치지 않는다.
- [ ] contracts dist에서 `agent-chat.*`와 re-export를 지운 상태에서 루트
      `pnpm test`와 `pnpm --filter @expresso/web test`가 통과한다.
- [ ] 최신 dist 상태에서 루트 `pnpm test`가 3회 연속 통과한다.
- [ ] 테스트 파일과 `useAgentConversation.ts`는 바뀌지 않는다.

## 설계

- 패키지 스크립트: `pnpm --filter "<자기 이름>^..." build && vitest run`.
  `^...`는 자기 자신을 뺀 의존 패키지(직접 · 간접)를 고른다(pnpm 문서
  「Filtering」). 재귀 실행은 기본값 `--sort`로 의존 순서를 따른다(pnpm 문서
  「pnpm -r」). 의존 목록을 스크립트에 손으로 다시 적지 않고 `package.json`의
  `dependencies`에서 가져오므로, 의존이 늘어도 스크립트를 고칠 필요가 없다.
- 루트 스크립트: `pnpm --recursive --if-present --workspace-concurrency=1 test`.
  기본 동시 실행 수는 min(4, 코어 수)이다(pnpm 문서 「pnpm -r」
  `--workspace-concurrency`). 1이면 한 번에 하나씩 돈다.
- AGENTS.md 「끝내기 전에」에 루트 테스트가 순차 실행인 이유를 한 줄 더한다.
- CI: `backend-ci.yml`은 루트 `pnpm test`를 쓰므로 순차 실행이 그대로 적용된다.
  앞 단계의 빌드는 그대로 둔다(마이그레이션 · 타입 검사가 dist를 쓴다).
  `web-ci.yml`은 `pnpm --filter @expresso/web test`라 web 스크립트의 빌드 선행만
  더해진다.

## 버린 대안

- **web vitest가 contracts를 src로 읽게 alias 지정** — AGENTS.md의 "테스트는
  dist를 본다" 원칙과 어긋나고, contracts src가 다시 editor dist를 가져와 문제가
  남는다.
- **web 스크립트에만 빌드 선행 추가** — 루트 동시 실행에서 web과 backend가 같은
  dist를 동시에 다시 쓰고, 그 사이 다른 쪽 vitest가 읽는다. tsc는 내용이
  같아도 파일을 다시 쓴다(mtime 변경 확인).
- **루트에서 한 번만 빌드하고 동시 실행 유지** — backend 스크립트가 테스트 중에
  다시 빌드하므로 읽기와 쓰기가 겹친다.
- **tsc 증분 빌드로 재작성 제거** — intent 범위 밖.

## 함정

- 순차 실행과 빌드 중복으로 루트 `pnpm test` 시간이 늘어난다. 변경 전후를 잰다.
- pnpm은 기본 `--bail`이라 첫 실패에서 멈춘다. 순차 실행에서도 같다.
- database `build`는 `tsc` 뒤 `src/mongo-build.mjs`를 돌린다. 테스트 전에
  돌아도 부작용이 없는지 확인한다.
- `pnpm --filter "X^..." build`가 고른 패키지가 없으면(의존 없음) 오류가 나는지
  확인한다. 이번 대상은 모두 의존이 하나 이상이다.

## 완료 기준

```
# 낡은 dist 재현 후
pnpm test                          # 2회, exit 0
pnpm --filter @expresso/web test   # exit 0
# 최신 dist
pnpm test                          # 3회 연속, exit 0
pnpm typecheck                     # exit 0
```
