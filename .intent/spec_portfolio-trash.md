---
title: 포트폴리오 · 만들던 포트폴리오 휴지통
slug: portfolio-trash
stage: spec
status: accepted
intent: .intent/intent_portfolio-trash.md
date: 2026-11-10
---

# 포트폴리오 · 만들던 포트폴리오 휴지통 — 명세

## 요구사항

- [ ] `DELETE /v1/portfolios/:id`는 `deletedAt`과 `purgeAfter`(+30일)를 쓰고, `status`가 `published`면 같은 갱신에서 `unlisted`로 바꾼다. 204. 이미 휴지통이면 404.
- [ ] `POST /v1/portfolios/trash/:id/restore`는 `purgeAfter`가 지나지 않은 휴지통 포트폴리오의 `deletedAt` · `purgeAfter`를 비운다. `status`는 그대로 둔다. 204.
- [ ] `GET /v1/portfolios/trash`는 보관 중인 포트폴리오를 최근에 지운 순서로 낸다(`PortfolioTrashListResponseSchema`).
- [ ] `DELETE /v1/brews/:id` · `POST /v1/brews/trash/:id/restore` · `GET /v1/brews/trash`도 같은 규칙이다. `status: "generating"`이면 409.
- [ ] 휴지통 포트폴리오는 `portfolios.list` · `get` · `revisions`, 홈 읽기 모델(`engagement.home`), 통합 검색, 배포 · 되돌리기 · 이력서 교체, 공개 주소 조회, 방문 수집에서 없는 것으로 다룬다.
- [ ] 휴지통 제작은 홈 읽기 모델, 공고 화면의 제작 상태(`jobs/board-service`), 제작 단계 API(재료 · 질문 · 레시피 · 생성 시작 · 작업 · 회사 조사 · 디자인 선택)에서 없는 것으로 다룬다.
- [ ] 예약 작업 `retention`이 `purgeAfter`가 지난 포트폴리오와 제작을 지운다. 포트폴리오를 가리키는 지면 · 섹션 · 블록 · 기록 인용 · 배포 · 방문 원시 · 집계 · 대시보드 · 위젯 · 스냅숏 · 수정 제안 · 이력을 함께 지운다. 크레딧 원장(`generation_usage_ledger`, `generation_jobs`, `usage_counters`, `ai_usage_events`)은 지우지 않는다.
- [ ] 제작 영구 삭제는 그 제작을 가리키는 포트폴리오가 하나라도 남아 있으면(휴지통 포함) 건너뛴다.
- [ ] 웹: 홈 카드와 편집기 도구 막대의 「…」 → 확인 창 → 휴지통. 홈 「내 포트폴리오」 머리의 「휴지통」 창에서 복원.
- [ ] 확인 창 문구 — 포트폴리오: 공개 중이면 "공개 주소가 바로 닫힙니다. 되살려도 다시 배포해야 열립니다.", 그리고 "30일 동안 휴지통에서 되살릴 수 있습니다. 그 뒤에는 지면 · 배포 기록 · 방문 데이터가 함께 지워집니다." 만들던 포트폴리오: "30일 동안 휴지통에서 되살릴 수 있습니다. 그 뒤에는 답변 · 레시피가 함께 지워집니다."

## 설계

재사용하는 것:
- 기록 휴지통의 모양: `deletedAt` · `purgeAfter` 필드, 30일(`30 * 86_400_000`), 복원 조건 `purgeAfter > now`, `retention` 작업에서 하나씩 정리(`purgeTrashedCareerRecord`).
- 공개 중단은 `status: "unlisted"`로만 표시된다(`publishing/service.ts`의 `unpublish`). 같은 갱신을 휴지통 이동에 넣는다.
- 웹 휴지통 창은 커리어 `TrashDialog`의 모양(목록 · 지운 날짜 · 남은 날 · 복원)을 따르고, 확인 창은 `@/components/ui/dialog`를 쓴다. 「…」 메뉴는 버튼 + 고정 위치 메뉴(`AnchoredMenu`와 같은 동작)다.
- 마이그레이션은 없다. 두 컬렉션 검증 규칙에 `additionalProperties`가 없고, `{ deletedAt: null }`은 필드가 없는 문서도 맞춘다. 문서 타입(`PortfolioDoc` · `BrewDoc`)에만 두 필드를 더한다.

새로 만드는 것:
- 계약: `TrashedPortfolioSchema`(`id` · `title` · `status` · `deletedAt` · `purgeAfter`), `PortfolioTrashListResponseSchema`, `TrashedBrewSchema`(`id` · `title` · `status` · `deletedAt` · `purgeAfter`), `BrewTrashListResponseSchema`.
- 백엔드 `portfolios/trash.ts`(`PortfolioTrashService`: `trash` · `restore` · `list`, `purgeTrashedPortfolio`)와 `portfolios/trash-routes.ts`. `materials/trash.ts`(`BrewTrashService`, `purgeTrashedBrew`)와 `materials/trash-routes.ts`. 기존 `PortfolioReadApi` · `MaterialsApi`는 MySQL 구현에서 타입을 따오므로 넓히지 않고, `build-app`에 선택 옵션 `portfolioTrashService` · `brewTrashService`를 더한다.
- 영구 삭제는 `account-lifecycle/mongo-purge.ts`처럼 컬렉션 이름 목록을 돈다. 먼저 자식 id를 모은다(섹션 → 블록, 배포 → 방문 이벤트, 대시보드). 그다음 `{ userId, $or: [portfolioId, deploymentId ∈, portfolioSectionId ∈, blockId ∈, visitEventId ∈, dashboardViewId ∈] }`로 목록의 컬렉션을 지우고 포트폴리오 문서를 마지막에 지운다. 한 트랜잭션.
- 읽기 필터는 위 요구사항의 자리에만 `deletedAt: null`을 더한다.
- 웹 `app/(app)/home/trash-actions.ts`(서버 액션), `features/portfolio-trash/`(`CardMenu` · `PortfolioTrashConfirm` · `PortfolioTrashDialog`), `HomePortfolios` 카드에 메뉴, 편집기 도구 막대에 메뉴.

## 버린 대안

- 바로 영구 삭제: 사용자가 30일 휴지통을 골랐다.
- 모든 소유 확인(약 35곳)에 필터를 넣기: 편집 화면이 `portfolios.get`의 404로 열리지 않으면 나머지(`page` · `layout` · 분석 대시보드)는 화면에서 닿지 않는다. 휴지통 항목이 다시 보이거나 다시 공개될 수 있는 자리만 막는다.
- 포트폴리오를 지울 때 그 제작도 함께 지우기: 「다시 뽑기」가 같은 제작으로 새 포트폴리오를 만들므로 한 제작이 여러 포트폴리오를 가진다.

## 함정

- `POST /v1/portfolios/:id/restore`는 편집 모듈의 스냅숏 되돌리기가 이미 쓴다. 휴지통 되살리기는 `/trash/:id/restore` 아래에 둔다(`build-app.test.ts`가 두 모듈을 함께 등록해 본다).
- `publicSlug`는 휴지통에 있는 동안 그 포트폴리오가 가진다. 배포의 주소 점유 검사가 다른 포트폴리오에 같은 주소를 주지 않는다. 영구 삭제 뒤에 풀린다.
- `page` · `layout` · 분석 대시보드의 소유 확인은 휴지통 포트폴리오도 통과한다. 화면에서는 닿지 않는다.
- 휴지통 제작을 쓰는 포트폴리오의 「다시 뽑기」는 제작 화면이 404가 된다.
- 생성 작업이 도는 중인 제작을 옮기면 작업이 휴지통 제작에 포트폴리오를 만들 수 있어 409로 막는다.
- 기록 인용(`record_usages`)을 지우면 그동안 인용 때문에 정리를 건너뛴(409) 휴지통 기록이 다음 정리에서 지워진다.
- 스냅숏 조각(`snapshot_chunks`)은 포트폴리오를 가리키는 필드가 없어 지우지 않는다.

## 완료 기준

- `pnpm typecheck`, `pnpm test`, `pnpm test:infra` 통과.
- 통합 테스트: 포트폴리오를 옮기면 목록 · 홈 · 검색 · 상세에서 빠지고, 공개 주소 조회와 배포가 404다. 복원하면 목록에 돌아온다. 기한이 지난 포트폴리오를 정리하면 딸린 컬렉션이 비고 크레딧 원장은 남는다. 생성 중인 제작은 409. 인용 중인 제작은 정리를 건너뛴다.
- 브라우저: 홈 카드 메뉴로 옮기기 → 휴지통 창에서 복원, 편집기 메뉴로 옮기기 → 홈 이동, 만들던 포트폴리오 카드 옮기기.
