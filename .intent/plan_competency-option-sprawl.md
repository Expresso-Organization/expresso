---
title: AI 정리 역량 선택지 누적 방지
slug: competency-option-sprawl
stage: plan
status: draft
intent: .intent/intent_competency-option-sprawl.md
spec: .intent/spec_competency-option-sprawl.md
date: 2026-11-14
---

# AI 정리 역량 선택지 누적 방지 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/backend/src/modules/career/select-options.ts` | `optionKey`로 대조 |
| `services/backend/src/modules/career/record-cleaner.ts` | `knownCompetencies` · 프롬프트 절 · 판 올림 |
| `services/backend/src/modules/interview/service.ts` | 카테고리 역량 이름 읽어 넘기기 |
| 테스트 | `select-options` · `record-cleaner` 단위, interview 통합 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. `optionKey`와 대조 — 단위 테스트
2. 정리 프롬프트 절 — 단위 테스트
3. interview 서비스 연결 — 통합 테스트
4. 검증 — backend test · test:infra · typecheck

## 가장 위험한 단계

1단계. 키가 너무 느슨하면 다른 역량이 한 선택지로 합쳐져 기록 값이 틀어진다. 기호와 공백만 지우고 글자는 남겨 막는다. 문제가 생기면 `optionKey`를 이전 비교(trim · 소문자)로 되돌린다.

## 검증

```
pnpm --filter @expresso/backend test -- select-options record-cleaner
pnpm test:infra
pnpm typecheck
```
