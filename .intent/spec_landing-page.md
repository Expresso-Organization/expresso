---
title: 비로그인 방문자용 랜딩 페이지
slug: landing-page
stage: spec
status: accepted
intent: .intent/intent_landing-page.md
date: 2026-11-02
---

# 비로그인 방문자용 랜딩 페이지 — 명세

## 요구사항

- [ ] `app/page.tsx`를 지우고 `app/(landing)/page.tsx`가 `/`를 맡는다. `readAccessToken()`이 있으면 `redirect("/home")`, 없으면 랜딩을 그린다.
- [ ] `(landing)/page.tsx`가 `metadata`를 내보낸다. `title`은 "Expresso — 공고에 맞춘 포트폴리오", `description`과 `openGraph.description`은 첫 화면 소개 문장, `openGraph.url`은 `APP_BASE_URL` 기준 `/`.
- [ ] 구획 순서: 머리 메뉴 → 첫 화면 → 바리스타 대화 → 만드는 순서(`id="flow"`) → 기업 맞춤(`id="tailor"`) → 기능 셋 → 마지막 권유 → 바닥글.
- [ ] 「회원가입」은 `/signup`, 「로그인」은 `/login`으로 가는 `<Link>`다. 머리 메뉴 · 첫 화면 · 마지막 권유 세 곳에 둘 다 있다. 첫 화면에서는 소개 문단 바로 아래에 같은 크기로 나란히 두고, 「회원가입」은 강조색 채움, 「로그인」은 테두리로 구분한다. 375×812에서 두 버튼의 아래 끝이 812px 위에 있다. 앵커는 같은 페이지 `#flow` · `#tailor`다.
- [ ] 머리글 끝 단어는 클라이언트 컴포넌트 `RotatingWord`가 바꾼다. `prefers-reduced-motion: reduce`이면 첫 단어로 고정한다. 바뀌는 단어는 `aria-hidden`이고 스크린리더에는 "Express your work."가 읽힌다.
- [ ] 제품 화면 그림(첫 화면 · 대화 · 기업 맞춤 · 기능 셋)은 서버 컴포넌트의 정적 마크업이다. 그림 전체에 `aria-hidden="true"`를 주고 바로 옆 제목 · 본문이 뜻을 맡는다.
- [ ] 색 · 크기 · 간격 · 글꼴은 `tokens.css`의 `--ex-*`만 쓴다. 라틴 머리글은 `--ex-font-brand`(Outfit), 나머지는 `--ex-font-ui`. 정의서의 짙은 남색 구획(기업 맞춤)은 토큰의 반전 지면 색으로 그린다.
- [ ] 767px 이하에서 2단 · 3단 배치는 1단으로 쌓이고 머리 메뉴의 앵커는 숨는다. 가로 스크롤이 없다.
- [ ] `robots.ts`는 그대로다. `/`는 이미 허용이다.

## 설계

**재사용.** `readAccessToken`(`lib/session`), 루트 레이아웃이 이미 불러오는 Outfit · Pretendard, `tokens.css`의 밝은 · 어두운 토큰 두 벌, 로고 컴포넌트(앱 사이드바와 로그인 aside가 쓰는 것), `Icon`.

**새로 만드는 것.**
- `app/(landing)/page.tsx` — 리다이렉트와 구획 조립.
- `app/(landing)/LandingSections.tsx` — 구획 서버 컴포넌트들.
- `app/(landing)/RotatingWord.tsx` — 단어 회전(클라이언트).
- `app/(landing)/landing.module.css`.

**문구 출처.** 단계 이름은 제작 흐름 단계 줄(`WizardShell`)과 같은 말이다. 대화 질문 수는 "질문 몇 개"로 쓴다. 세션은 질문 3~6개다(`InterviewSessionSchema`).

## 버린 대안

- 정의서 HTML을 그대로 옮기는 것. 없는 기능(레시피 편집 · 디자인 3안 · 결제)을 소개하게 된다.
- 그림을 스크린샷 이미지로 넣는 것. 화면이 바뀔 때마다 다시 찍어야 하고 어두운 화면에서 어긋난다.
- 랜딩을 밝은 화면으로 고정(`data-theme="light"`)하는 것. 앱과 공개 사이트가 OS 설정을 따르는데 첫 화면만 어긋난다.

## 함정

- `app/page.tsx`와 `(landing)/page.tsx`가 함께 있으면 Next.js가 같은 경로 두 개로 빌드를 멈춘다. 지우고 옮긴다.
- 공개 호스트의 `/`는 프록시가 `/site/{slug}`로 다시 쓴다(`proxy.ts`). 랜딩은 앱 호스트에서만 그려진다.
- 쿠키를 읽으므로 페이지는 동적이다. 정적 생성을 기대하지 않는다.
- `RotatingWord`의 폭이 단어마다 달라 줄이 흔들린다. 가장 긴 단어 폭으로 자리를 잡는다.

## 완료 기준

```
pnpm --filter @expresso/web typecheck
pnpm --filter @expresso/web test
pnpm --filter @expresso/web build
```

모두 종료 코드 0. 화면 확인은 plan의 「검증」에 적는다.
