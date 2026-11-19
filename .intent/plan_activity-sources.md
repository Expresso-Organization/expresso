---
title: 공모전 · 해커톤 · 부트캠프 수집 출처 확장과 정확도 개선
slug: activity-sources
stage: plan
status: accepted
intent: .intent/intent_activity-sources.md
spec: .intent/spec_activity-sources.md
date: 2026-11-20
---

# 공모전 · 해커톤 · 부트캠프 수집 출처 확장과 정확도 개선 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/contracts/src/proposals.ts` | `bootcamp` · 활동 새 칸 · `offset` · `summary.total` |
| `packages/database/src/mongodb-migrations/0035/migration.ts` (새) | `activities` 규칙 확장 · 색인 · `activity_sources` |
| `packages/database/src/mongo-migrations.ts` · `schema.test.ts` | 0035 등록 |
| `packages/database/src/documents/proposals.ts` · `collections.ts` | `ActivityDoc` 새 칸 · `ActivitySourceDoc` |
| `services/backend/src/modules/activities/sources/*.ts` (새) | 어댑터 다섯 · `adapter.ts` · 시험 |
| `services/backend/src/modules/activities/dedupe.ts` (새) | 중복 묶기 순수 함수 · 시험 |
| `services/backend/src/modules/activities/service.ts` · `index.ts` · `wevity*.ts`(옮김) | 수집 · 목록 |
| `services/backend/src/modules/activities/service.integration.test.ts` | 출처 실패 · 숨김 · 중복 |
| `services/backend/src/modules/scheduling/service.ts` | 실패 출처 → `ActivityCollectError` |
| `services/backend/src/modules/proposals/{service,candidates,writer}.ts` | 새로 본 순 · 부트캠프 |
| `services/web/src/app/(app)/jobs/ExploreActivities.tsx` · `explore.module.css` · `explore.ts` | 부트캠프 목록 · 행 칸 · 더 보기 |
| `services/web/src/app/(app)/home/ProposalFeed.tsx` | 부트캠프 제목 |

## 작업 순서

1. 계약 · 문서 타입 · 마이그레이션 0035 — `pnpm --filter @expresso/database test` 통과, 로컬 복사 DB에 `pnpm db:migrate`.
2. 어댑터 다섯과 시험 — 저장한 실제 쪽(scratchpad)을 시험 고정 자료로 줄여 넣고 단위 시험 통과.
3. `dedupe.ts` — 측정한 4쌍 · 링커리어 5건이 묶이는 시험.
4. 서비스 수집 · 목록 · 예약 잡 — 통합 시험(출처 실패 → 잡 실패, 사라진 활동 숨김, 중복 숨김).
5. 제안(새로 본 순 · 부트캠프) — 기존 제안 시험 통과.
6. 웹 탐색 · 제안 카드 — 개발 서버에서 네 탭 확인.
7. 실제 출처로 로컬 수집 — 복사 DB에서 `activity_collect` 실행, 결과 확인.
8. 전체 검증 후 커밋 · PR.

## 가장 위험한 단계

4단계(수집이 실패를 던지는 순서). 성공한 출처 저장과 `#announce` 전에 던지면 새 활동 제안이 사라진다. 시험으로 "실패 출처가 있어도 성공 출처의 활동이 저장되고 announce가 불린다"를 고정한다. 되돌리기: 예약 잡 분기에서 throw 한 줄을 빼면 이전 동작(성공 + 결과 기록)이 된다. 마이그레이션은 규칙 확장만 하고 기존 값을 지우지 않는다.

## 검증

```
pnpm typecheck
pnpm test
pnpm test:infra
```

화면: 탐색 › 공모전 · 해커톤 · 부트캠프 탭, 홈 제안 카드. 데이터: 복사 DB의 `activities`(출처 · 종류별 수), `activity_sources`, `scheduled_job_runs`의 `activity_collect` 결과.
