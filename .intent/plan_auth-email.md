---
title: 메일 인프라와 비밀번호 재설정 · 이메일 인증
slug: auth-email
stage: plan
status: accepted
intent: .intent/intent_auth-email.md
spec: .intent/spec_auth-email.md
date: 2026-09-15
---

# 메일 인프라와 비밀번호 재설정 · 이메일 인증 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/contracts/src/identity.ts` · `contracts.test.ts` | `TERMS_VERSION` · `emailVerifiedAt` · `termsVersion` · 재설정/인증 스키마 · 토큰 형식 |
| `packages/database/src/documents/identity.ts` · `collections.ts` | `IdentityTokenDoc` · `identityTokens` · 사용자 세 필드 |
| `packages/database/src/mongodb-migrations/0010/migration.ts` (새) · `mongo-migrations.ts` · `mongo-build.mjs` · `schema.test.ts` · `migrations.test.ts` | 0010 등록 |
| `services/backend/src/config/runtime-config.ts` · `.env.example` | `MAIL_PROVIDER` · `RESEND_API_KEY` · `MAIL_FROM` · `MAIL_TIMEOUT_MS` · `APP_BASE_URL` |
| `services/backend/src/platform/mail/{client,log,resend,create-mailer}.ts` (새) · `resend.test.ts` (새) | 어댑터 |
| `services/backend/src/modules/identity/{mail,token,service,routes,legacy-mysql-service,public,index}.ts` | 재설정 · 인증 · 동의 기록 · 게이트용 사용자 필드 |
| `services/backend/src/modules/identity/auth.integration.test.ts` | 케이스 7개 |
| `services/backend/src/modules/publishing/routes.ts` · `publishing.integration.test.ts` | 발행 403 게이트 |
| `services/backend/src/api/main.ts` · 통합 테스트 12곳 | 메일러 주입 · `termsVersion` |
| `services/web/src/lib/api/endpoints.ts` · `app/auth-actions.ts` | 엔드포인트 4개 · 액션 3개 |
| `services/web/src/app/(auth)/login/forgot/*` · `login/reset/*` (새) · `login/LoginForm.tsx` | 재설정 화면 · 링크 |
| `services/web/src/app/verify-email/page.tsx` (새) | 인증 완료 |
| `services/web/src/components/shell/EmailVerificationNotice.tsx` · `.module.css` (새) · `AppChrome.tsx` | 인증 띠 |
| `services/web/src/app/(legal)/{layout,terms/page,privacy/page}.tsx` · `legal.module.css` (새) | 문서 페이지 |
| `services/web/src/app/(auth)/signup/SignupForm.tsx` · `SocialSignIn.tsx` · `api/dev/session/route.ts` | 동의 링크 · `termsVersion` · Google 동의 문장 |
| `services/web/src/app/(app)/edit/[portfolioId]/deploy/deploy-actions.ts` | 403 분기 |
| `docs/architecture/backend.md` · `frontend.md` | 메일 어댑터 · 인증 게이트 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 계약 · 데이터 — 스키마와 0010. `pnpm --filter @expresso/contracts build && test`, `--filter @expresso/database build && test`.
2. 메일 플랫폼 — `platform/mail`, `runtime-config`, `.env.example`. Resend 어댑터 단위 테스트(fetch 스텁: 200 · 422 · 타임아웃).
3. 백엔드 identity — 토큰 · 서비스 · 라우트 · 레거시 시그니처 · `main.ts` 주입 · 통합 테스트 12곳 `termsVersion`. `pnpm --filter backend typecheck`.
4. 백엔드 테스트 — `auth.integration.test.ts` 7개 · publishing 게이트 1개. `pnpm test:infra`.
5. 웹 — 엔드포인트 · 액션 · 화면 5개 · 띠 · 배포 메시지 · 개발 로그인. `design-ops`로 띠·문서 페이지 값 고정. `pnpm --filter web typecheck && test`.
6. 브라우저 — spec 완료 기준 시나리오 4개.
7. 문서 · 커밋 · 푸시 · PR(base: `feat/auth-session-persistence`, #23 머지 뒤 `main`으로).

커밋: 1 `feat: 이메일 인증 · 동의 · 일회용 토큰 계약과 스키마`, 2 `feat: 메일 발송 어댑터(off · Resend)`, 3+4 `feat: 비밀번호 재설정과 이메일 인증 API`,
5 `feat: 비밀번호 재설정 · 이메일 인증 화면과 약관 페이지`, 7 `docs: …`.

## 가장 위험한 단계

3의 재설정 확인 — 비밀번호 갱신 · 전 세션 취소 · 새 세션을 한 트랜잭션에 넣는다. 둘 중 하나만 남으면 옛 비밀번호로 열린 세션이
살아 있거나, 비밀번호는 바뀌었는데 로그인이 안 된다. `inTransaction` 안에서만 쓰고 통합 테스트가 "이전 세션 401"을 확인한다.
되돌리기: 라우트 4개는 새 경로라 등록을 빼면 이전과 같다. 0010은 추가만 한다(필수 필드 없음).

## 검증

```
pnpm typecheck
pnpm --filter @expresso/contracts test && pnpm --filter @expresso/database test && pnpm --filter web test
pnpm infra:up && pnpm test:infra
```

UI(3010/4020, `MAIL_PROVIDER=off`, 백엔드 로그에서 링크를 복사):
- `/login` → 잊으셨나요? → 이메일 → "메일을 보냈습니다" → 로그 링크 → 새 비밀번호 → `/home`. 다른 탭 새로고침 → `/login`.
- 새 가입(`termsVersion` 동의) → 홈 상단 띠 → "다시 보내기" → 로그 링크 → `/verify-email` 성공 → 띠 사라짐.
- 미인증 계정으로 08b 발행 → "이메일 인증 뒤에…" 문장. 인증 뒤 발행 성공.
- `/terms` · `/privacy` 열림, 가입 화면 링크가 거기로.
