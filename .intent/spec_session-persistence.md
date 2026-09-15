---
title: 세션 유지와 로그인 진입 정비
slug: session-persistence
stage: spec
status: accepted
intent: .intent/intent_session-persistence.md
date: 2026-09-15
---

# 세션 유지와 로그인 진입 정비 — 명세

## 요구사항

- [x] 세션 정책 상수가 `packages/contracts`에 한 곳 있다. 유지 켬: 활동 후 30일 /
      유지 끔: 활동 후 12시간 / 절대 상한: 발급 후 90일 (두 모드 공통).
- [x] 로그인·가입·Google·Google 연결 요청이 `persistent`(기본 `true`)를 받고, 발급
      세션 응답이 `persistent`를 돌려준다.
- [x] 인증된 요청마다 세션 `expiresAt`이 `min(now + idle, absoluteExpiresAt)`으로
      갱신된다. 새 필드가 없는 기존 세션은 유지 켬 · 상한 `createdAt + 90일`로 취급된다.
- [x] 백엔드 통합 테스트(mongodb): 유지 끔 12시간 발급 · 활동 시 30일로 연장 ·
      상한에 걸리면 상한값 · 기존 문서(새 필드 없음) 연장.
- [x] 웹: 유지 켬이면 `ex_session` 쿠키에 `expires`가 있고 요청마다 `now + 30일`로
      다시 찍힌다. 유지 끔이면 `expires`가 없다(브라우저 세션 쿠키).
- [x] 웹: 쿠키 없이 보호 구간에 오면 `/login?next=<경로+쿼리>`. 로그인 뒤 `next`로
      돌아간다. `next`는 같은 출처 경로만, `/api/`·`/login`·`/signup` 제외, 기본 `/home`.
- [x] 웹: 백엔드 401 → 세션 쿠키 두 개 삭제 → `/login?next=<보던 경로>`.
- [x] 웹: 쿠키가 있는 상태로 `/login`·`/signup`을 열면 `/home`(또는 `next`)으로 간다.
- [x] 웹: 로그인 화면에 "로그인 상태 유지" 체크(기본 켬). Google 버튼도 같은 선택과
      `next`를 들고 나간다.
- [x] 웹: 로그인 서버 검증 오류가 `email` · `password` 각 칸에 붙는다.
- [x] `pnpm typecheck` · `pnpm test` · `pnpm test:infra` 통과.

## 설계

**계약** `packages/contracts/src/identity.ts`
- `SESSION_POLICY = { persistent: { idleMs: 30d }, ephemeral: { idleMs: 12h }, absoluteMs: 90d }`.
- `LoginSchema` · `SignupSchema` · `GoogleSignInSchema` · `GoogleLinkSchema`에
  `persistent: z.boolean().default(true)`. `IssuedIdentitySessionSchema`에 `persistent: z.boolean()`.

**백엔드** `services/backend/src/modules/identity`
- `IssueIdentitySessionInput`: `ttlMs` → `persistent?: boolean`. 외부 호출자는 테스트의
  `issueSession({ userId })`만이라 시그니처가 그대로 통한다.
- `IdentitySessionDoc`에 `idleTtlMs?: number` · `absoluteExpiresAt?: Date`. 발급 시 채운다.
- `verifyAccessToken`의 `findOneAndUpdate`를 파이프라인 갱신으로 바꾼다:
  `$set: { lastSeenAt: "$$NOW", expiresAt: { $min: [ now + $ifNull(idleTtlMs, 30d), $ifNull(absoluteExpiresAt, createdAt + 90d) ] } }`.
  필터는 지금과 같다(`revokedAt: null`, `expiresAt > now`). 쓰기 한 번은 이미 하고 있어 비용이 늘지 않는다.
- 마이그레이션 `0009 identity_session_sliding_expiry`: `identity_sessions` validator에
  두 필드를 추가한다(required 아님). 0003의 collMod 패턴을 따른다.
- 레거시 MySQL 서비스는 타입 출처(`IdentityApi`)라 시그니처만 맞춘다 — `persistent`로
  고정 TTL을 고르고 연장은 하지 않는다. 운영 런타임은 Mongo다(`api/main.ts`).

**웹** `services/web`
- `lib/auth/session-cookie.ts`(새) — 쿠키 이름 `ex_session` · `ex_session_keep`, 옵션 함수.
  `next/headers`를 가져오지 않아 프록시에서도 쓴다. `lib/session.ts`는 이걸 쓰고
  `writeAccessToken(session)`으로 바뀐다(유지 켬: 두 쿠키에 `expires` / 끔: `ex_session`만, `expires` 없음).
- `lib/auth/next-path.ts`(새) — `safeNext()`. `api/dev/session`의 것을 옮겨 한 곳으로.
- `proxy.ts` — 쿠키 있음: 요청 헤더 `x-ex-pathname`을 붙여 통과. `ex_session_keep`도
  있으면 응답에 두 쿠키를 `now + 30일`로 다시 찍는다. 쿠키 없음: `/login?next=`.
- `api/auth/expired/route.ts`(새) — 두 쿠키 삭제 후 `/login?next=`로 303.
  `require-session.ts`는 401에서 `x-ex-pathname`을 읽어 여기로 보낸다.
- `login/page.tsx` · `signup/page.tsx` — 쿠키 있으면 `redirect(safeNext(next))`. `next`를 폼에 넘긴다.
- `LoginForm` — `persistent` 체크(가입 화면의 `.consent*` 스타일 재사용, 숨긴 `<input name=persistent>`),
  `next` hidden. `SocialSignIn`이 `/api/auth/google/start?persistent=&next=` 링크를 만든다.
- `auth-actions.ts` — `loginAction`이 `persistent` · `next`를 읽고 issue별 필드 오류를 만든다.
  `linkGoogleAction`은 대기 쿠키의 `persistent` · `next`를 쓴다.
- Google `start` → 핸드셰이크 쿠키에 `persistent` · `next` 저장. `callback` → 백엔드에 넘기고
  `created`면 온보딩, 아니면 `safeNext(next)`. 409면 대기 쿠키에도 둘을 담는다.
- `docs/architecture/frontend.md` 「세션」절에 유지 모드와 갱신 규칙을 적는다.

## 버린 대안

- **JWT + 리프레시 토큰** — 불투명 토큰 + 서버 세션이 이미 있고, 즉시 취소가 된다.
  만료 연장은 서버가 하면 되므로 토큰 형식을 바꿀 이유가 없다.
- **프록시에서 백엔드에 세션 확인** — 프리페치까지 모든 요청에서 돌아 부르지 않는다는
  기존 결정과 충돌한다. 쿠키 만료는 낙관적으로 찍고 진짜 만료는 401이 잡는다.
- **유지 모드를 토큰 문자열에 인코딩** — `exps_` 형식이 계약이고 여러 곳에서 정규식으로
  본다. 별도 플래그 쿠키(토큰 아님)가 더 싸다.
- **Server Component에서 쿠키 삭제** — Next.js가 렌더 중 `cookies().set/delete`를 막는다.
  라우트 핸들러로 보낸다.

## 함정

- `strictObject`라 `IssuedIdentitySessionSchema`에 필드를 더하면 `contracts.test.ts`의
  파싱 픽스처가 깨진다. 함께 고친다.
- `/api/auth/expired`는 GET으로 쿠키를 지운다. 링크 하나로 남을 로그아웃시킬 수는 있으나
  세션 자체는 살아 있고 쿠키만 사라진다 — 성가심 이상의 피해가 없다. 단, 핸들러는
  `next`를 `safeNext`로 걸러 열린 리다이렉트를 만들지 않는다.
- `x-ex-pathname`은 프록시가 붙이는 헤더다. 클라이언트가 보낸 같은 이름의 헤더를 덮어써야
  한다(`requestHeaders.set`).
- 파이프라인 갱신의 `$min`에 `Date`와 `$add` 결과(Date)가 섞인다 — `$add: [date, number]`는
  Date를 돌려준다. `idleTtlMs`는 정수(ms)로 저장한다.
- 온보딩 경로(`/onboarding/goal` 등)는 프록시 matcher 밖이다. 이번에 넣지 않는다 — 가입
  직후 쿠키가 항상 있고, 세션이 끊기면 페이지의 `readAccessToken()`이 로그인으로 보낸다.

## 완료 기준

- `pnpm typecheck` 무오류.
- `pnpm test` — contracts · web(proxy · next-path) · database(schema 목록에 `0009_…`) 통과.
- `pnpm test:infra` — `auth HTTP integration (mongodb)`에 세션 연장 케이스 4개가 추가되어 통과.
- 브라우저 확인: 체크 끄고 로그인 → 개발자 도구에서 `ex_session`의 Expires가 `Session`.
  체크 켜고 로그인 → 30일 뒤 날짜, 새로고침하면 날짜가 앞으로 밀린다.
  쿠키 삭제 후 `/career/experience` 열기 → `/login?next=%2Fcareer%2Fexperience` → 로그인 → 그 자리.
