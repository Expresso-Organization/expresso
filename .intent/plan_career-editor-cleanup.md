---
title: 커리어 편집기 옛 코드 정리 · 근거 블록 · 저장 상태 표시
slug: career-editor-cleanup
stage: plan
status: accepted
intent: .intent/intent_career-editor-cleanup.md
spec: .intent/spec_career-editor-cleanup.md
date: 2026-10-28
---

# 커리어 편집기 옛 코드 정리 · 근거 블록 · 저장 상태 표시 — 구현 계획

브랜치 `feat/career-editor-cleanup`, 워크트리 `.worktree/career-editor-cleanup`. PR #137이 머지되면 `main` 기준으로 맞춘다.

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/editor/src/blocknote.ts` (+ test) | `evidence` 블록과 변환 |
| `services/backend/src/modules/career-editor/blocknote-document.test.ts` | 근거 블록 Markdown 내보내기 |
| `services/web/src/features/career-editor/session/CareerEditorSession.ts` (+ test) | v1 경로 제거, `publishDocument` |
| `services/web/src/features/career-editor/session/useCareerEditorSession.ts` | 반환값 정리 |
| 새 `services/web/src/features/career-editor/editor/SaveState.tsx` | 저장 상태 문구 |
| `services/web/src/features/career-editor/editor/CareerDocumentEditor.tsx` (+ test, `.module.css`) | BlockNote 경로만, 전체 페이지 상태 |
| `services/web/src/features/career-editor/editor/BlockNoteBody.tsx` | 슬래시 메뉴 묶음 |
| 지움: `editor/extensions.ts` (+ test) · `SlashMenu.tsx` · `BlockHandle.tsx` · `SelectionToolbar.tsx` (+ test) | 옛 편집기 |
| `services/web/src/app/(app)/career/[categorySlug]/DocumentPanel.tsx` (+ test) | 머리말 `SaveState`, AI 영역 최신 문서 |
| `services/web/package.json` · `pnpm-lock.yaml` | `@tiptap/*` 제거 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 근거 블록과 변환 시험 — editor · backend 시험 통과.
2. 세션 v1 제거와 `publishDocument` — 세션 시험 통과.
3. `SaveState` · 편집기 정리 · 패널 머리말 — 웹 시험 · 타입 검사 통과.
4. 옛 파일 · Tiptap 의존 제거 — `pnpm install` 뒤 타입 검사 · build 통과.
5. 검증 서버 화면 확인.

## 가장 위험한 단계

4번이다. 다른 화면이 Tiptap을 쓰면 build가 깨진다. 지우기 전에 `@tiptap` 가져오기를 저장소 전체에서 다시 찾는다. 깨지면 의존 제거 커밋만 되돌린다.

## 검증

```bash
pnpm typecheck
pnpm test
pnpm --filter @expresso/web build
```

화면: 문서 패널 머리말 상태 변화, 전체 페이지 상태, `> [evidence:job:1] 문장`이 든 기록 열기 → 고치기 → `bodyMd` 확인.
