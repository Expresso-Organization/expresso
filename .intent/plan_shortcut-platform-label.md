---
title: 단축키 표시를 사용 중인 운영체제에 맞추기
slug: shortcut-platform-label
stage: plan
status: accepted
intent: .intent/intent_shortcut-platform-label.md
spec: .intent/spec_shortcut-platform-label.md
date: 2026-11-10
---

# 단축키 표시를 사용 중인 운영체제에 맞추기 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/lib/shortcut.ts` (새로) | `isApplePlatform`, `shortcutLabel` |
| `services/web/src/lib/shortcut.test.ts` (새로) | 두 함수 단위 테스트 |
| `services/web/src/hooks/use-shortcut-label.ts` (새로) | 클라이언트 플랫폼을 읽는 훅 |
| `services/web/src/hooks/use-shortcut-label.test.tsx` (새로) | 맥·윈도우·서버 렌더에서 훅이 그리는 글자 확인 |
| `services/web/src/components/shell/SidebarNav.tsx` | `⌘K` 하드코딩을 훅으로 교체 |
| `services/web/src/app/(app)/edit/[portfolioId]/EditorPanels.tsx` | `⌘↵`를 훅으로 교체 |
| `services/web/src/app/(app)/edit/[portfolioId]/ElementChat.tsx` | `⌘↵`를 훅으로 교체 |

## 작업 순서

1. `shortcut.ts`와 테스트 작성 — `vitest run src/lib/shortcut.test.ts` 통과.
2. `use-shortcut-label.ts` 작성 — 타입 검사 통과.
3. 세 컴포넌트 교체 — 타입 검사 통과, 기존 컴포넌트 테스트 통과.
4. 개발 서버에서 맥·윈도우 사용자 에이전트로 사이드바 확인.

## 가장 위험한 단계

3단계. 컴포넌트에서 훅을 조건부로 부르면 규칙 위반이 된다. 세 곳 모두 컴포넌트 최상위에서 부른다. 문제가 생기면 커밋 하나를 되돌린다.

## 검증

```
pnpm --filter @expresso/web test
pnpm --filter @expresso/web typecheck
```

UI: 개발 서버를 띄우고 로그인한 뒤 사이드바 검색 줄을 본다. 개발자 도구로 사용자 에이전트를 윈도우로 바꾸고 새로고침해 `Ctrl+K`를 확인한다.
