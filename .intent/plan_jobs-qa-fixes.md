---
title: QA 지적 세 건 — 입력 칸 · 비슷한 검색 · 마감순
slug: jobs-qa-fixes
stage: plan
date: 2026-11-14
---

# QA 지적 세 건 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/features/career-editor/properties/{PropertyValueEditor.tsx,properties.module.css}` | 안내 문구 |
| `services/web/src/app/(app)/jobs/{similar-searches.ts,similar-searches.test.ts,RecentSearches.tsx}` | 비슷한 검색 거르기 |
| `services/backend/src/modules/jobs/{board-service.ts,nearby.integration.test.ts}` | 정렬 순서 |

## 작업 순서

1. 정렬 순서와 통합 테스트(기본 · 마감 · 최신)
2. 비슷한 검색 함수와 테스트
3. 안내 문구
4. jobs · career-editor · tokens 테스트, 브라우저 확인

## 가장 위험한 단계

1단계. 기존 장소 검색 테스트가 `sort: "recent"`로 가까운 순을 확인하고 있었다. 기본 정렬(`match`)로 옮기고, 마감 · 최신은 새 사례로 본다.

## 검증

```
npx vitest run src/modules/jobs/                       # backend, TEST_MONGODB_URL 포함
npx vitest run "src/app/(app)/jobs" src/features/career-editor src/styles   # web
```
