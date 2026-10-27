---
title: 로그인 화면 개발 계정 접속 버튼
slug: dev-login-button
stage: plan
status: accepted
intent: .intent/intent_dev-login-button.md
spec: .intent/spec_dev-login-button.md
date: 2026-10-27
---

# 로그인 화면 개발 계정 접속 버튼 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/lib/auth/dev-login.ts` | 새 파일. `readDevLogin()` · `isDevLoginEnabled()` · `isDevLoginAutoRedirectEnabled()` — 조건 한 곳 |
| `services/web/src/lib/auth/dev-login.test.ts` | 새 파일. 켜짐·꺼짐과 자동 전환 경우 |
| `services/web/src/app/(auth)/login/demo-account.ts` | 삭제 |
| `services/web/src/app/(auth)/login/demo-account.test.ts` | 삭제 |
| `services/web/src/app/(auth)/login/page.tsx` | `readDemoAccount()` → `isDevLoginEnabled()`, 주석의 "데모 계정" 문장 수정 |
| `services/web/src/app/(auth)/login/LoginForm.tsx` | 팝오버를 `<a>` 버튼으로 교체, Popover·Button import 제거 |
| `services/web/src/app/(auth)/auth.module.css` | 팝오버 전용 클래스 제거, `.demoButton`에 링크용 속성(`text-decoration`) 보강 |
| `services/web/src/app/api/dev/session/route.ts` | 자체 `readDevLogin()` 제거하고 새 모듈 사용, 주석의 404 조건 수정 |
| `services/web/src/app/api/dev/session/route.test.ts` | 프로덕션 케이스를 "세 값이 있으면 303"으로 수정 |
| `services/web/src/proxy.ts` | `devLoginEnabled()` → `isDevLoginAutoRedirectEnabled()` — 로그인 화면 건너뛰기는 개발 서버만 |
| `services/web/.env.example` | 프로덕션 404 문구 수정, 배포 서버에서 켜는 방법 한 줄 |
| `AGENTS.md` | 「돌려 보기」의 프로덕션 404 문장 수정 |
| `docs/operations/DEPLOYMENT.md` | 서버 `services/web/.env`에 넣을 세 줄과 재시작 명령 |

## 작업 순서

1. `dev-login.ts`와 그 테스트를 쓴다 — `pnpm --filter @expresso/web test dev-login`이 통과한다.
2. 라우트와 프록시를 새 모듈로 돌린다. 라우트 테스트를 고친다 — 그 두 파일에 `NODE_ENV` 참조가 남지 않는다.
3. 로그인 화면을 고친다. `demo-account.*`를 지우고 `page.tsx` · `LoginForm.tsx` · CSS를 맞춘다 — `grep -rn "demoPopover\|readDemoAccount" services/web/src`가 비어야 한다.
4. 문서 세 곳을 고친다.
5. `pnpm typecheck` · `pnpm test`를 돌린다.
6. 프로덕션 빌드로 화면을 확인한다(아래 검증).
7. 커밋 · 푸시 · PR.

## 가장 위험한 단계

3번. 팝오버를 지우면서 `auth.module.css`에서 다른 화면이 쓰는 클래스를 같이 지울 수 있다.
`grep -rn "demo" services/web/src`로 참조를 먼저 확인하고 지운다. 깨지면 그 커밋만 되돌린다.

두 번째는 2번 — 게이트를 거두는 변경이라, `DEV_LOGIN=1`까지 요구하는 조건이 빠지면
배포본이 누구에게나 열린다. 테스트에 "값이 없으면 404" 경우를 반드시 남긴다.

## 검증

```
pnpm typecheck
pnpm test
pnpm --filter @expresso/web build
```

화면 — `.env.local`에 체험 계정 `DEV_LOGIN*` 세 줄을 넣고
`next start`로 띄운 뒤(`<이름>.localhost:<포트>`, 3000번 쿠키와 겹치지 않게)
`/home`을 연다. 로그인 화면 오른쪽 아래 "개발 계정으로 접속"을 누르면 `/home`이
열린다. 그다음 세 줄을 지우고 다시 띄워 버튼이 없고 `/api/dev/session`이 404인 것을 본다.

배포본은 서버 `services/web/.env`에 값을 넣고 `sudo systemctl restart expresso-web`
한 뒤에 나타난다 — 저장소에서 할 수 있는 일이 아니므로 이 단계는 사용자가 한다.
