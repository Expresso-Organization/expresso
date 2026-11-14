---
title: 포트폴리오 지면 서버 운영 계정 정보 노출 차단
slug: page-operator-identity
stage: plan
status: draft
intent: .intent/intent_page-operator-identity.md
spec: .intent/spec_page-operator-identity.md
date: 2026-11-14
---

# 포트폴리오 지면 서버 운영 계정 정보 노출 차단 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/backend/src/modules/page/generator.ts` | 작성자 절 · `ungroundedEmails` · `check` 합치기 · 프롬프트 판 올림 |
| `services/backend/src/modules/page/generator.identity.test.ts` | 새 단위 테스트 |
| `services/backend/src/platform/ai/claude-code.ts` | spawn env에 git 지시 끄기 |
| `services/backend/src/platform/ai/claude-code.test.ts` | spawn env 테스트 |
| `services/backend/src/platform/agent/runtime.ts` | 구독 경로 env · 시스템 프롬프트 한 줄 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. `generator.ts` 프롬프트 작성자 절 — 테스트로 문장 확인
2. `ungroundedEmails`와 `check` 합치기 — 남의 이메일 · 근거 이메일 테스트
3. `claude-code.ts` spawn env — 기존 spawn 테스트 방식으로 env 확인
4. `runtime.ts` env와 시스템 프롬프트 — 타입 검사
5. 검증 — backend 테스트 · 타입 검사

## 가장 위험한 단계

2단계. 오탐이면 정상 지면이 매번 다시 쓰여 비용이 두 배가 된다. 근거 이메일 통과 테스트로 막고, 깨지면 `check`에서 이메일 위반만 빼서 되돌린다.

## 검증

```
pnpm --filter @expresso/backend test -- generator claude-code
pnpm typecheck
```
