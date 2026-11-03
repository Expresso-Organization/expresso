---
title: 커리어 편집기 옛 코드 정리 · 근거 블록 · 저장 상태 표시
slug: career-editor-cleanup
stage: spec
status: accepted
intent: .intent/intent_career-editor-cleanup.md
date: 2026-10-28
---

# 커리어 편집기 옛 코드 정리 · 근거 블록 · 저장 상태 표시 — 명세

`feat/career-blocknote`(PR #137) 위에 쌓습니다.

## 요구사항

- [ ] `services/web`에 `@tiptap/*` 직접 의존과 `editor/extensions.ts` · `SlashMenu.tsx` · `BlockHandle.tsx` · `SelectionToolbar.tsx`가 없다.
- [ ] `CareerEditorSession`에 v1 전송 경로(`updateDocument` · JSON Y.Map 업데이트)가 없다. bootstrap이 BlockNote가 아니면 `unavailable`이다.
- [ ] 세션의 `document`(v1 모양 사본)는 BlockNote 편집기가 바뀔 때마다 갱신된다(`publishDocument`). 패널 AI 영역이 이 값을 읽는다.
- [ ] `SaveState` 컴포넌트가 세션 상태를 「저장 중 · 저장됨 · 오프라인 · 충돌 확인 필요」로 보인다. 문서 패널 머리말과 전체 페이지에 쓴다.
- [ ] 공용 스키마에 `evidence` 커스텀 블록(prop `source`, inline 본문)이 있다. v1 `evidence` ↔ BlockNote 변환과 Markdown 내보내기(인용)가 된다.
- [ ] 슬래시 메뉴에서 콜아웃이 인용 항목과 같은 묶음 끝에 들어간다.

## 설계

- `packages/editor/src/blocknote.ts`: `createEvidenceBlockSpec` — 렌더는 `div[data-evidence]` 안에 편집 불가 출처 표시와 본문 영역을 둔다. 내보내기는 `blockquote`. 변환 표에 `evidence`를 더한다.
- `session/CareerEditorSession.ts`: v1 분기와 `encodeDocumentAsYUpdate` · `reconstructYDocument` · `encodeDocumentStateVector` 의존을 지운다. `publishDocument(document)`를 둔다.
- `session/useCareerEditorSession.ts`: `updateDocument`를 빼고 `publishDocument`를 내보낸다.
- 새 `editor/SaveState.tsx`: `useCareerEditorSession(recordId).snapshot.status`를 문구로. 같은 기록의 세션은 풀(pool)에서 하나라 추가 연결이 없다.
- `editor/CareerDocumentEditor.tsx`: BlockNote 경로만 남긴다. 세션이 아직 없으면 불러오는 중 표시. `onDocumentChange`가 `publishDocument`를 부른다. `mode="page"`일 때 본문 위에 `SaveState`.
- `editor/CareerDocumentEditor.module.css`: 옛 툴바 · 메뉴 클래스 제거.
- `DocumentPanel.tsx`: 머리말 「저장됨」 고정 문구를 `SaveState`로.

## 버린 대안

- 근거 블록 작성 화면까지 만들기: 근거를 만드는 기능이 지금 없어 출처를 고르는 대상(공고 · 기록)과 흐름을 새로 정해야 한다. 이번에는 보존만 한다.

## 함정

- `DocumentPanel.test.tsx` · `CareerDocumentEditor.test.tsx`의 세션 모의 객체 모양을 새 훅 반환값에 맞춘다.
- `browserRuntime.test.ts`는 `@expresso/editor`의 브라우저 동작 시험이라 남긴다.
- 2단계 세션이 `DocumentPanel.tsx`에 콜백 prop을 더할 수 있다. 머지 때 충돌은 머리말 한 줄 범위다.

## 완료 기준

```bash
pnpm typecheck
pnpm test
pnpm --filter @expresso/web build
```

화면: 패널 머리말 상태(API 정지 → 「오프라인」 → 재시작 → 「저장됨」), 전체 페이지 상태, 근거 블록이 든 기록 열기와 저장.
