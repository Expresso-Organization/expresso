---
title: 생성 화면 지면 스트림 재연결 · 완료 뒤 전환 보장
slug: live-preview-reconnect
stage: plan
status: draft
intent: .intent/intent_live-preview-reconnect.md
spec: .intent/spec_live-preview-reconnect.md
date: 2026-11-10
---

# 생성 화면 지면 스트림 재연결 · 완료 뒤 전환 보장 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/app/(app)/brew/[brewId]/design/LivePreview.tsx` | `connect()`로 묶고 닫힌 연결 다시 열기 · 보일 때 다시 열기 · 종료 뒤 `useRefreshWhile` |
| `services/web/src/app/(app)/brew/[brewId]/use-refresh-while.ts` | 다시 읽는 간격 1.5초를 `REFRESH_MS`로 내보내 재연결 간격과 한 값으로 둔다 |
| `services/web/src/app/(app)/brew/[brewId]/design/LivePreview.test.tsx` | 가짜 `EventSource`로 재연결 · 종료 뒤 다시 읽기 검사 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. `LivePreview.tsx` 스트림 효과를 `connect()`로 묶고 `onerror` · `visibilitychange` 처리 — 타입 검사 통과
2. `done` · `failed`에서 `ended`를 켜고 `useRefreshWhile(ended)` — 종료 뒤 다시 읽기. `ended`면 스트림 효과가 다시 열지 않는다(의존성에 `ended`)
3. `LivePreview.test.tsx` 작성 — 닫힌 연결 1.5초 뒤 새 연결, 다시 붙는 중엔 그대로, 종료 뒤 1.5초마다 refresh
4. 웹 테스트 · 타입 검사 → PR → CI → 머지 → 운영 배포 확인

## 가장 위험한 단계

1단계. 다시 열 때 이전 연결의 리스너가 남으면 이벤트가 두 번 그려진다. 다시 열기 전에 이전 `source.close()`를 부르고, 효과 정리에서 지금 `source`를 닫는다. 깨지면 이 PR을 되돌린다(`git revert`) — 화면은 지금 동작으로 돌아간다.

## 검증

```
pnpm --filter @expresso/web test -- LivePreview
pnpm --filter @expresso/web typecheck
```

운영: 배포 뒤 `curl -sI https://expresso.ai.kr` 확인, 서버 `git log -1`이 머지 커밋인지 확인.
