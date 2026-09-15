---
title: 메일 인프라와 비밀번호 재설정 · 이메일 인증
slug: auth-email
stage: spec
status: accepted
intent: .intent/intent_auth-email.md
date: 2026-09-15
---

# 메일 인프라와 비밀번호 재설정 · 이메일 인증 — 명세

## 요구사항

- [x] `MAIL_PROVIDER=off | resend`(기본 `off`). `resend`는 `RESEND_API_KEY`가 있어야 뜬다. `MAIL_FROM`
      기본 `Expresso <noreply@expresso.kr>`. 백엔드가 링크를 만들 `APP_BASE_URL`(기본 `http://localhost:3000`).
- [x] `off` 어댑터는 수신자·제목·본문(text)을 info 로그로 남기고 성공을 돌려준다.
- [x] Resend 어댑터는 `POST https://api.resend.com/emails`에 Bearer 키와 `Idempotency-Key`로 보낸다.
      4xx·5xx는 `MailDeliveryError`로 감싸고 응답의 `name`을 로그에 남긴다.
- [x] 일회용 토큰은 `identity_tokens`에 **해시만** 저장한다. 종류 `password_reset`(30분) ·
      `email_verification`(24시간). 한 번 쓰면 `usedAt`이 찍히고 다시 쓸 수 없다.
- [x] `POST /v1/auth/password-reset {email}` — 가입 여부와 무관하게 202. 계정이 있으면 60초 안에
      다시 보내지 않는다(응답은 같은 202). 계정이 없거나 삭제 대기면 메일을 보내지 않는다.
- [x] `POST /v1/auth/password-reset/confirm {token, password, persistent?}` — 토큰이 살아 있으면
      비밀번호를 바꾸고 **그 사용자의 모든 세션을 취소**한 뒤 새 세션(`AuthSession`)을 돌려준다.
      틀리거나 만료·사용된 토큰은 400 `invalid or expired token`.
- [x] `POST /v1/auth/email-verification`(인증 필요) — 인증 메일 발송. 이미 인증이면 409, 60초 안
      재요청은 429. 성공 202.
- [x] `POST /v1/auth/email-verification/confirm {token}` — 인증 표시 후 `CurrentUserResponse`.
      가입 직후 백엔드가 같은 메일을 한 번 보낸다(발송 실패는 가입을 막지 않고 로그만).
- [x] `AuthenticatedUser`에 `emailVerifiedAt: Timestamp | null`. Google로 만든 계정과 Google을
      이은 계정은 그 자리에서 인증된다.
- [x] `SignupSchema`에 `termsVersion: z.literal(TERMS_VERSION)`. 서버가 `termsAcceptedAt` ·
      `termsVersion`을 사용자에 기록한다. Google 가입도 현재 판으로 기록한다.
- [x] `POST /v1/portfolios/:id/deployments`는 인증 전이면 403 `{ reason: "email_verification_required" }`.
      다른 발행 라우트(되돌리기·중단·내보내기)는 그대로.
- [x] 웹: `/login/forgot` · `/login/reset?token=` · `/verify-email?token=` · `/terms` · `/privacy`.
      로그인 화면 "잊으셨나요?"가 링크가 된다. 가입 화면 동의 링크가 문서로 간다.
- [x] 웹: 앱 셸 위에 인증 안내 띠 — 미인증일 때만, "인증 메일 다시 보내기" 서버 액션 포함.
      08b 배포의 403(`email_verification_required`)은 인증을 안내하는 문장으로 나온다.
- [x] 백엔드 통합 테스트(mongodb, `RecordingMailer`): 재설정 요청→메일 링크→확인→기존 세션 401 ·
      토큰 재사용 400 · 미가입 주소 202이면서 메일 0통 · 인증 메일→확인→`emailVerifiedAt` ·
      60초 안 재요청 429 · 인증 전 발행 403 · `termsVersion` 없는 가입 400.
- [x] `pnpm typecheck` · 패키지별 test · `pnpm test:infra` 통과.

## 설계

**계약** `packages/contracts/src/identity.ts`
- `TERMS_VERSION = 1`. `AuthenticatedUserSchema.emailVerifiedAt`. `SignupSchema.termsVersion`.
- `PasswordResetRequestSchema {email}` · `PasswordResetConfirmSchema {token, password(min 10), persistent?}` ·
  `EmailVerificationConfirmSchema {token}` · `EmailVerificationRequiredSchema { reason: "email_verification_required" }`.
- 토큰 형식 `exrt_[A-Za-z0-9_-]{43}`(재설정) · `exvt_…`(인증). 세션 토큰과 같은 생성·해시 방식(`token.ts`).

**데이터** `packages/database`
- `IdentityTokenDoc { _id, userId, kind, tokenHash, expiresAt, usedAt, createdAt }`. 인덱스: `tokenHash` unique ·
  `(userId, kind, createdAt desc)` · `expiresAt` TTL 0.
- `UserDoc.emailVerifiedAt?` · `termsAcceptedAt?` · `termsVersion?`. 마이그레이션 `0010_identity_email_and_terms`
  — 컬렉션 생성 · 인덱스 · users validator 세 필드. 기존 사용자는 셋 다 없음 = 미인증 · 미기록.

**백엔드**
- `platform/mail/client.ts` — `Mailer { send(message): Promise<{ id }> }`, `MailMessage { to, subject, text, html, idempotencyKey }`,
  `MailDeliveryError`. `platform/mail/log.ts`(off) · `platform/mail/resend.ts` · `platform/mail/create-mailer.ts`
  (`createAiClient`와 같은 꼴). `runtime-config`에 `MAIL_PROVIDER` · `RESEND_API_KEY` · `MAIL_FROM` · `MAIL_TIMEOUT_MS`(10초) · `APP_BASE_URL`.
- `modules/identity/mail.ts` — 두 메일의 제목·본문(text + 단순 HTML)과 링크 조립. 문안은 한국어, §13(다음 행동으로 끝난다).
- `modules/identity/service.ts` — `IdentityService(context, { mailer, appBaseUrl })`. `requestPasswordReset` ·
  `confirmPasswordReset` · `requestEmailVerification` · `confirmEmailVerification`. 토큰 발급은 트랜잭션 밖 단일 insert,
  확인은 `findOneAndUpdate({ tokenHash, usedAt: null, expiresAt > now }, { $set: { usedAt } })`로 원자적 소비.
  재설정 확인은 트랜잭션에서 `passwordHash` 갱신 + `identitySessions.updateMany({ userId, revokedAt: null }, revokedAt)` + 새 세션.
  발송 간격: `(userId, kind)`의 최신 토큰 `createdAt`이 60초 안이면 재설정은 조용히 202, 인증은 429.
- 메일은 **요청 안에서 동기 발송**한다(타임아웃 10초). 가입 직후 인증 메일 실패는 `warn` 로그로 삼키고,
  재설정·재발송 요청의 실패는 503 `mail delivery failed`.
- `modules/identity/routes.ts` — 라우트 4개. `modules/publishing/routes.ts` — 발행에 `emailVerifiedAt` 게이트.
- 레거시 MySQL 서비스는 새 메서드를 `throw new Error("not supported")`로 채워 `IdentityApi` 타입만 맞춘다.

**웹** `services/web`
- `lib/api/endpoints.ts` — `auth.requestPasswordReset` · `confirmPasswordReset` · `requestEmailVerification` · `confirmEmailVerification`.
- `app/(auth)/login/forgot/{page,ForgotForm}.tsx` · `app/(auth)/login/reset/{page,ResetForm}.tsx` — `auth.module.css` 재사용.
  `auth-actions.ts`에 `requestPasswordResetAction` · `confirmPasswordResetAction`(성공 시 세션 쿠키 → `/home`).
- `app/verify-email/page.tsx` — 서버 컴포넌트가 confirm을 부르고 `StandaloneNotice`로 결과를 그린다(성공 · 만료 · 이미 인증).
- `components/shell/EmailVerificationNotice.tsx` + `.module.css` — `AppChrome`이 `children` 위에 `Suspense`로 놓는다.
  `requireSession()`(캐시)로 미인증 판정, `resendVerificationAction` 폼. 429는 "잠시 뒤 다시".
- `app/(legal)/layout.tsx` · `terms/page.tsx` · `privacy/page.tsx` — 문서 레이아웃. 본문은 자리 표시 문안과 "최종 개정" 판 번호.
- `SignupForm` — 링크를 `<Link>`로, `termsVersion` hidden. `SocialSignIn`(가입 화면) 아래에 "계속하면 … 동의" 한 줄.
- `deploy-actions.ts` — 403 + `reason` 분기.
- `api/dev/session/route.ts` — 가입 시 `termsVersion` 포함.

## 버린 대안

- **아웃박스 → 워커 발송** — 링크의 원문 토큰이 `outbox_events` payload에 남는다(published 상태로 보존). 해시만 저장한다는
  원칙과 충돌한다. 동기 발송 + 실패 시 사용자에게 다시 시도를 안내하는 쪽이 더 단순하고 안전하다.
- **`engagement.NotificationDeliveryProvider`에 메일 붙이기** — 알림(사용자 설정으로 켜고 끄는 것)과 인증 메일(끌 수 없는 것)은
  다른 것이다. `Mailer`는 플랫폼에 두고, 나중에 알림 공급자가 이걸 쓰면 된다.
- **기존 사용자를 인증된 것으로 간주(grandfather)** — 검증 없이 인증 표시를 붙이는 것이라 하지 않는다. 실제 사용자가
  거의 없는 시점이고, 배포 한 번 전에 인증 메일 한 번이면 끝난다.
- **재설정 요청 429** — 가입 여부를 응답으로 알려 준다. 계정이 있을 때만 조용히 건너뛰고 항상 202.

## 함정

- `AuthenticatedUserSchema`가 `strictObject`라 `emailVerifiedAt` 추가로 계약 테스트 픽스처와 웹 테스트 픽스처가 깨진다.
- `Signup` 타입에 `termsVersion`이 필수가 되어 `identityService.signup({...})`을 부르는 통합 테스트 12곳을 함께 고친다.
- Google 콜백은 이미 세션을 쓰기 전에 `created`를 본다 — 인증 상태는 백엔드가 정하므로 웹은 건드릴 것이 없다.
- `/verify-email`은 로그인 없이 열린다(다른 브라우저에서 링크를 열 수 있다). 프록시 matcher에 넣지 않는다.
- 재설정 확인 뒤 세션을 전부 취소하므로 **지금 로그인한 브라우저의 쿠키도 죽는다** — 새 세션 쿠키를 같은 응답에서 다시 쓴다.
- Resend 무료 구간은 발신 도메인 인증 전에는 계정 이메일로만 보낼 수 있다. DNS(SPF·DKIM) 등록은 운영 절차이고 코드 밖이다.
- `MAIL_TIMEOUT_MS` 안에 Resend가 답하지 않으면 요청은 503이지만 메일은 갔을 수 있다. `Idempotency-Key`를 토큰 ID로 두어
  사용자가 다시 눌러도 같은 메일이 두 번 가지 않게 한다(24시간 창).

## 완료 기준

- `pnpm typecheck` 무오류. contracts · database · backend(`test:infra` 포함) 통과. 웹은 기존 `PropertyValueEditor` 1건 외 통과.
- 브라우저(3010/4020, `MAIL_PROVIDER=off`): 잊으셨나요? → 이메일 제출 → 안내 문구. 백엔드 로그의 링크를 열어 새 비밀번호 →
  `/home`. 이전 세션의 다른 탭은 새로고침 시 로그인으로. 새 계정 가입 → 상단 띠 → 로그 링크 → `/verify-email` 성공 → 띠 사라짐.
  띠가 있는 상태에서 08b 발행 → 인증 안내 문장.
