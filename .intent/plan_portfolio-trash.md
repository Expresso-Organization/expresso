---
title: 포트폴리오 · 만들던 포트폴리오 휴지통
slug: portfolio-trash
stage: plan
status: accepted
intent: .intent/intent_portfolio-trash.md
spec: .intent/spec_portfolio-trash.md
date: 2026-11-10
---

# 포트폴리오 · 만들던 포트폴리오 휴지통 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/database/src/documents/generation.ts` · `brew.ts` | `PortfolioDoc` · `BrewDoc`에 `deletedAt?` · `purgeAfter?` (고침) |
| `packages/contracts/src/portfolios.ts` · `materials.ts` · `openapi.ts` | 휴지통 항목 · 목록 계약 (고침) |
| `services/backend/src/modules/portfolios/trash.ts` · `trash-routes.ts` · `index.ts` | 포트폴리오 휴지통 서비스 · 라우트 · 영구 삭제 (새 파일 둘, 고침) |
| `services/backend/src/modules/materials/trash.ts` · `trash-routes.ts` · `index.ts` | 제작 휴지통 서비스 · 라우트 · 영구 삭제 (새 파일 둘, 고침) |
| `services/backend/src/api/build-app.ts` · `main.ts` | 선택 옵션과 라우트 등록 (고침) |
| `services/backend/src/modules/scheduling/service.ts` | `retention`에 포트폴리오 · 제작 정리 (고침) |
| `services/backend/src/modules/{portfolios,engagement,publishing,analytics}/service.ts` | 포트폴리오 읽기 필터 (고침) |
| `services/backend/src/modules/{materials,interview,recipe,brew-jobs,generation,company-research,design-systems}/service.ts` · `jobs/board-service.ts` | 제작 읽기 필터 (고침) |
| `services/backend/src/modules/portfolios/trash.integration.test.ts` | 휴지통 · 필터 · 정리 통합 테스트 (새 파일) |
| `services/web/src/lib/api/endpoints.ts` | 휴지통 엔드포인트 (고침) |
| `services/web/src/app/(app)/home/trash-actions.ts` | 옮기기 · 복원 · 목록 서버 액션 (새 파일) |
| `services/web/src/features/portfolio-trash/*` | 카드 메뉴 · 확인 창 · 휴지통 창 · 스타일 · 테스트 (새 파일) |
| `services/web/src/app/(app)/home/HomePortfolios.tsx` · `page.module.css` | 카드 메뉴와 머리 「휴지통」 (고침) |
| `services/web/src/app/(app)/edit/[portfolioId]/Editor.tsx` | 도구 막대 메뉴 (고침) |

## 작업 순서

1. 문서 타입 · 계약 — `pnpm --filter @expresso/contracts test` 통과.
2. 포트폴리오 휴지통 서비스 · 라우트 · 영구 삭제 — 통합 테스트의 옮기기 · 복원 · 정리 통과.
3. 제작 휴지통 서비스 · 라우트 · 영구 삭제 — 통합 테스트의 409 · 건너뛰기 통과.
4. 읽기 필터와 `retention` 연결 — 통합 테스트의 목록 · 홈 · 검색 · 공개 주소 · 배포 확인 통과.
5. 웹 엔드포인트 · 서버 액션 · 메뉴 · 확인 창 · 휴지통 창 — 웹 단위 테스트 통과.
6. 검증 — 아래 명령과 브라우저 확인.

## 가장 위험한 단계

2단계의 영구 삭제. 컬렉션 목록과 `$or` 조건이 넓으면 다른 포트폴리오의 데이터나 크레딧 원장을 지울 수 있다. 모든 조건에 `userId`를 걸고, 자식 id는 이 포트폴리오에서 모은 것만 쓰고, 통합 테스트에서 같은 사용자의 다른 포트폴리오 데이터와 원장이 남는지 확인한다. 깨지면 `retention`에서 정리 호출만 빼고(휴지통 · 복원은 남긴다) 배포한다.

## 검증

```
pnpm typecheck
pnpm test
pnpm test:infra
```

브라우저(`expresso_delete_actions` 복사본 · 웹 3232 · API 4232):
- 홈 초안 카드 「…」 → 옮기기 → 카드 · 사이드바에서 빠짐 → 「휴지통」 창 → 복원.
- 편집기 「…」 → 옮기기 → 홈 이동 → 그 편집 주소는 「찾을 수 없음」.
- 만들던 포트폴리오 카드 옮기기 → 복원.
