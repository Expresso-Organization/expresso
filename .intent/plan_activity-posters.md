---
title: 활동 포스터 카드 그리드
slug: activity-posters
stage: plan
status: accepted
date: 2026-11-20
---

# 활동 포스터 카드 그리드 — 계획

## 순서와 파일

1. **계약 · 스키마** — `packages/contracts/src/proposals.ts`(`ActivitySchema.poster`), `packages/database/src/documents/proposals.ts`(`ActivityDoc.poster`, `ActivityPosterDoc`), `collections.ts`(`activityPosters`), `mongodb-migrations/0039/migration.ts`, `mongo-migrations.ts`, `schema.test.ts`(컬렉션 수).
2. **수집기** — `sources/adapter.ts`(`posterUrl`), `linkareer.ts` · `wevity.ts` · `contestkorea.ts` · `devevent.ts` · `boottent.ts`, `sources.test.ts` · `wevity.test.ts`.
3. **보관 · 내보내기** — `modules/activities/posters.ts`(새), `service.integration.test.ts`(보관 · 다시 받지 않음 · 주소가 없어져도 남김 · 받기 실패), `service.ts`(`collect`에서 호출, `activityView`의 `poster`, `poster(id)`), `routes.ts`(포스터 경로), `index.ts`.
4. **화면** — `services/web/src/components/ui/Masonry.tsx`(새), `app/(app)/jobs/ActivityWall.tsx`(새, 카드 포함), `explore.module.css`(목록 줄 규칙을 카드 규칙으로 바꿈), `ExploreActivities.tsx`, `explore.ts`(이니셜). 포스터 없는 카드의 이니셜은 공고 목록의 `.avatar`를 쓴다.
5. **검증** — `pnpm typecheck` · `pnpm test` · `pnpm test:infra`(백엔드). 로컬 검증 DB에 실제 수집 1회 → 포스터 수 · 두 번째 수집에서 다시 받지 않음 확인. 웹은 데스크톱 · 390px에서 화면 확인과 그림이 늦게 올 때 높이 유지 확인.

## 위험

- 콘테스트코리아(29) · Dev-Event(19) 상세 요청과 첫 수집의 그림 1,200여 장으로 첫 수집이 몇 분 걸린다. 두 번째부터는 새 그림만 받는다.
- 보관 용량: 그림 한 장 30~60KB, 1,200장이면 수십 MB가 Mongo에 든다. 마감이 지난 활동의 포스터는 지우지 않는다(정리는 범위 밖).
