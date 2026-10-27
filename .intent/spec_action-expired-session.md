---
title: 세션 없는 서버 액션의 로그인 이동
slug: action-expired-session
stage: spec
status: accepted
intent: .intent/intent_action-expired-session.md
date: 2026-10-27
---

# 세션 없는 서버 액션의 로그인 이동 — 명세

## 요구사항

- [ ] 쿠키 없는 fetch 서버 액션(`POST` + `next-action` 헤더)에 3xx를 내지 않는다. `200` · 빈 본문 · `x-action-redirect: <로그인 경로>;replace`를 낸다.
- [ ] 쿠키 없는 그 밖의 `POST`(스크립트 없는 폼)는 `303` + `Location`으로 같은 로그인 주소에 보낸다.
- [ ] `GET`은 지금처럼 `307`이다. 로그인 주소 규칙(`loginPath(target)`, 개발 로그인이면 `/api/dev/session?next=`)은 세 경우 모두 같다.

## 설계

`services/web/src/proxy.ts`의 쿠키 없는 분기만 고친다. 로그인 주소를 먼저 정하고(`devLoginEnabled()` · `loginPath`), 요청 종류로 응답 모양만 가른다. 형식은 Next 서버가 액션 안의 `redirect()`를 낼 때와 같다 — `next/dist/server/app-render/action-handler.js`: fetch 액션은 200 + `x-action-redirect: <url>;<type>`, MPA 액션은 303 + `Location`. 클라이언트(`server-action-reducer.js`)는 이 헤더가 있고 Flight 본문이 없으면 그 주소로 전체 이동한다.

## 버린 대안

- 액션마다 세션을 확인해 `redirect()`: 쿠키가 없으면 프록시가 먼저 막아 액션 코드까지 오지 않는다.
- 401을 내고 클라이언트에서 잡기: 오류 경계마다 처리를 더해야 한다.

## 함정

- `x-action-redirect`의 주소는 클라이언트가 지금 화면 주소 기준으로 푼다. **경로만 넣는다** — 프록시의 `request.url` 호스트가 브라우저 주소와 달라(개발 서버는 `localhost`로 보았다) 절대 URL이면 다른 호스트로 이동해 쿠키가 따라가지 않는다. Next 서버의 `redirect()`도 경로를 넣는다.
- `next`는 요청 경로(= 액션을 부른 화면 경로)다. 액션 POST의 경로는 화면 경로와 같다.

## 완료 기준

- `proxy.test.ts`에 fetch 액션 · 폼 POST · 개발 로그인 경우를 더하고 `pnpm --filter @expresso/web test` 통과.
- 편집 화면에서 쿠키를 지운 뒤 「그대로 두기」 → 로그인(개발 로그인) 화면, `next`가 편집 화면.
