---
title: 생성 화면 지면 스트림 재연결 · 완료 뒤 전환 보장
slug: live-preview-reconnect
stage: spec
status: draft
intent: .intent/intent_live-preview-reconnect.md
date: 2026-11-10
---

# 생성 화면 지면 스트림 재연결 · 완료 뒤 전환 보장 — 명세

## 요구사항

- [ ] `EventSource`가 `error`를 내고 `readyState === CLOSED`이면, 1.5초 뒤 같은 주소로 새 `EventSource`를 연다. 브라우저가 스스로 다시 붙는 중(`CONNECTING`)이면 손대지 않는다.
- [ ] 문서가 다시 보일 때(`visibilitychange` → `visible`) 연결이 닫혀 있으면 바로 다시 연다.
- [ ] 다시 열면 서버가 처음부터 다시 보내므로 기존 `open` → `restart`가 받는 쪽 상태를 비운다(지금 동작 그대로).
- [ ] `done` · `failed`를 받으면 연결을 닫고 다시 열지 않는다. 바로 `router.refresh()`하고, 이 컴포넌트가 남아 있는 동안 1.5초마다 다시 읽는다(`useRefreshWhile`).
- [ ] 컴포넌트가 사라지면 타이머 · 리스너 · 연결을 모두 정리한다.

## 설계

`LivePreview`의 스트림 효과 안에서 리스너 등록을 `connect()` 함수로 묶는다. `source`는 효과 안의 지역 변수로 두고 다시 열 때 바꾼다.
`onerror`가 닫힌 연결을 보면 `setTimeout(connect, RECONNECT_MS)`. `visibilitychange`에서 닫혀 있으면 기다리던 타이머를 지우고 바로 `connect()`.
종료 신호는 `ended` 상태(`useState`)로 두고 `useRefreshWhile(ended)`를 재사용한다 — 1.5초 간격도 그 훅의 값이다.
`RECONNECT_MS`는 `useRefreshWhile`과 같은 1.5초로 둔다. 화면이 서버 상태를 다시 보는 간격을 한 값으로 맞춘다.

## 버린 대안

- 워커 순서 바꾸기(잡 상태를 `done`으로 바꾼 뒤 스트림 `done`): `PageService.generate`가 스트림 `done`을 쓰고 생성 모듈이 상태를 확정하는 두 모듈 경계를 옮겨야 한다. 핫픽스 범위를 넘고, 화면이 다시 읽어 기다리는 쪽이 순서와 상관없이 맞다.
- 생성 내내 1.5초 폴링: 스트림이 살아 있을 때도 매번 페이지 전체를 다시 그린다.

## 함정

- `EventSource`는 서버가 응답을 정상 종료하면 스스로 다시 붙는다. 다시 붙지 않는 것은 `CLOSED`가 됐을 때뿐이다(취소 · 비 200 응답). 그 경우만 다시 연다.
- 다시 열 때마다 서버가 처음부터 보내므로 `restart`가 꼭 먼저 돌아야 한다 — `open` 리스너가 그 일을 한다.
- 잡이 끝난 지 30분이 지나 Redis 기록이 사라졌으면 다시 연 스트림은 아무것도 안 보낸다. 그때는 서버가 그린 페이지가 이미 다듬기로 보낸다.

## 완료 기준

```
pnpm --filter @expresso/web test -- LivePreview
pnpm --filter @expresso/web typecheck
```

두 명령이 통과하고, 운영 배포 뒤 생성 한 번이 새로고침 없이 다듬기로 넘어간다.
