---
title: 세션 없는 서버 액션의 로그인 이동
slug: action-expired-session
stage: plan
status: accepted
intent: .intent/intent_action-expired-session.md
spec: .intent/spec_action-expired-session.md
date: 2026-10-27
---

# 세션 없는 서버 액션의 로그인 이동 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/proxy.ts` | 쿠키 없는 분기를 요청 종류별 응답으로 |
| `services/web/src/proxy.test.ts` | fetch 액션 · 폼 POST · 개발 로그인 시험 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 시험 먼저 — 지금 코드에서 fetch 액션 시험이 307로 실패하는지 본다.
2. `proxy.ts` 고치기 — 시험 통과.
3. dev01로 편집 화면에서 쿠키를 지우고 서버 액션을 눌러 확인.

## 가장 위험한 단계

GET 동작이 바뀌면 모든 화면의 로그인 이동이 깨진다. 기존 시험(307 · `next`)이 그대로 통과하는지 본다.

## 검증

```
pnpm --filter @expresso/web typecheck
pnpm --filter @expresso/web test
```
