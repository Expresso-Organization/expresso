---
title: 설정 프로필 화면과 이메일 인증 안내 자리 이동
slug: account-profile-verification
stage: plan
status: accepted
intent: .intent/intent_account-profile-verification.md
spec: .intent/spec_account-profile-verification.md
date: 2026-10-27
---

# 설정 프로필 화면과 이메일 인증 안내 자리 이동 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/components/shell/EmailVerificationNotice.tsx` | 삭제 |
| `services/web/src/components/shell/EmailVerificationNotice.module.css` | 삭제 |
| `services/web/src/components/shell/ResendVerificationForm.tsx` | 삭제 — 아래 자리로 옮긴다 |
| `services/web/src/components/shell/AppChrome.tsx` | `EmailVerificationNotice` import와 `Suspense` 블록 제거 |
| `services/web/src/app/(app)/account/profile/page.tsx` | 신규 — 프로필 화면 |
| `services/web/src/app/(app)/account/profile/loading.tsx` | 신규 — 같은 뼈대의 대기 화면 |
| `services/web/src/app/(app)/account/profile/ResendVerificationForm.tsx` | 신규 — 옮겨 온 클라이언트 폼, `../page.module.css` 사용 |
| `services/web/src/app/(app)/account/AccountNav.tsx` | `active` 속성 추가, 앞 두 탭을 `Link`로 |
| `services/web/src/app/(app)/account/page.tsx` | `<AccountNav active="plan" />` |
| `services/web/src/app/(app)/account/loading.tsx` | `<AccountNav active="plan" />` |
| `services/web/src/app/(app)/account/page.module.css` | 링크가 된 탭의 호버 색이 어긋날 때만 — `.navItem:hover`에 `color` 명시 |
| `services/web/src/app/(app)/edit/[portfolioId]/deploy/deploy-actions.ts` | 403 문장을 "설정 → 프로필"로 |
| `packages/contracts/src/identity.ts` | `emailVerifiedAt` 주석의 "인증 안내 띠" 수정 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. `AccountNav`에 `active` 속성을 넣고 앞 두 탭을 `Link`로 바꾼다. `account/page.tsx`와
   `account/loading.tsx`의 호출을 함께 고친다. — `pnpm --filter @expresso/web typecheck`가
   `AccountNav` 호출 네 자리를 모두 통과한다.
2. `account/profile/` 아래 `ResendVerificationForm.tsx`를 만든다(셸의 파일 내용을 옮기고
   스타일 경로와 클래스만 바꾼다). — 파일이 `../page.module.css`를 가져온다.
3. `account/profile/page.tsx`와 `loading.tsx`를 쓴다. — 개발 서버에서
   `/account/profile`이 200으로 열린다.
4. `AppChrome`에서 안내 띠를 떼고 셸의 세 파일을 지운다. — `git grep -n
   "EmailVerificationNotice\|components/shell/ResendVerificationForm"` 결과가 비어 있다.
5. `deploy-actions.ts` 문장과 `identity.ts` 주석을 고친다. — `git grep -n "화면 위쪽
   안내\|인증 안내 띠"` 결과가 비어 있다.
6. 검증을 돌린다.

## 가장 위험한 단계

4단계. 안내 띠를 떼면 인증 메일을 다시 받을 입구가 프로필 화면 하나뿐이 된다. 3단계가
끝나 `/account/profile`에서 버튼이 실제로 동작하는 것을 본 뒤에 지운다. 순서가 뒤집히면
미인증 계정이 인증 메일을 받을 방법을 잠시 잃는다.

되돌리기 — 삭제한 세 파일은 `git checkout origin/main -- <경로>`로 돌아온다. 되돌릴 때
`AppChrome`의 import와 `Suspense` 블록도 같이 되살려야 한다.

## 검증

```
pnpm typecheck
pnpm test
```

`pnpm test`는 `@expresso/contracts`와 `@expresso/database`의 `dist`를 먼저 짓는다.
`identity.ts`는 주석만 고치므로 계약 빌드 결과는 달라지지 않는다.

화면 확인 — 워크트리에 `services/web/.env.local`을 두고
`DEV_LOGIN=1` · `DEV_LOGIN_EMAIL`에 아직 쓰지 않은 주소 · `DEV_LOGIN_PASSWORD`를 적는다.
첫 호출에서 가입되므로 그 계정이 미인증 상태다. 웹은 `profile.localhost:<포트>`로 연다
(127.0.0.1을 공유하면 다른 워크트리의 `ex_session` 쿠키를 덮는다). 백엔드는
`MAIL_PROVIDER=off` 기본값으로 띄운다 — 메일을 보내지 않고 로그만 남기면서 API는
성공을 돌려준다.

1. `/` — 본문 맨 위에 누런 띠가 없다.
2. `/account` — 좌측 「프로필」을 눌러 `/account/profile`로 간다.
3. 로그인 주소 줄 — 「인증 메일 보내기」를 누르면 "메일을 보냈습니다"가 되고 버튼이
   비활성이 된다. 아래 경고 줄에 공개 발행이 막혀 있다고 적혀 있다.
4. `/account/profile`에서 「요금제 · 사용량」을 눌러 `/account`로 돌아온다. 두 탭의 호버
   색이 나머지 세 탭과 같다.
5. 같은 미인증 계정으로 포트폴리오 하나를 `/edit/<id>/deploy`에서 공개한다 — 빨간 줄이
   "설정 → 프로필에서 인증 메일을 받아 주세요"로 끝난다.
6. 인증을 마친 계정(`dev01@expresso.test`)으로 `/account/profile` — 버튼이 없고 확인한
   날짜가 `2026.10.20` 형식으로 보인다.
