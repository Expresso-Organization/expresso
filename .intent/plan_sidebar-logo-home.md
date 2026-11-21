---
title: 사이드바 로고 홈 이동 · 검색 줄 제거
slug: sidebar-logo-home
stage: plan
status: accepted
intent: .intent/intent_sidebar-logo-home.md
spec: .intent/spec_sidebar-logo-home.md
date: 2026-11-19
---

# 사이드바 로고 홈 이동 · 검색 줄 제거 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/components/shell/SidebarFrame.tsx` | 고침 — `title`이 없으면 브랜드 줄을 `/home` 링크로 |
| `services/web/src/components/shell/SidebarNav.tsx` | 고침 — 검색 버튼 · `openSearch` import 제거 |
| `services/web/src/components/shell/Sidebar.module.css` | 고침 — `.brandLink` 추가, 접힘 규칙 추가, `.searchRow` · `.shortcut` 제거 |
| `services/web/src/components/shell/SidebarFrame.test.tsx` | 새 파일 — 로고 링크 · `title` 있을 때 · 접힘 상태 |
| `services/web/src/components/shell/SidebarNav.test.tsx` | 새 파일 — 검색 버튼 없음 · 1차 메뉴 네 개 |

## 작업 순서

1. 테스트 두 파일을 먼저 쓴다 — 로고 링크와 검색 버튼 단언이 실패한다.
2. `SidebarFrame.tsx`와 `.brandLink` 스타일 — `SidebarFrame.test.tsx` 통과.
3. `SidebarNav.tsx` 검색 버튼 제거와 CSS 정리 — `SidebarNav.test.tsx` 통과, `rg "searchRow|styles.shortcut"`이 비어 있다.
4. 웹 타입 검사와 테스트 전체.
5. 개발 서버에서 화면 확인.

## 가장 위험한 단계

2단계. 브랜드 줄이 링크가 되면서 접힌 상태에서 펴기 단추 아래 링크가 클릭을 가로채거나, 접힌 레일에서 보이지 않는 링크가 Tab 순서에 남을 수 있다. 접힘 상태 테스트와 화면 확인으로 잡는다. 깨지면 `SidebarFrame.tsx` · CSS 변경 커밋을 되돌리면 검색 줄 제거와 독립적으로 원상태가 된다.

## 검증

```
pnpm --filter @expresso/web typecheck
pnpm --filter @expresso/web test
```

화면: `pnpm dev:web` 후 `/jobs`에서 로고 클릭 → `/home`. Tab으로 로고 초점 → Enter. 사이드바에 「검색」 없음, ⌘K로 검색 창. 접기 → 펴기 단추로 다시 펴짐.
