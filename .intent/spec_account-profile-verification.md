---
title: 설정 프로필 화면과 이메일 인증 안내 자리 이동
slug: account-profile-verification
stage: spec
status: accepted
intent: .intent/intent_account-profile-verification.md
date: 2026-10-27
---

# 설정 프로필 화면과 이메일 인증 안내 자리 이동 — 명세

## 요구사항

- [ ] `AppChrome`이 더 이상 인증 안내를 그리지 않는다. `EmailVerificationNotice.tsx`와
      `EmailVerificationNotice.module.css`는 저장소에서 사라진다.
- [ ] `/account/profile`이 열린다. `DocumentHeader`의 crumbs는 `["설정", "프로필"]`,
      제목은 「프로필」이다.
- [ ] 프로필 화면에 표시 이름(`session.user.displayName`)과 로그인 주소
      (`session.user.email`)가 한 줄씩 선다.
- [ ] `session.user.emailVerifiedAt`이 `null`이면 로그인 주소 줄 오른쪽에 「인증 메일
      보내기」 버튼이 서고, 줄 아래에 공개 발행이 막혀 있다는 한 문장이 선다.
- [ ] `emailVerifiedAt`이 값이면 같은 줄에 `YYYY.MM.DD 확인됨`만 있고 버튼이 없다.
- [ ] 버튼을 누르면 `resendVerificationAction`이 돌고, 성공하면 버튼 문구가 "메일을
      보냈습니다"로 바뀌며 비활성이 된다. 429·503은 지금과 같은 문장을 그 자리에 낸다.
- [ ] `AccountNav`의 「프로필」은 `/account/profile`로, 「요금제 · 사용량」은 `/account`로
      간다. 지금 보고 있는 쪽에 `navItemActive`가 붙는다. 나머지 세 탭은 지금처럼
      `<button>`으로 남는다.
- [ ] `/account`와 `/account/profile` 각각의 `loading.tsx`가 자기 탭이 강조된
      `AccountNav`를 그린다.
- [ ] 배포 403(`email_verification_required`) 문장이 "설정 → 프로필"을 가리킨다.
- [ ] `pnpm typecheck`와 `pnpm test`가 통과한다.

## 설계

### 재사용

새 스타일 파일을 만들지 않는다. 프로필 화면은 `account/page.module.css`를 그대로 쓴다.

| 쓰는 것 | 어디에 |
|---|---|
| `styles.body` · `styles.nav` · `styles.main` · `styles.title` | 화면 뼈대 — 요금제 화면과 같은 두 단 배치 |
| `styles.section` · `styles.sectionLabel` | 「계정」 구획 |
| `styles.dataRow` · `styles.dataTitle` · `styles.dataNote` · `styles.dataAction` | 왼쪽에 이름·값, 오른쪽에 동작 하나 — 이메일 줄의 모양이 데이터 관리 줄과 같다 |
| `styles.consentRenew` | 발행이 막혀 있다는 경고 한 줄. 동의 갱신 안내와 같은 경고 색을 쓴다 |
| `AppBody` · `DocumentHeader` (`components/shell/AppShell`) | 모든 앱 화면의 공통 머리 |

`EmailVerificationNotice.module.css`의 `.strip` · `.text` · `.email` · `.action` ·
`.status`는 모두 버린다. `.action`/`.status`가 하던 일은 `dataAction`과 `dataNote`가
받는다.

### 자리 이동

- `ResendVerificationForm.tsx`는 `components/shell/`에서
  `app/(app)/account/profile/ResendVerificationForm.tsx`로 옮긴다. 셸 부품이 아니라
  한 화면의 부품이 되었다. `styles` 가져오는 곳을 `../page.module.css`로 바꾸고,
  버튼은 `styles.dataAction`, 결과 줄은 `styles.dataNote`를 쓴다.
- `resendVerificationAction`(`app/auth-actions.ts`)은 그대로 둔다. 호출하는 쪽만 바뀐다.

### 프로필 화면 구성

```
DocumentHeader crumbs=["설정", "프로필"]
AppBody
  div.body
    AccountNav active="profile"
    div.main
      h1.title                    프로필
      div.section
        div.dataRow
          div (왼쪽 블록)
            div.dataTitle         {displayName}
            div.dataNote          표시 이름
        div.dataRow
          div (왼쪽 블록)
            div.dataTitle         {email}
            div.dataNote          2026.10.20 확인됨        ← 인증된 계정
            div.consentRenew      인증 전에는 포트폴리오를 공개 주소에 올릴 수 없습니다  ← 미인증
          ResendVerificationForm  [인증 메일 보내기]        ← 미인증일 때만
```

값이 `dataTitle`에 서고 그 아래 `dataNote`에 무엇의 값인지가 붙는다 — 큰 글씨가 내용,
작은 글씨가 이름이다. 사라지는 띠도 이메일 주소만 굵게 세웠다(`.email`).

인증 여부는 줄의 구성으로 드러난다. 확인된 계정은 오른쪽 자리가 비고 아래에 확인한
날짜만 남는다. 미인증은 오른쪽에 누를 것이 서고 같은 자리에 경고색 한 줄이 선다.
"미인증"이라는 상태 이름을 글로 적지 않는다. 경고 줄은 `consentRow`에서 그렇듯 줄의
왼쪽 블록 안에 둔다 — `consentRenew`는 블록 안에 서는 것을 전제로 한 스타일이다.

구획이 하나뿐이므로 `sectionLabel`을 쓰지 않는다. 제목 「프로필」 아래 「계정」을 다시
적으면 같은 말이 두 번 선다.

확인 날짜는 이 화면의 함수 하나로 만든다 — `emailVerifiedAt.slice(0, 10).replace(/-/g, ".")`.
결제 내역 줄과 같은 `2026.07.12` 형식이다. `analytics/Dashboard.tsx`의 같은 이름 함수는
연도를 버리고(`slice(5)`) 내보내지도 않으므로 쓰지 않는다 — 계정을 만든 해는 지워지면
안 된다.

### AccountNav

```ts
export function AccountNav({ active }: { active: "profile" | "plan" })
```

`ACCOUNT.tabs`의 다섯 항목은 그대로 둔다. 0번(프로필)과 1번(요금제 · 사용량)만
`next/link`의 `Link`로 그리고 나머지는 지금의 `<button type="button">`을 유지한다.
`navItemActive`는 `active`가 가리키는 쪽에 붙는다. 아이콘 색도 같은 조건을 쓴다.

호출하는 네 자리 — `account/page.tsx`, `account/loading.tsx`는 `active="plan"`,
`account/profile/page.tsx`, `account/profile/loading.tsx`는 `active="profile"`.

### 배포 실패 문장

`edit/[portfolioId]/deploy/deploy-actions.ts`의 `message()`에서
`email_verification_required` 분기 문장을 바꾼다.

```
"이메일 인증 뒤에 공개할 수 있습니다. 설정 → 프로필에서 인증 메일을 받아 주세요."
```

### 주석

`packages/contracts/src/identity.ts`의 `emailVerifiedAt` 주석에 있는 "인증 안내 띠"는
없어지므로 "설정 · 프로필 화면"으로 고친다.

## 버린 대안

- **`/account` 한 화면 안의 구획으로 넣기** — 기존 `#ai-consent`처럼 앵커 구획을
  하나 더 두는 방법. 좌측 탭의 「프로필」은 여전히 죽은 버튼으로 남고, 사용자가 말한
  "설정-프로필"과 화면이 어긋난다.
- **배포 실패 줄을 링크로 만들기** — `DeployResult.error`는 문자열 하나이고 배포 화면이
  그것을 그대로 그린다. 링크를 넣으려면 결과 타입과 그리는 쪽을 함께 바꿔야 해서,
  이번 변경이 배포 화면까지 넓어진다.
- **다섯 탭을 모두 라우트로 만들기** — 결제·알림·데이터 관리는 뒤에 붙일 API도 화면
  정의서의 내용도 없다. 빈 화면을 넷 만들게 된다.
- **표시 이름 수정 폼** — 백엔드에 사용자 정보를 고치는 라우트가 없다
  (`modules/identity/routes.ts`). 폼만 그리면 동작하지 않는 UI가 된다.

## 함정

- `requireSession()`은 `cache()`로 감싸여 있어 레이아웃과 화면이 각각 불러도 요청당 한
  번만 나간다. 프로필 화면에서 다시 불러도 호출이 늘지 않는다.
- `account/loading.tsx`가 `AccountNav`를 쓰므로 필수 속성을 추가하면 같이 고쳐야 한다.
  고치지 않으면 `pnpm typecheck`에서 멈춘다.
- `ResendVerificationForm`은 `"use client"`다. 옮긴 뒤에도 그대로 둔다. 화면(`page.tsx`)은
  서버 컴포넌트로 남는다.
- 확인 날짜에 `toLocaleDateString`을 쓰지 않는다. 서버와 브라우저의 로캘이 갈려
  하이드레이션이 어긋난다. ISO 문자열을 잘라 쓴다.
- `styles.navItem`은 `<button>`을 전제로 쓰였다. `global.css`의 `a:hover`는
  `color: var(--ex-fg-strong)`를 (0,1,1)로 거는데 `.navItem:hover`도 (0,1,1)이라,
  링크가 된 두 탭만 호버 색이 달라질 수 있다. 화면에서 보고 어긋나면 `.navItem:hover`에
  `color`를 명시한다. 밑줄은 `a { text-decoration: none }`이 이미 막는다.
- 메일은 `MAIL_PROVIDER=off`일 때 보내지 않고 info 로그로 남긴다(기본값). 그래도 API는
  성공을 돌려주므로 버튼은 "메일을 보냈습니다"가 된다. 링크를 실제로 열어 보려면 백엔드
  로그에서 복사한다. 이 값이 `resend`인데 키가 없으면 503이 떠서 버튼 대신 오류 줄이
  보인다 — 확인용 워크트리는 기본값으로 둔다.
- 화면 정의서(`docs/Expresso Screens.dc.html`)에는 「프로필」 탭만 있고 프로필 화면의
  지면이 없다. 정의서에 없는 화면을 새로 그리는 것이므로, 이번 변경은 기존 설정 화면의
  배치·클래스를 그대로 따르고 정의서에는 손대지 않는다.
- 확인용 계정이 필요하다. `dev01@expresso.test`는 이미 인증된 계정일 수 있으므로,
  미인증 상태는 `DEV_LOGIN_EMAIL`을 새 주소로 두어 첫 호출에서 가입시켜 만든다.

## 완료 기준

```
pnpm typecheck
pnpm test
```

둘 다 통과. 그리고 워크트리 웹을 띄워(`<이름>.localhost:<포트>`) 다음을 눈으로 본다.

1. 미인증 계정으로 `/` 를 열면 본문 위에 띠가 없다.
2. `/account`에서 좌측 「프로필」을 누르면 `/account/profile`이 열린다.
3. 로그인 주소 줄의 「인증 메일 보내기」를 누르면 "메일을 보냈습니다"가 된다.
4. 인증된 계정으로 같은 화면을 열면 버튼이 없고 확인 날짜가 보인다.

## 병합 뒤 수정 (2026-10-27)

`main`의 설정 화면이 한 지면 + 구획 링크 구조로 바뀌어(PR #121) 아래가 달라졌다.

- `/account/profile` 라우트와 그 `loading.tsx`를 만들지 않는다. 「프로필」은
  `account/page.tsx` 안의 `<section id="profile">`이고, `HashScroll`로 다른 구획과
  같은 방식으로 이동한다.
- `AccountNav`에 `active` 속성을 넣지 않는다. `ACCOUNT_SECTIONS` 맨 앞에
  `{ id: "profile", label: "프로필", icon: "user" }`를 더하는 것으로 끝난다.
- `ResendVerificationForm`은 `account/ResendVerificationForm.tsx`에 두고
  `./page.module.css`를 쓴다.
- `.navItem:hover`의 `color` 명시를 되돌렸다. 목록 항목이 모두 `a`가 되어 링크만
  색이 달라지는 어긋남이 없어졌다 — 근거가 사라진 규칙은 남기지 않는다.
- 줄의 구성과 문구는 그대로다. 값이 `dataTitle`, 상태가 `dataNote`,
  미인증 경고가 `consentRenew`, 보낸 결과가 `verifyResult`.
