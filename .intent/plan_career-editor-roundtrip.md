---
title: 커리어 본문 표 머리글 · 줄바꿈 · 밑줄 저장 수정
slug: career-editor-roundtrip
stage: plan
status: accepted
intent: .intent/intent_career-editor-roundtrip.md
spec: .intent/spec_career-editor-roundtrip.md
date: 2026-10-28
---

# 커리어 본문 표 머리글 · 줄바꿈 · 밑줄 저장 수정 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/editor/src/document.ts` | 블록 타입 `tableHeader`, mark `underline` 추가 |
| `packages/editor/src/document.test.ts` | 두 값이 계약을 통과하는지 |
| `services/web/src/features/career-editor/editor/extensions.ts` | `tableHeader` · `hardBreak` · 할 일 완료 표시 왕복 |
| 새 `services/web/src/features/career-editor/editor/extensions.test.ts` | 스키마 전체 왕복 · 처리 목록 누락 검사 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 왕복 시험을 먼저 쓴다 — 지금 코드에서 표 머리글 · 줄바꿈 · 밑줄 세 건이 실패한다.
2. 계약 두 값을 더한다 — `pnpm --filter @expresso/editor test` 통과.
3. 변환을 고친다 — 왕복 시험 통과.
4. 검증 서버에서 화면 확인.

## 가장 위험한 단계

3번의 `hardBreak` 변환이다. 서식이 다른 span이 섞인 문단에서 줄바꿈 위치가 밀리면 글이 어긋난다. 시험에 굵게 · 링크 사이 줄바꿈 사례를 넣는다. 깨지면 이 PR을 되돌리면 된다. 저장 형식은 추가만 했으므로 되돌려도 기존 문서는 그대로 열린다.

## 검증

```bash
pnpm --filter @expresso/editor test
pnpm --filter @expresso/web exec vitest run src/features/career-editor
pnpm typecheck
```

화면: `/career/project` → 기록 열기 → `/` 「표」 → 머리글 칸 입력 → 아래 문단에 `Shift+Enter`로 두 줄 → 글자 고르고 `Cmd+U` → 새로고침 → 다시 열기.
