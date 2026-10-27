---
title: AI 사용량 계측과 사용량 기준 요금제
slug: plans-billing
stage: plan
status: accepted
intent: .intent/intent_plans-billing.md
spec: .intent/spec_plans-billing.md
date: 2026-10-27
---

# AI 사용량 계측과 사용량 기준 요금제 — 구현 계획

## 바뀌는 파일

### 계약 · 스키마

| 파일 | 무엇을 |
|---|---|
| `packages/contracts/src/usage.ts` | 신규 — 사용량 요약 · 추이 · 집계 스키마 |
| `packages/contracts/src/index.ts` | 내보내기 |
| `packages/database/src/documents/generation.ts` | `AiUsageEventDoc` 신설 |
| `packages/database/src/documents/identity.ts` | `PlanDoc` — `monthlyCredits` · `displayName` · `monthlyPriceKrw` · `sortOrder` 추가, `generationQuota` 삭제 |
| `packages/database/src/collections.ts` | `aiUsageEvents` 등록 |
| `packages/database/src/mongodb-migrations/0021/migration.ts` | 신규 — 컬렉션 · 인덱스 · 플랜 세 건 갱신 |
| `packages/database/src/mongo-migrations.ts` | 0021 등록 |
| `packages/database/src/migrations.test.ts` | 개수 15 → 16 |
| `packages/database/src/mongo-build.mjs` | dist에 0021 원본을 복사 — 체크섬이 dist에서 원본을 읽는다 |
| `packages/database/src/schema.test.ts` | 적용 목록에 0021 · `generationQuota` 대신 `monthlyCredits` |
| `services/backend/src/platform/outbox.integration.test.ts` | 같은 교체 |

### 계측

| 파일 | 무엇을 |
|---|---|
| `services/backend/src/platform/ai/client.ts` | `AiCallOptions.userId` 추가 |
| `services/backend/src/platform/ai/usage-sink.ts` | 신규 — 싱크 인터페이스 |
| `services/backend/src/platform/ai/metered.ts` | 신규 — `MeteredAiClient` |
| `services/backend/src/platform/ai/metered.test.ts` | 신규 |
| `services/backend/src/platform/ai/create-client.ts` | 싱크를 받아 감싸기 |
| `services/backend/src/modules/*/{writer,planner,generator,…}.ts` 14곳 | `userId` 넘기기 |
| `services/backend/src/api/main.ts` · `worker/main.ts` | 싱크 연결 |

### 한도 · 읽기

| 파일 | 무엇을 |
|---|---|
| `services/backend/src/modules/entitlements/service.ts` | 크레딧 집계로 판단 |
| `services/backend/src/modules/entitlements/public.ts` | 크레딧 환산 함수 |
| `services/backend/src/modules/entitlements/{service,entitlements.integration}.test.ts` | 크레딧 기준으로 다시 |
| `services/backend/src/modules/generation/mongo-usage.ts` | 한도 판단을 걷어내고 생성 횟수만 센다 |
| `services/backend/src/modules/usage/{index,service,routes}.ts` | 신규 — 월 사용량 집계 |
| `services/backend/src/modules/usage/usage.integration.test.ts` | 신규 |
| `services/backend/src/modules/usage/routes.ts` | `GET /v1/me/usage` · `GET /v1/plans` |
| `services/backend/src/platform/agent/runtime.ts` | 에이전트 채팅은 `AiClient`를 지나지 않는다. 결과 메시지의 `modelUsage`를 모델마다 남긴다 |
| `services/backend/src/modules/generation/service.ts` | 한도 판단을 `submit`으로 — 완료 시점에서 다시 막으면 토큰을 쓴 지면을 버린다 |
| `services/backend/src/modules/*/legacy-mysql-service.ts` 8곳 | 타입 검사를 지나도록 `userId`를 넘긴다 |

### 화면

| 파일 | 무엇을 |
|---|---|
| `services/web/src/lib/api/endpoints.ts` | `usage` 클라이언트 |
| `services/web/src/lib/usage-copy.ts` | 신규 — 계약 코드 → 한글 이름 |
| `services/web/src/app/(app)/account/UsageCharts.tsx` | 신규 — 추이 · 기능별 · 모델별 |
| `services/web/src/app/(app)/account/page.tsx` | 사용량 구획 교체, 요금제 · 결제 구획 추가 |
| `services/web/src/app/(app)/account/AccountNav.tsx` | 목록에 두 항목 |
| `services/web/src/app/(app)/account/loading.tsx` | 세 구획 대기 모양 |
| `services/web/src/app/(app)/account/page.module.css` | 차트 · `.plan*` · `.billing*` |
| `services/web/src/styles/tokens.css` | `--ex-chart-1`~`4` 역할 토큰 · 두 어두운 지면 블록 |
| `services/web/src/components/shell/{Sidebar,SidebarSkeleton}.tsx` | 「이번 달 크레딧」 |
| `services/web/src/app/(app)/jobs/page.tsx` | 같은 문구 |
| `services/web/src/app/(app)/brew/[brewId]/materials/MaterialPicker.tsx` | 칸 → 비율 막대 · 문구 |
| `services/web/src/app/(app)/edit/[portfolioId]/Editor.tsx` | 「생성 1회」 문구 |
| `services/web/src/app/(app)/brew/{new,[brewId]/design}/*-actions.ts` | 한도 소진 문구를 크레딧으로 |
| `services/web/src/app/(app)/account/UsageCharts.tsx` | 날짜별 쌓은 막대 · 기능별 · 모델별 |
| `services/web/src/lib/sample/site.ts` | `ACCOUNT` 삭제 — 요금제는 `GET /v1/plans`, 결제 줄은 현재 플랜에서 만든다 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 계약 `usage.ts`를 쓴다. — `pnpm --filter @expresso/contracts typecheck` 통과.
2. 문서 타입 · 컬렉션 · 마이그레이션 0021을 쓴다. —
   `pnpm db:migrate`가 `applied 0021_ai_usage_and_plan_credits`를 찍고
   `pnpm --filter @expresso/database test` 통과.
3. `AiUsageSink` · `MeteredAiClient`를 쓰고 `createAiClient`에 연결한다. —
   `metered.test.ts`에서 성공·실패 양쪽에 기록이 남고, 기록이 던져도 호출 결과가
   그대로 나온다.
4. 호출 지점 14곳에 `userId`를 넘긴다. — `git grep -n "\.complete("`의 모든 줄에
   `userId`가 있거나, 없는 이유가 주석에 있다.
5. `entitlements`를 크레딧 기준으로 바꾸고 테스트를 다시 쓴다. — 한도 아래에서
   `ENTITLED`, 넘기면 `QUOTA_EXHAUSTED`, 무제한 플랜은 `limit: null`.
6. `usage` 모듈과 라우트를 쓴다. — 통합 테스트에서 사건 몇 건을 넣고 요약 · 추이 ·
   계약별 · 모델별 집계가 맞는지 본다.
7. 웹 클라이언트 · 문구 표 · 사용량 구획을 쓴다. — 타입 검사 통과.
8. 요금제 · 결제 구획과 CSS를 더한다.
9. 검증을 돌린다.

1–6단계와 7–8단계는 커밋을 나눈다. 리뷰가 뒷단과 화면을 따로 볼 수 있다.

## 가장 위험한 단계

5단계다. 한도 판단을 바꾸는 일이라 틀리면 두 방향 모두 나쁘다. 환산을 잘못해
크레딧이 크게 잡히면 모든 계정이 첫 생성에서 막히고, 작게 잡히면 한도가 사라진다.

막는 방법 — 환산 함수를 `public.ts`에 따로 두고 단위 테스트를 먼저 쓴다. 측정한
평균 생성(235,000 토큰)이 23.5 크레딧으로 나오는지, 무료 플랜 100으로 네 번까지
통과하고 다섯 번째에 막히는지 그 테스트에서 확인한다.

되돌리기 — `entitlements/service.ts`만 `origin/main`에서 되돌리면 횟수 기준으로
돌아간다. 그때 `plans.generationQuota`가 이미 지워져 있으므로 마이그레이션 0021도
함께 되돌려야 한다. 두 되돌리기는 한 쌍이다.

두 번째 위험은 4단계다. `userId`를 빠뜨린 호출은 타입 검사를 통과하고 조용히
`null`로 쌓인다. 그 계정의 사용량이 적게 잡혀 한도를 넘지 않는다. 4단계 확인을
눈으로 한 줄씩 한다.

## 검증

```
pnpm typecheck
pnpm test
pnpm test:infra
```

백엔드와 스키마를 고치므로 `test:infra`를 반드시 돌린다.

화면 확인 — 워크트리에 `services/backend/.env`를 만들고 `MONGODB_DATABASE` ·
`QUEUE_PREFIX`를 이 워크트리 전용 값으로 둔다. `AI_PROVIDER=fixture`로 API와
워커를 띄운다(실제 키 없이 호출이 돌고 사용량이 쌓인다). 웹은
`plans.localhost:<포트>`로 연다.

1. 생성을 한 번 돌린다 — 설정 사용량 구획에 크레딧이 잡힌다.
2. 날짜별 추이에 오늘 한 점, 기능별 · 모델별 막대에 방금 쓴 계약과 모델이 선다.
3. 요금제 구획 — Single Shot에 「사용 중」, 월 100 크레딧.
4. 결제 구획 — 내역 줄, 누를 수 있는 것 없음.
5. 한도를 넘긴 계정으로 편집 화면과 배포 화면이 열린다.
6. 밝은 지면 · 어두운 지면 모두 토큰 색으로 그려진다.
