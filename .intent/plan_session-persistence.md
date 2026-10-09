---
title: 세션 유지와 로그인 진입 정비
slug: session-persistence
stage: plan
status: accepted
intent: .intent/intent_session-persistence.md
spec: .intent/spec_session-persistence.md
date: 2026-09-15
---

# 세션 유지와 로그인 진입 정비 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/contracts/src/identity.ts` | `SESSION_POLICY` 상수, 요청 4종에 `persistent` 기본 true, 발급 세션에 `persistent` |
| `packages/contracts/src/contracts.test.ts` | 발급 세션 픽스처에 `persistent` |
| `packages/database/src/documents/identity.ts` | `IdentitySessionDoc.idleTtlMs` · `absoluteExpiresAt` |
| `packages/database/src/mongodb-migrations/0009/migration.ts` (새) | `identity_sessions` validator에 두 필드 |
| `packages/database/src/mongo-migrations.ts` · `mongo-build.mjs` · `schema.test.ts` · `migrations.test.ts` | 0009 등록(개수 단언 9) |
| `services/backend/src/modules/identity/public.ts` | `IssueIdentitySessionInput.ttlMs` → `persistent` |
| `services/backend/src/modules/identity/service.ts` | 정책으로 발급, 파이프라인 갱신으로 연장 |
| `services/backend/src/modules/identity/legacy-mysql-service.ts` | `persistent` 시그니처만 맞춤 |
| `services/backend/src/modules/identity/auth.integration.test.ts` | 연장 케이스 4개 |
| `services/web/src/lib/auth/session-cookie.ts` (새) · `session-cookie.test.ts` (새) | 쿠키 이름·옵션. `next/headers` 없음 |
| `services/web/src/lib/auth/next-path.ts` (새) · `next-path.test.ts` (새) | `safeNext` · `loginPath` · `PATHNAME_HEADER` |
| `services/web/src/lib/session.ts` | `writeAccessToken(session)` · `clearAccessToken` 두 쿠키 |
| `services/web/src/proxy.ts` · `proxy.test.ts` | `next` 전달, `x-ex-pathname`, 유지 쿠키 재발급 |
| `services/web/src/app/api/auth/expired/route.ts` (새) | 쿠키 삭제 후 `/login?next=` |
| `services/web/src/lib/require-session.ts` | 401 → `/api/auth/expired?next=` |
| `services/web/src/app/(auth)/login/page.tsx` · `LoginForm.tsx` | 로그인 상태면 이동, 유지 체크, `next` |
| `services/web/src/app/(auth)/signup/page.tsx` | 로그인 상태면 이동 |
| `services/web/src/app/(auth)/SocialSignIn.tsx` | 시작 링크에 `persistent` · `next` |
| `services/web/src/app/(auth)/auth.module.css` | 유지 체크 줄(기존 `.consent*` 재사용, 새 값 없음) |
| `services/web/src/app/auth-actions.ts` | `persistent` · `next` · 필드별 오류 |
| `services/web/src/lib/auth/oauth-cookies.ts` | 핸드셰이크·대기 쿠키에 `persistent` · `next` |
| `services/web/src/app/api/auth/google/start/route.ts` · `callback/route.ts` | 둘을 싣고 되돌아올 때 쓴다 |
| `services/web/src/app/api/dev/session/route.ts` | `safeNext` 공용화, 새 `writeAccessToken` |
| `docs/architecture/frontend.md` | 「세션」절 갱신 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 계약 — `identity.ts` · `contracts.test.ts`. `pnpm --filter @expresso/contracts build && pnpm --filter @expresso/contracts test`.
2. 데이터베이스 — 문서 타입 · 0009 마이그레이션 · 등록 셋. `pnpm --filter @expresso/database build && pnpm --filter @expresso/database test`.
3. 백엔드 — `public.ts` · `service.ts` · 레거시 시그니처 → `pnpm --filter backend typecheck`. 그다음 테스트 4개 추가 → `pnpm test:infra`(인프라 `pnpm infra:up`, 마이그레이션 적용 포함).
4. 웹 배관 — `session-cookie.ts` · `next-path.ts` · `session.ts` · `proxy.ts` · `expired` 라우트 · `require-session.ts` · `dev/session`. `pnpm --filter web typecheck && pnpm --filter web test`.
5. 웹 화면·액션 — 로그인·가입 페이지, `LoginForm`, `SocialSignIn`, `auth-actions.ts`, Google 왕복 셋.
6. 브라우저 확인 — 백엔드·웹 dev 서버를 띄우고 spec 「완료 기준」의 세 시나리오를 눌러 본다. 스크린샷과 쿠키 패널.
7. 문서 — `frontend.md`. 커밋·푸시·PR.

커밋은 1+2 `feat: 세션 정책 계약과 슬라이딩 만료 스키마`, 3 `feat: 활동 기준 세션 만료 연장`, 4+5 `feat: 로그인 상태 유지와 진입 경로 복귀`, 7 `docs: …`로 나눈다.

## 가장 위험한 단계

3의 `verifyAccessToken` 파이프라인 갱신. 모든 인증 요청이 지나는 자리라 표현식이 틀리면
전체 401이다. 되돌리기: 이 메서드만 이전 `$set: { lastSeenAt }`으로 복구하면 발급된 세션은
그대로 살아 있다(문서 필드는 추가만 했고 필터는 바꾸지 않는다). 테스트 4개가 `/v1/me`를
실제로 지나므로 여기서 잡힌다.

## 검증

```
pnpm typecheck
pnpm test
pnpm infra:up && pnpm db:migrate && pnpm test:infra
```

UI: `pnpm dev:backend` · `pnpm dev:web`(DEV_LOGIN 끔) 상태에서
- `/login`에서 체크 끄고 로그인 → DevTools 쿠키 `ex_session` Expires = Session, `ex_session_keep` 없음.
- 체크 켜고 로그인 → Expires ≈ +30일, 새로고침 뒤 Expires가 앞으로 밀림, `ex_session_keep` 있음.
- 쿠키 삭제 → `/career/experience` → `/login?next=%2Fcareer%2Fexperience` → 로그인 → 그 자리.
- 로그인 상태에서 `/login` → `/home`.
