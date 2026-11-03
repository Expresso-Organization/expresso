---
title: 커리어 본문 표 머리글 · 줄바꿈 · 밑줄 저장 수정
slug: career-editor-roundtrip
stage: spec
status: accepted
intent: .intent/intent_career-editor-roundtrip.md
date: 2026-10-28
---

# 커리어 본문 표 머리글 · 줄바꿈 · 밑줄 저장 수정 — 명세

## 요구사항

- [ ] Tiptap 스키마의 모든 노드 타입(`careerEditorExtensions`로 만든 스키마)이 `tiptapToCareerDocument` → `careerDocumentToTiptap` 왕복 뒤 `Node.check()`를 통과한다.
- [ ] 스키마에 새 노드 · mark가 생기면 왕복 시험이 실패한다. 처리 목록에 없는 이름을 찾아 알린다.
- [ ] `tableHeader` 칸은 `tableHeader` 블록으로 저장되고 다시 `tableHeader`로 열린다.
- [ ] `hardBreak`는 문단 텍스트의 `\n`으로 저장되고 다시 `hardBreak`로 열린다. 서식이 다른 span 사이에서도 위치가 유지된다.
- [ ] `underline` mark가 계약(`CareerMarkSchema`)에 있고 왕복된다.
- [ ] 이미 `tableHeader` 블록으로 저장된 문서가 예외 없이 열린다.

## 설계

- `packages/editor/src/document.ts`: `CAREER_BLOCK_TYPES`에 `tableHeader`, `CareerMarkSchema`에 `underline`을 더한다. 둘 다 추가라서 기존 문서와 백엔드 검증에 영향이 없다.
- `services/web/src/features/career-editor/editor/extensions.ts`
  - `blockToTiptap`: `tableHeader`를 `tableCell`과 같은 방식으로 `tableHeader` 노드로 만든다. `textContent`가 span의 `\n`을 `hardBreak` 노드로 나눈다.
  - `spans`: `hardBreak` 자식을 `\n` span으로 바꾼다. 지금은 `hardBreak`를 블록 자식으로 저장해 위치를 잃는다.
  - `tiptapToBlock`: 인라인 노드(`text` · `hardBreak`)는 블록 자식에서 뺀다.
- 왕복 시험은 `extensions.test.ts`에 둔다. `getSchema(careerEditorExtensions)`의 노드 이름을 처리 목록과 맞춰 본다.

## 버린 대안

- `hardBreak`를 블록 타입으로 더하기: 문단은 `text` span 배열이라 블록 자식으로 두면 글자 사이 위치를 표현할 수 없다.
- StarterKit에서 `underline`을 끄기: 사용자가 쓰는 서식을 없애는 쪽이라 고르지 않았다.

## 함정

- `CareerTextSpanSchema`의 `text`는 `\n`을 막지 않는다. Markdown 변환(`markdown.ts`)의 문단 처리도 `\n`을 그대로 둔다.
- BlockNote 전환 브랜치의 `careerDocumentToBlockNote`는 `tableHeader`와 `\n`을 이미 처리한다.

## 완료 기준

```bash
pnpm --filter @expresso/editor test
pnpm --filter @expresso/web exec vitest run src/features/career-editor
pnpm typecheck
```

검증 서버에서 표 · 줄바꿈 · 밑줄을 넣고 새로고침해 같은 모양으로 열리는지 본다.
