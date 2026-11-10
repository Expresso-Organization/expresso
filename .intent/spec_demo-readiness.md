---
title: 시연 전 제품 화면 결함 정리
slug: demo-readiness
stage: spec
status: draft
intent: .intent/intent_demo-readiness.md
date: 2026-11-06
---

# 시연 전 제품 화면 결함 정리 — 명세

## 요구사항

- [ ] `deadline`과 `interested`를 주지 않은 `GET /v1/jobs/postings`는 `expiresAt`이 지난 공고를 `data` · `total` · 칩 개수에서 뺀다.
- [ ] `interested=true`면 마감 공고도 나온다. `deadline`을 주면 그 값이 우선한다.
- [ ] 정렬은 `sortKey` → `createdAt` 내림차순(마감 순은 오름차순) → `_id` 순이다. 가까운 곳 정렬도 같은 보조 키를 쓴다.
- [ ] 새 포트폴리오 제목은 `brew.title` → `brew.freeTitle` → `<회사명> 지원 포트폴리오` → `새 포트폴리오` 순서로 정한다.
- [ ] `SocialSignIn`에 GitHub 버튼이 없고, 화면 정의서의 로그인 · 가입 화면도 같다.

## 설계

- `services/backend/src/modules/jobs/mongo-queries.ts`의 `jobBoardFilter`에 기본 절을 더한다. 기존 `deadline` 분기는 `skip !== "category"` 안에 있어 칩 집계에서 빠지므로, 기본 절은 그 밖에 둔다. 모든 패싯이 같은 범위를 센다. `deadline: "open"`의 조건을 재사용한다.
- `services/backend/src/modules/jobs/board-service.ts`의 `order`에 `createdAt`을 보조 키로 넣는다.
- 제목을 정하는 함수를 `services/backend/src/modules/generation/portfolio-title.ts`에 두고 `service.ts`에서 포트폴리오를 만드는 두 지점이 쓴다. 조회 경로는 `#subject`와 같다(브루 → 분석 → 공고 → 회사). 트랜잭션 `options`를 넘긴다.
- `SocialSignIn`의 GitHub 버튼은 PR #118에서 이미 지웠다. `docs/Expresso Screens.dc.html`의 해당 버튼만 지운다.

## 버린 대안

- 웹이 기본으로 `deadline=open`을 보내는 방법: 다른 API 소비자는 그대로 마감 공고를 받게 되어 서버 기준이 갈린다.
- 제목에 공고명을 넣는 방법: 공고명에 이미 회사명이 든 경우가 많고(`[쿠팡] ...`), 홈 카드가 공고명을 따로 보여 준다.
- 기존 제목 마이그레이션: 사용자가 쓰던 값과 구별할 수 없고 시연 계정에는 필요 없다.

## 함정

- `legacy-mysql-board-service`는 운영 경로가 아니라 바꾸지 않는다.
- `board.integration.test.ts`와 다른 통합 테스트에 마감 공고가 목록에 나온다고 가정한 곳이 있을 수 있다.
- `generation.integration.test.ts`는 `freeTitle`을 `Generated portfolio`로 넘기므로 영향이 없다.

## 완료 기준

`pnpm typecheck`, `pnpm test`, `pnpm test:infra`가 통과한다. 운영 배포 뒤 `/jobs` · `/login`을 화면에서 확인한다.
