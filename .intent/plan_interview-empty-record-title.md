---
title: 제목이 빈 기록의 AI 질문 근거
slug: interview-empty-record-title
stage: plan
date: 2026-11-14
---

# 제목이 빈 기록의 AI 질문 근거 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/backend/src/modules/interview/service.ts` | 빈 제목 이름 |
| `services/backend/src/modules/interview/interview.integration.test.ts` | 빈 제목 기록 근거 사례 |

## 작업 순서

1. 선택지 만드는 자리에서 이름 대체
2. 통합 테스트

## 가장 위험한 단계

없음. 근거 글만 바뀌고 저장 구조는 같다.

## 검증

```
npx vitest run src/modules/interview/   # backend, TEST_MONGODB_URL 포함
```
