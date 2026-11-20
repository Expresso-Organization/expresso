---
title: 커리어 문서 본문 편집 메뉴 디자인 정합
slug: blocknote-menu-design
stage: plan
status: accepted
intent: .intent/intent_blocknote-menu-design.md
spec: .intent/spec_blocknote-menu-design.md
date: 2026-11-21
---

# 커리어 문서 본문 편집 메뉴 디자인 정합 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/features/career-editor/editor/BlockNoteBody.module.css` | ariakit 메뉴 · 팝오버 · 툴바 · 툴팁 · 블록 단추 · `/` 메뉴 항목 · 안내 문구 덮어쓰기, 메뉴 배경 변수 |
| `services/web/src/features/career-editor/editor/BlockNoteBody.tsx` | `/` 메뉴 항목에서 단축키 표시(`badge`) 제거, 「콜아웃」 아이콘 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1단계: 메뉴 표면과 항목 상태 덮어쓰기 — 어두운 테마 블록 메뉴 · 색 메뉴 캡처에 파랑이 없다.
2단계: 블록 단추와 안내 문구 — 본문 옆 단추 18px, 안내 문구 바로 선 글자.
3단계: `/` 메뉴 항목(아이콘 상자 · 제목 · 설명 · 묶음 이름), 단축키 표시 제거, 콜아웃 아이콘 — 슬래시 메뉴 캡처.
4단계: 서식 툴바 · 툴팁 — 글자를 골라 툴바 캡처.
5단계: 검증 — `pnpm typecheck` · `pnpm test` · e2e · 밝은 · 어두운 전후 캡처.

## 가장 위험한 단계

1단계. 항목 상태 선택자를 덮어쓰다 키보드로 고른 항목 표시가 사라지면 메뉴를 키보드로 쓸 수 없다. 방향키로 `/` 메뉴를 움직이며 고른 항목 배경이 따라오는지 캡처로 본다. 깨지면 이 파일만 되돌린다.

## 검증

```
pnpm typecheck
pnpm test
playwright test e2e/career-editor.spec.ts (로컬, 설치된 Chrome)
```

화면: `/career/experience`에서 기록을 열어 본문 블록에 올리기 → 끌기 단추 → 색깔, 빈 줄에서 `/`, 글자 선택 후 툴바. 1440 밝은 · 어두운.
