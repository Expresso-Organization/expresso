---
title: 공고 상세 관심 공고 담기 · 해제
slug: job-interest-toggle
stage: plan
status: accepted
intent: .intent/intent_job-interest-toggle.md
spec: .intent/spec_job-interest-toggle.md
date: 2026-10-16
---

# 공고 상세 관심 공고 담기 · 해제 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/contracts/src/job-board.ts` | `JobInterestResponseSchema` · 타입 추가 (`job-board.ts`가 `job-market.ts`를 가져오므로 순환을 피해 이쪽) |
| `services/backend/src/modules/jobs/service.ts` | `deleteInterest`, `upsertInterest`가 `updatedAt` 반환 |
| `services/backend/src/modules/jobs/legacy-mysql-service.ts` | 같은 두 가지(MySQL) |
| `services/backend/src/modules/jobs/routes.ts` | DELETE 라우트, PUT 응답 계약 파싱 |
| `services/backend/src/modules/jobs/jobs.integration.test.ts` | 담기 → 교차 해제 → 해제 → 필터 0건 |
| `services/web/src/lib/api/endpoints.ts` | `jobs.saveInterest` · `jobs.removeInterest` |
| `services/web/src/lib/app-data.ts` | `watchedJobs` (cache) |
| `services/web/src/app/(app)/jobs/[jobId]/interest-actions.ts` | 새 파일 — 서버 액션 |
| `services/web/src/app/(app)/jobs/[jobId]/InterestButton.tsx` | 새 파일 — 낙관적 토글 버튼 |
| `services/web/src/app/(app)/jobs/[jobId]/InterestButton.test.tsx` | 새 파일 — 웹 테스트 |
| `services/web/src/app/(app)/jobs/[jobId]/page.tsx` | 버튼 자리 교체 |
| `services/web/src/app/(app)/jobs/[jobId]/page.module.css` | 실패 문구 한 줄 스타일 |
| `services/web/src/app/(app)/jobs/page.tsx` | 레일 조회를 `watchedJobs`로 |
| `services/web/src/components/shell/AppChrome.tsx` | 사이드바 관심 공고 출처 교체 |
| `services/web/src/components/shell/Sidebar.tsx` | `interestTotal` 속성 |
| `services/web/src/components/shell/Sidebar.module.css` | 관심 공고 grid 열을 목록 너비에 묶음 — 화면 확인에서 긴 이름이 점수를 밖으로 미는 것을 발견 |

## 작업 순서

1. 계약 → `pnpm --filter @expresso/contracts build` 통과.
2. 백엔드 서비스 두 개 · 라우트 → `pnpm --filter @expresso/backend typecheck`.
3. 통합 테스트 → `pnpm test:infra` 중 jobs 통합(mongodb) 통과.
4. 웹 endpoints · app-data · 액션 · 버튼 · 사이드바 → `pnpm --filter @expresso/web typecheck`.
5. 웹 테스트 → `pnpm --filter @expresso/web test`.
6. 워크트리 전용 DB · 포트로 API · 웹을 띄워 화면 확인.
7. 커밋 · 푸시 · PR.

## 가장 위험한 단계

`revalidatePath("/", "layout")`가 서버 액션 응답에서 레이아웃의 사이드바까지 다시 그리는지. 문서는 "보고 있는 화면을 바로 갱신"이라고만 적는다. 화면 확인에서 사이드바가 안 바뀌면 버튼에서 액션 뒤 `router.refresh()`를 부르는 쪽으로 바꾸고 이 계획을 고친다.

## 검증

```
pnpm typecheck
pnpm test
pnpm test:infra
```

화면: `/jobs/<id>` 머리 버튼 → 담기(아이콘 채움 · "관심 공고") → 사이드바 "관심 공고"에 그 공고 → `/jobs` 레일 · "관심 공고 N" → 상세로 돌아와 해제 → 사이드바 · 레일에서 빠짐.
