---
title: 저장한 검색 조건 반영과 목록
slug: saved-search-conditions
stage: plan
date: 2026-11-14
---

# 저장한 검색 조건 반영과 목록 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/app/(app)/jobs/saved-search.ts` · `.test.ts` | 비교 키 · 저장 여부 · 다시 여는 주소 |
| `services/web/src/app/(app)/jobs/SavedSearches.tsx` | 목록 카드 |
| `services/web/src/app/(app)/jobs/page.tsx` · `page.module.css` | 목록 받기 · 저장 여부 · 레일 |
| `services/web/src/app/(app)/jobs/jobs-actions.ts` · `lib/api/endpoints.ts` | 지우기 액션 · 엔드포인트 |
| `services/backend/src/modules/jobs/{routes,service,legacy-mysql-service}.ts` | 지우기 API |
| `services/backend/src/modules/jobs/jobs.integration.test.ts` | 지우기 404 · 204 |

## 작업 순서

1. 웹 순수 함수와 테스트
2. 백엔드 지우기 API와 통합 테스트
3. 화면 연결
4. 타입 검사 · jobs 테스트

## 가장 위험한 단계

3단계. 저장 목록을 검색어 없이도 받으므로 공고 첫 화면에 요청이 하나 는다. 다른 요청과 `Promise.all`로 나란히 보낸다.

## 검증

```
pnpm typecheck
npx vitest run src/modules/jobs/      # backend, TEST_MONGODB_URL 포함
npx vitest run "src/app/(app)/jobs"   # web
```
