---
title: 사이드바 「새 대화」 버튼
slug: sidebar-new-chat
stage: plan
status: accepted
intent: .intent/intent_sidebar-new-chat.md
spec: .intent/spec_sidebar-new-chat.md
date: 2026-11-23
---

# 사이드바 「새 대화」 버튼 — 계획

## 바뀌는 파일

- 고침: `services/web/src/components/shell/SidebarNav.tsx` — 버튼 줄과 「새 대화」 링크, 클릭 처리
- 고침: `services/web/src/components/shell/Sidebar.module.css` — `.actions` · `.newChat` · `.newChatLabel`, 레일 규칙
- 고침: `services/web/src/features/agent-chat/agent-handoff.ts` — `AGENT_COMPOSER_FOCUS` 이벤트 이름
- 고침: `services/web/src/app/(app)/home/HomeStart.tsx` — 이벤트를 들어 입력창 포커스
- 고침: `services/web/src/components/shell/SidebarNav.test.tsx` — 링크 순서, 대화 중 클릭 · 홈 포커스 동작

## 작업 순서

```mermaid
flowchart TD
  A["1단계: 포커스 이벤트<br/>agent-handoff.ts, HomeStart.tsx"] --> B["2단계: 버튼 줄과 클릭 처리<br/>SidebarNav.tsx"]
  B --> C["3단계: 원 · 알약 · 레일 스타일<br/>Sidebar.module.css"]:::risk
  C --> D["4단계: 테스트<br/>SidebarNav.test.tsx"]
  D --> E["5단계: 검증<br/>typecheck, test, 개발 서버 스크린샷"]
  classDef risk fill:#FCEBEB,stroke:#A32D2D,color:#501313
```

## 가장 위험한 단계

3단계. 접힌 레일 규칙과 `.brew`의 기존 레일 폭 규칙이 새 줄 구조와 어긋나면 레일에서 버튼이 넘치거나 문구가 샌다. 개발 서버에서 펼침과 접힘을 모두 찍어 확인하고, 어긋나면 CSS 커밋만 되돌린다.

## 검증

```bash
pnpm --filter @expresso/web typecheck
pnpm --filter @expresso/web test
```
