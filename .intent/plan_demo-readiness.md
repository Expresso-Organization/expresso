---
title: 시연 전 제품 화면 결함 정리
slug: demo-readiness
stage: plan
status: draft
intent: .intent/intent_demo-readiness.md
spec: .intent/spec_demo-readiness.md
date: 2026-11-06
---

# 시연 전 제품 화면 결함 정리 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/backend/src/modules/jobs/mongo-queries.ts` | 마감 공고 기본 제외 |
| `services/backend/src/modules/jobs/board-service.ts` | 정렬 보조 키 `createdAt` |
| `services/backend/src/modules/jobs/board.integration.test.ts` | 기본 제외 · 관심 공고 · 정렬 시험 |
| `services/backend/src/modules/generation/service.ts` | 기본 제목 함수와 두 호출 지점 |
| `services/backend/src/modules/generation/generation.integration.test.ts` | 회사 기반 제목 시험 |
| `services/web/src/app/(auth)/SocialSignIn.tsx` | GitHub 버튼 제거 |
| `docs/Expresso Screens.dc.html` | 로그인 · 가입 화면의 GitHub 버튼 제거 |

## 작업 순서

1. 공고 목록 필터와 정렬을 고치고 시험을 더한다 — `board.integration.test.ts` 통과.
2. 기본 제목을 고치고 시험을 더한다 — `generation.integration.test.ts` 통과.
3. GitHub 버튼과 정의서를 고친다 — 웹 테스트 통과, 로컬 화면에 버튼 없음.
4. 전체 검증 후 PR을 올린다.

## 가장 위험한 단계

1단계. 패싯 전체의 개수가 바뀌므로 다른 통합 테스트가 깨질 수 있다. 깨지면 해당 시험의 전제를 확인하고, 제품 동작이 맞으면 시험 데이터를 고친다. 되돌릴 때는 `jobBoardFilter`의 기본 절만 지우면 된다.

## 검증

```
pnpm typecheck
pnpm test
pnpm test:infra
```

배포 뒤 운영 `/jobs` 첫 화면, `관심 공고` 목록, `/login`, `/signup`을 확인한다.
