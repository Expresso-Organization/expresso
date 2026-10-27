---
title: 루트 pnpm test의 web 테스트 dist 의존 경쟁 조건 제거
slug: root-test-stale-dist
stage: plan
status: accepted
intent: .intent/intent_root-test-stale-dist.md
spec: .intent/spec_root-test-stale-dist.md
date: 2026-10-16
---

# 루트 pnpm test의 web 테스트 dist 의존 경쟁 조건 제거 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `package.json` | `test`에 `--workspace-concurrency=1` |
| `services/web/package.json` | `test` 앞에 `pnpm --filter "@expresso/web^..." build` |
| `packages/contracts/package.json` | `test` 앞에 `pnpm --filter "@expresso/contracts^..." build` |
| `packages/database/package.json` | `test` 앞에 `pnpm --filter "@expresso/database^..." build` |
| `packages/portfolio-renderer/package.json` | `test` 앞에 `pnpm --filter "@expresso/portfolio-renderer^..." build` |
| `AGENTS.md` | 「끝내기 전에」 dist 설명을 실제와 맞추고 순차 실행 이유 추가 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 패키지 스크립트 네 곳 수정 — `pnpm --filter <패키지> test` 출력에서 의존
   패키지 빌드가 editor → contracts 순으로 먼저 찍히는지 본다.
2. 루트 스크립트 수정 — 루트 `pnpm test` 출력에서 패키지 로그가 섞이지 않고
   하나씩 끝나는지 본다.
3. AGENTS.md 수정.
4. 검증 명령 실행, 변경 전후 시간 비교(변경 전 19 · 20초).

## 가장 위험한 단계

2단계. 순차 실행으로 CI(`backend-ci.yml`의 `pnpm test`)와 로컬 시간이 늘어난다.
되돌리기는 루트 `test`의 플래그 하나를 지우면 된다. 다만 그러면 동시 재작성
위험이 돌아온다.

## 검증

```
pnpm test                    # 최신 dist, 3회 연속 exit 0 · 시간 기록
# 낡은 dist 만들기
sed -i '' '/agent-chat.js/d' packages/contracts/dist/index.js
rm packages/contracts/dist/agent-chat.*
pnpm test                    # exit 0 (2회, 매번 다시 낡게 만든 뒤)
# 다시 낡게 만든 뒤
pnpm --filter @expresso/web test   # exit 0
pnpm typecheck               # exit 0
```
