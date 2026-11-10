---
title: 설정 화면의 사이드바 활성 표시
slug: settings-nav-indicator
stage: plan
status: accepted
intent: .intent/intent_settings-nav-indicator.md
spec: .intent/spec_settings-nav-indicator.md
date: 2026-11-10
---

# 설정 화면의 사이드바 활성 표시 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/components/shell/SidebarNav.tsx` | `/account`를 홈으로 묶는 조건과 주석 제거 |
| `services/web/src/components/shell/AccountLink.tsx` (새 파일) | 경로를 보고 활성 표시를 다는 사용자 줄 링크 |
| `services/web/src/components/shell/Sidebar.tsx` | 사용자 줄 `Link`를 `AccountLink`로 교체 |
| `services/web/src/components/shell/SidebarSkeleton.tsx` | 같은 교체 |
| `services/web/src/components/shell/SidebarNav.test.tsx` (새 파일) | `sectionForPath` 경로별 결과 |

## 작업 순서

1. `sectionForPath` 수정과 테스트 추가 — 테스트가 `/account`에서 `null`, `/home`에서 `"home"`을 확인한다.
2. `AccountLink` 작성, `Sidebar`·`SidebarSkeleton`에 적용 — 타입 검사 통과.
3. 개발 서버에서 `/home`과 `/account`의 사이드바를 확인한다.

## 가장 위험한 단계

2단계. 서버 컴포넌트가 클라이언트 컴포넌트에 자식을 넘기는 경계다. 깨지면 `AccountLink` 적용만 되돌리고 원래 `Link`로 복구한다.

## 검증

```
pnpm --filter @expresso/web test
pnpm typecheck
```

화면: `/home`에서 내 이름 줄을 눌러 `/account`로 간다. 홈 줄이 평소 상태이고 내 이름 줄이 칠해진다. 사이드바를 접어도 같다.
