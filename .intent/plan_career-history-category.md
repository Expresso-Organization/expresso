---
title: 커리어 기록 변경 이력 · 복원과 카테고리 추가
slug: career-history-category
stage: plan
status: accepted
intent: .intent/intent_career-history-category.md
spec: .intent/spec_career-history-category.md
date: 2026-10-28
---

# 커리어 기록 변경 이력 · 복원과 카테고리 추가 — 구현 계획

브랜치 `feat/career-history-category`, 워크트리 `.worktree/career-history`.

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/backend/src/modules/career-editor/service.ts` (+ `service.test.ts`) | 10분 단위 「편집」 이력 |
| 새 `services/web/src/app/api/career/records/[recordId]/revisions/route.ts` | 이력 조회 프록시 |
| 새 `services/web/src/app/api/career/records/[recordId]/revisions/[revisionId]/restore/route.ts` | 복원 프록시 |
| 새 `services/web/src/features/career-editor/history/RevisionHistory.tsx` · `.module.css` (+ test) | 이력 목록 · 복원 |
| `services/web/src/features/career-editor/editor/CareerDocumentEditor.tsx` · `.module.css` | 본문 위 줄 |
| `services/web/src/app/api/career/categories/route.ts` | `POST` 프록시 |
| `services/web/src/components/shell/SidebarCategories.tsx` · `Sidebar.module.css` (+ test) | 카테고리 추가 입력 |
| `services/web/src/components/shell/Sidebar.tsx` | 「내 커리어」 머리말을 `SidebarCategories`로 옮겨 머리말 `+`도 같은 입력을 연다 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 백엔드 편집 이력 — 서비스 시험(10분 안 두 번째 저장은 이력 없음) 통과.
2. 프록시 두 개와 `RevisionHistory` — 웹 시험 통과.
3. 카테고리 추가 — 웹 시험 통과.
4. 검증 서버 화면 확인과 전체 검증.

## 가장 위험한 단계

1번이다. 이력 스냅샷을 만드는 중 실패하면 저장 응답까지 실패하면 안 된다. ack를 보낸 뒤 따로 실행하고 실패는 삼킨다. 시험으로 고정한다.

## 검증

```bash
pnpm typecheck
pnpm test
pnpm test:infra
pnpm --filter @expresso/web build
```
