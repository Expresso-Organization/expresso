---
title: 로그인 화면 개발 계정 접속 버튼
slug: dev-login-button
stage: spec
status: accepted
intent: .intent/intent_dev-login-button.md
date: 2026-10-27
---

# 로그인 화면 개발 계정 접속 버튼 — 명세

## 요구사항

- [ ] `DEV_LOGIN=1` · `DEV_LOGIN_EMAIL` · `DEV_LOGIN_PASSWORD` 세 값이 모두 있으면
      `NODE_ENV`와 무관하게 로그인 화면 오른쪽 아래에 "개발 계정으로 접속" 버튼이 선다.
- [ ] 세 값 중 하나라도 없으면 버튼이 DOM에 없고 `/api/dev/session`은 404다.
- [ ] 버튼은 `/api/dev/session?next=<서버가 걸러 준 next>`로 가는 `<a>`다.
      `next/link`를 쓰지 않는다 — 프리페치가 GET 라우트를 미리 불러 마우스를 올리기만
      해도 로그인될 수 있다.
- [ ] 로그인 화면이 보내는 HTML에 비밀번호가 들어가지 않는다.
- [ ] `/api/dev/session`은 지금처럼 `auth.login` → (401이면) `auth.signup` 순서로
      제품의 실제 로그인을 수행하고 `ex_session` 쿠키를 찍는다.
- [ ] 프록시(`proxy.ts`)의 개발 로그인 분기는 `DEV_LOGIN=1`만 보고 열린다.

## 설계

판단의 출처를 하나로 모은다. 지금 세 자리가 각자 조건을 적고 있다 —
`demo-account.ts`(`NODE_ENV === development` + 이메일·비밀번호),
`api/dev/session/route.ts`(`NODE_ENV !== production` + `DEV_LOGIN=1` + 이메일·비밀번호),
`proxy.ts`(`NODE_ENV !== production` + `DEV_LOGIN=1`).

- `services/web/src/lib/auth/dev-login.ts`를 새로 만들고 `readDevLogin()`과
  `isDevLoginEnabled()`를 둔다. 조건은 `DEV_LOGIN === "1"` + 이메일 + 비밀번호
  — `NODE_ENV`를 보지 않는다. 라우트는 `readDevLogin()`, 로그인 화면과 프록시는
  `isDevLoginEnabled()`를 쓴다.
- `demo-account.ts`와 그 테스트를 지운다. `LoginPage`는 `devLoginEnabled` 불리언
  하나를 `LoginForm`에 넘긴다.
- `LoginForm`의 `demoDock` 안을 `<a className={styles.demoButton} href=...>` 하나로
  바꾼다. `Popover`·`Button` import와 `DemoAccount` 타입 참조를 지운다.
  `auth.module.css`의 `.demoDock` · `.demoButton`은 그대로 쓰고 팝오버 전용
  클래스(`.demoPopover` · `.demoHeader` · `.demoTitle` · `.demoDescription` ·
  `.demoCredentials` · `.demoSetup`)는 지운다.
- 문서: `services/web/.env.example`과 `AGENTS.md`의 "프로덕션 빌드에서는 라우트가
  404" 문구를 실제 조건으로 고친다. `docs/operations/DEPLOYMENT.md`에 서버
  `services/web/.env`에 넣을 세 줄과 재시작 명령을 적는다.

## 버린 대안

- **데모 로그인용 서버 액션을 새로 만든다.** `/api/dev/session`과 같은 일을 하는
  두 번째 경로가 생긴다. 라우트가 이미 로그인·첫 가입을 하므로 재사용한다.
- **비밀번호를 저장소의 설정 파일에 넣어 커밋한다.** 배포 서버에 손대지 않고
  버튼을 켤 수 있지만, 공개 저장소에 계정 비밀번호가 남는다.
- **팝오버를 남겨 두고 버튼만 추가한다.** 프로덕션 화면에 비밀번호가 글자로
  나가고, 같은 자리에 같은 목적의 컨트롤이 둘이 된다.

## 함정

- `next/link`의 프리페치. GET 라우트 핸들러를 미리 부르면 의도 없이 세션이 찍힌다.
  반드시 `<a>`다.
- `NODE_ENV` 게이트를 거두면 `services/web/.env`에 값이 남아 있는 서버는 그 즉시
  버튼이 열린다. 조건이 `DEV_LOGIN=1`까지 요구하는 것이 그 안전장치다.
- `safeNext()`가 외부 주소를 걸러 준다. `next`를 그대로 붙이지 않는다.
- 쿠키는 포트를 구분하지 않는다. 로컬에서 프로덕션 빌드를 띄워 확인할 때
  `127.0.0.1`을 쓰면 3000번 개발 서버의 `ex_session`을 덮는다 — `<이름>.localhost`로
  연다.
- 테스트가 `dist`를 본다. `@expresso/contracts`와 `@expresso/database`를 먼저 짓는다.

## 완료 기준

```
pnpm typecheck
pnpm test
```

- 새 `dev-login.test.ts`가 다섯 경우를 덮는다 — 세 값이 모두 있으면 켜짐,
  `DEV_LOGIN`이 없거나 `0`이면 꺼짐, 이메일만 없으면 꺼짐, 비밀번호만 없으면 꺼짐,
  `NODE_ENV=production`이어도 세 값이 있으면 켜짐.
- `api/dev/session/route.test.ts`가 프로덕션에서 404가 아니라 303을 내는 것으로 바뀐다.
- 로컬 프로덕션 빌드에서 `/login?next=/home`을 열어 버튼을 누르면 `/home`이 열린다.
