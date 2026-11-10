---
title: 텍스트 입력 포커스 테두리 제거
slug: input-focus-border
stage: plan
status: accepted
intent: .intent/intent_input-focus-border.md
spec: .intent/spec_input-focus-border.md
date: 2026-11-07
---

# 텍스트 입력 포커스 테두리 제거 — 구현 계획

## 바뀌는 파일

모든 경로는 `services/web/src/` 아래이다.

| 파일 | 무엇을 |
|---|---|
| `styles/global.css` | 전역 링에서 텍스트 입력 제외 |
| `styles/agent-chat-framework.css` | `input` · `datepicker` outline을 `none`으로 변경, composer 무력화 규칙 제거 |
| `styles/tokens.test.ts` | 재발 방지 검사 추가 |
| `components/ui/textarea.tsx` | 포커스 테두리 · 링 클래스 제거 |
| `components/assistant-ui/elements/thread.aui.tsx` | composer `focus-within` 테두리 클래스 제거 |
| `app/(app)/home/page.module.css` | `.searchBar` 포커스 규칙과 `transition` 제거 |
| `app/(app)/jobs/page.module.css` | `.searchBar` 포커스 규칙과 `transition` 제거 |
| `app/(app)/brew/[brewId]/design/DesignCatalog.module.css` | `.searchField` 포커스 규칙 제거 |
| `app/(app)/brew/new/page.module.css` | `.entrySearch:focus-within` · `transition` 삭제, `.input` · `.textarea` 테두리 제거, `.searchInput:focus` 삭제 |
| `app/(auth)/auth.module.css` | `.input:focus` 제거 |
| `features/career-editor/views/views.module.css` | 입력 칸 포커스 규칙 제거 |
| `features/career-editor/properties/properties.module.css` | 입력 칸 포커스 규칙 제거 |
| `features/career-editor/views/AiRecordInterview.module.css` | `.question input:focus` 제거 |
| `features/career-editor/ai/ai.module.css` | 효과 없는 `.composer:focus-within` 제거 |
| `features/agent-chat/AgentChat.module.css` | 검색 · composer 테두리 규칙 제거, 무력화 규칙 3건을 `outline: none` 1건으로 통합 |
| `features/agent-chat/RecordDraftCard.module.css` | `.field input`은 `outline: none`만 유지 |
| `features/agent-chat/PlanCards.module.css` | `.field input`은 `outline: none`만 유지 |

## 작업 순서

1. 재발 방지 검사를 먼저 추가한다 — 현재 코드에서 실패하는 것을 확인한다.
2. `global.css`의 전역 링에서 텍스트 입력을 뺀다 — 검사의 전역 항목이 통과한다.
3. 화면별 CSS와 Tailwind 클래스에서 테두리 선언을 지운다 — 검사 전체가 통과한다.
4. 워크트리 웹 · API를 빈 DB로 띄워 `/home` · `/jobs` · `/login`에서 클릭 전후 계산값을 비교한다.
5. 타입 검사와 테스트를 돌리고 커밋 · 푸시한다.

## 가장 위험한 단계

2단계의 `:not(:where(...))` 선택자이다. 잘못 쓰면 전역 링 전체가 무효가 되어 버튼과 링크의 키보드 포커스 표시가 사라진다. 4단계에서 버튼에 Tab 키로 이동해 링을 확인한다. 깨지면 `global.css`의 커밋만 되돌린다.

## 검증

```
pnpm --filter @expresso/web test
pnpm typecheck
```

브라우저 확인 경로: `/home`과 `/jobs`의 검색 바 클릭, `/login`의 이메일 칸 클릭, 같은 화면에서 Tab 키로 버튼 이동. 웹 전용 변경이라 `pnpm test:infra`는 대상이 아니다.
