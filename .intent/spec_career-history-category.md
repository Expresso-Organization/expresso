---
title: 커리어 기록 변경 이력 · 복원과 카테고리 추가
slug: career-history-category
stage: spec
status: accepted
intent: .intent/intent_career-history-category.md
date: 2026-10-28
---

# 커리어 기록 변경 이력 · 복원과 카테고리 추가 — 명세

`feat/career-editor-cleanup` 위에 쌓습니다.

## 요구사항

- [ ] `appendUpdate`가 BlockNote 기록에서 마지막 「편집」 이력이 10분보다 오래됐거나 없으면, 현재 상태 스냅샷과 「편집」 이력(`actor: "user"`)을 남긴다. 사용자 응답(ack)을 늦추지 않는다.
- [ ] 웹 프록시 `GET /api/career/records/:id/revisions`, `POST /api/career/records/:id/revisions/:revisionId/restore`가 계약으로 응답을 파싱한다.
- [ ] 편집기 본문 위에 「이력」 단추가 있고, 열면 시점 목록과 시각, 「복원」이 있다. 복원은 현재 문서 버전을 `expectedVersion`으로 보낸다. 409이면 목록을 다시 불러온다.
- [ ] 사이드바 「카테고리 추가」가 이름 입력 칸으로 바뀌고 Enter로 `POST /api/career/categories`를 부른다. 키는 `custom_` + 8자리 16진수, 아이콘 `folder`, 기본 뷰 `table`이다. 만든 뒤 `/career/{key}`로 이동하고 화면을 새로 읽는다. Escape는 취소다.

## 설계

- 백엔드 `career-editor/service.ts`: `recordEditRevision(userId, recordId)`를 ack 뒤에 기다리지 않고 부른다. 실패는 무시한다(이력은 보조 기능). 스냅샷은 `captureBlockNoteSnapshot`을 쓴다.
- 웹 새 `features/career-editor/history/RevisionHistory.tsx`(+ CSS Module): 열 때 목록을 불러온다. 항목 이름은 `actor`와 `summary`로 정한다(`ai` → 「AI 적용 전」, 「리비전 복원」 → 「복원」, 「편집」 → 「편집」, 나머지는 `summary`).
- `CareerDocumentEditor.tsx`: 본문 위 줄에 `SaveState`(전체 페이지) · `RevisionHistory`(두 모드).
- 웹 `app/api/career/categories/route.ts`에 `POST`를 더한다. `SidebarCategories.tsx`의 추가 항목을 입력 칸으로 바꾼다.

## 버린 대안

- 저장할 때마다 이력 남기기: 300ms 묶음마다 스냅샷이 쌓여 목록과 저장 공간이 커진다.

## 함정

- 복원 요청이 사용자의 미확인 업데이트와 겹치면 버전이 맞지 않아 409다. 이때 「저장 중」이 끝난 뒤 다시 누르면 된다.
- 사이드바 카테고리 목록은 서버 컴포넌트가 세션에서 읽으므로 `router.refresh()`가 필요하다.

## 완료 기준

```bash
pnpm typecheck
pnpm test
pnpm test:infra
pnpm --filter @expresso/web build
```

화면: 기록 고치기 → 「이력」 → 「편집」 항목 → 복원 → 본문 즉시 변경. 「카테고리 추가」 → 이름 → Enter → 새 카테고리 화면.
