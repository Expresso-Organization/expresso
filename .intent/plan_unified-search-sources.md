---
title: 통합 검색 공고 검색 규칙 일원화
slug: unified-search-sources
stage: plan
status: accepted
intent: .intent/intent_unified-search-sources.md
spec: .intent/spec_unified-search-sources.md
date: 2026-11-10
---

# 통합 검색 공고 검색 규칙 일원화 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/contracts/src/engagement.ts` | `cursor` 제거, `limit` 뜻을 종류별로, `UnifiedSearchResponseSchema` 추가 |
| `packages/contracts/src/portfolios.ts` | `ListPortfoliosQuerySchema.q` 추가 |
| `packages/contracts/src/openapi.ts` · `contracts.test.ts` | 응답 스키마 등록 |
| `services/backend/src/modules/jobs/board-service.ts` | `boardOrder` 추출, `search` 추가 |
| `services/backend/src/modules/portfolios/service.ts` | `list`가 `q`로 제목을 거름 |
| `services/backend/src/modules/engagement/search.ts` (새로) | `UnifiedSearchService` |
| `services/backend/src/modules/engagement/{service,legacy-mysql-service,index,routes}.ts` | 옛 `search` 제거, 새 서비스 내보내기 · 라우트 연결 |
| `services/backend/src/api/{build-app,main}.ts` | `unifiedSearchService` 옵션 · 조립 |
| `services/backend/test/security/security-gate.test.ts` | 테스트 앱에 옵션 추가 |
| `services/backend/src/modules/engagement/search.integration.test.ts` (새로) | 실제 Mongo로 세 출처 검증 |
| `services/backend/src/modules/engagement/{mongo,engagement}.integration.test.ts` | 옛 `search` 검사 제거 |
| `services/web/src/lib/api/endpoints.ts` | 계약 응답 스키마 사용 |
| `services/web/src/components/CommandPalette.tsx` | 동작 줄 · 자리표시 글 |

## 작업 순서

1. 계약 수정 — `pnpm --filter @expresso/contracts build && pnpm --filter @expresso/contracts test`.
2. jobs `boardOrder` · `search`, portfolios `q` — 백엔드 타입 검사.
3. `UnifiedSearchService`와 조립, 옛 `search` 제거 — 백엔드 타입 검사 · 단위 테스트.
4. 통합 테스트 작성 — `pnpm test:infra`(engagement · jobs · portfolios).
5. 웹 엔드포인트 · 검색창 — 웹 타입 검사 · 테스트.
6. 개발 서버에서 검색창 확인.

## 가장 위험한 단계

2단계 `boardOrder` 추출. `JobBoardService.list`의 정렬이 바뀌면 공고 탐색 순서가 달라진다. 추출은 식을 옮기기만 하고, 기존 `jobs.integration.test.ts`의 정렬 · 근처 순서 검사로 확인한다. 깨지면 그 커밋을 되돌린다.

## 검증

```
pnpm typecheck
pnpm test
pnpm test:infra
```

화면: 개발 로그인 뒤 ⌘K → 회사 이름 입력 → 공고 묶음 확인 → ↓로 「공고 탐색에서 … 찾기」 → Enter → `/jobs?q=` 결과와 비교.
