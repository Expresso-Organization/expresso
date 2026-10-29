---
title: 수치 출처 검사의 HTML 엔티티 오탐 수정
slug: visible-text-entities
stage: plan
status: accepted
intent: .intent/intent_visible-text-entities.md
spec: .intent/spec_visible-text-entities.md
date: 2026-10-28
---

# 수치 출처 검사의 HTML 엔티티 오탐 수정 — 구현 계획

브랜치: `fix/visible-text-entities` (origin/main에서).

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/backend/src/platform/html/entities.ts` (새) | `decodeHtmlEntities` |
| `services/backend/src/platform/html/entities.test.ts` (새) | 이름 · 10진 · 16진 표기, `&amp;` 순서, 잘못된 코드 포인트 |
| `services/backend/src/modules/page/generator.ts` | `visibleText`가 태그 제거 뒤 `decodeHtmlEntities` 사용 |
| `services/backend/src/modules/page/*.test.ts` (기존 `visibleText` · 수치 검사 테스트 자리) | 따옴표가 든 지면에서 출처 없는 수치 0개 |
| `services/backend/src/modules/jobs/ingest/adapter.ts` | `decodeEntities`가 공용 함수 사용 |
| `services/backend/src/modules/jobs/ingest/work24-web.ts` | `decode`가 공용 함수 사용 |

## 작업 순서

1. `entities.ts`와 테스트를 씁니다 — 새 테스트가 통과합니다.
2. `visibleText`를 바꾸고 따옴표 지면 테스트를 더합니다 — "27"이 잡히지 않습니다.
3. 공고 수집기 두 곳을 공용 함수로 바꿉니다 — `jobs/ingest` 테스트가 그대로 통과합니다.
4. `pnpm typecheck` · `pnpm test`를 돌린 뒤 커밋 · 푸시 · PR을 엽니다.

## 가장 위험한 단계

3단계입니다. 공고 본문 변환 결과가 미세하게 달라질 수 있습니다(`work24-web`이 숫자 표기를 새로 풂). 기존 테스트가 깨지면 그 단계만 되돌리고 1–2단계로 PR을 냅니다.

## 검증

```bash
pnpm --filter @expresso/backend exec vitest run src/platform/html src/modules/page src/modules/jobs/ingest
pnpm typecheck
pnpm test
```
