---
title: 다듬기에서 디자인 선택으로 돌아가 다시 생성
slug: design-reselect
stage: plan
status: accepted
intent: .intent/intent_design-reselect.md
spec: .intent/spec_design-reselect.md
date: 2026-10-29
---

# 다듬기에서 디자인 선택으로 돌아가 다시 생성 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/components/shell/WizardShell.tsx` | 완료된 디자인 단계 링크에 `?again=1` 추가 |
| `services/web/src/components/shell/WizardShell.test.tsx` | 링크 기대값 수정 |

## 작업 순서

1. 테스트 기대값을 `design?again=1`로 고친다 — 실패 확인
2. `WizardSteps` 링크 주소를 고친다 — 테스트 통과
3. 타입 검사와 웹 테스트를 돌린다

## 가장 위험한 단계

2단계. `typedRoutes`의 `Route` 캐스트가 이미 있어 영향이 작다. 되돌리기는 한 줄 되돌림이다.

## 검증

```
pnpm --filter @expresso/web test -- WizardShell
pnpm typecheck
```

화면: 개발 로그인 후 생성이 끝난 포트폴리오의 다듬기 → 「디자인 선택」 클릭 → 카탈로그가 열리는지 확인.
