---
title: 곡률 단계 토큰 · 버튼 · 칩 · 입력 · 카드 통일
slug: radius-scale
stage: plan
status: accepted
intent: .intent/intent_radius-scale.md
spec: .intent/spec_radius-scale.md
date: 2026-11-10
---

# 곡률 단계 토큰 · 버튼 · 칩 · 입력 · 카드 통일 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/styles/tokens.css` | `--ex-radius-control` · `--ex-radius-card` 추가 |
| `services/web/src/styles/tokens.test.ts` | 「역할별 곡률」 검사 추가 |
| `services/web/src/styles/agent-chat-framework.css` | 버튼 · 입력 · 카드 · 배지를 토큰으로, `@theme inline`에 `--radius-lg` |
| `services/web/src/**/*.module.css`(약 50개 파일) | `radius-edits.tsv`의 규칙 곡률을 토큰으로 |

## 작업 순서

1. 토큰 두 개와 검사 추가 — 검사가 지금 규칙들을 잡아 실패하는지 본다.
2. `radius-edits.tsv`를 적용 스크립트로 반영 — 맞지 않는 줄이 하나라도 있으면 멈춘다.
3. `agent-chat-framework.css` 수정.
4. 검사를 돌려 남는 위반을 하나씩 본다. 대상이면 고치고, 대상이 아니면 이유와 함께 예외에 넣는다.
5. 칩 하나를 5px로 되돌려 실패를 확인하고 원복한다.
6. 조사 스크립트로 전후 화면을 찍어 확인하고 보고서를 고친다.
7. 타입 검사 · 웹 테스트 후 커밋 · 푸시, PR #214 본문 갱신.

## 가장 위험한 단계

2단계. 규칙 약 200개를 한 번에 바꾼다. 줄 번호와 예전 값이 둘 다 맞을 때만 쓰므로 엉뚱한 규칙은 바뀌지 않는다. 화면이 어긋나면 그 파일만 `git checkout`으로 되돌리고 목록에서 뺀다.

## 검증

```
pnpm typecheck
pnpm --filter @expresso/web test
node radius-probe.mjs http://radius.localhost:3161 <out> routes.json
```

화면: `/home` · `/jobs` · `/jobs/<id>` · `/brew/new` · `/brew/new/<분석>` · `/edit/<id>` · `/edit/<id>/deploy` · `/analytics` · `/account` · `/career/<분류>` · `/agent` · `/login`. 폭 1440px.
