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
- [ ] `(landing)/page.tsx`가 `generateMetadata`를 내보낸다. `title`은 "Expresso — 채용 공고에 맞춘 포트폴리오", `description`과 `openGraph.description`은 첫 화면 소개 문장, `openGraph.url`은 `APP_BASE_URL` 기준 `/`.
- [ ] 구획 순서: 머리 메뉴 → 첫 화면 → 제작 과정(`id="flow"`) → 기업 맞춤(`id="tailor"`) → 포트폴리오 예시(`id="showcase"`) → 마지막 권유 → 바닥글.
- [ ] 「회원가입」은 `/signup`, 「로그인」은 `/login`으로 가는 `<Link>`다. 머리 메뉴 · 첫 화면 · 마지막 권유 세 곳에 둘 다 있다. 375×812에서 첫 화면 두 버튼의 아래 끝이 812px 위에 있다.
- [ ] 머리글 끝 단어는 정의서와 같은 CSS 키프레임(6초 한 바퀴)으로 바뀐다. 바뀌는 단어는 `aria-hidden`이고 머리글의 접근성 이름은 "Express your work."다.
- [ ] 화면 이미지는 `app/(landing)/images/`의 JPEG를 정적 import해 `next/image`(`placeholder="blur"`)로 그린다. 이미지마다 무엇이 보이는지 `alt`를 쓴다.
- [ ] `ProductTour`(클라이언트)는 6.5초마다 다음 단계로 넘긴다. 마우스 · 포커스가 들어오면 멈추고, 단계를 누르면 그 뒤로 넘기지 않는다. `role="tablist"` · `tab` · `tabpanel`과 `aria-selected` · `aria-controls`를 쓴다. 감춘 패널은 `inert`.
- [ ] `TailorDemo`(클라이언트)는 공고 탭을 누르면 각 기록을 `translateY(순위 × 줄 높이)`로 옮긴다. `aria-posinset`이 순위다.
- [ ] `Reveal`(클라이언트)은 처음부터 화면 안에 있는 구획은 건드리지 않고, 아래 구획만 화면에 들어올 때 보인다.
- [ ] 모든 움직임은 `prefers-reduced-motion: no-preference` 안에 두거나 그 값을 읽어 끈다.
- [ ] 색 · 크기 · 간격 · 글꼴은 `--ex-*` 역할 토큰을 쓴다. 늘 어두운 구획(기업 맞춤 · 바닥글)은 로그인 aside와 같은 `#16223a`에 `data-theme="dark"`를 고정한다.
- [ ] 1023px 이하에서 둘러보기 단계 목록은 가로로 밀리고, 고른 단계의 설명은 화면 아래에 선다. 767px 이하에서 머리 메뉴의 앵커는 숨는다. 가로 스크롤이 없다.

## 설계

**재사용.** `readAccessToken`(`lib/session`), 루트 레이아웃이 불러오는 Outfit · Pretendard, `tokens.css`의 밝은 · 어두운 토큰, 로고 컴포넌트, `Icon`, 공고 상세의 요건 대조 상태 이름 · 아이콘(있음 · 약함 · 없음).

**새로 만드는 것.**
- `app/(landing)/page.tsx` — 리다이렉트 · 메타.
- `app/(landing)/LandingSections.tsx` — 구획 서버 컴포넌트, 둘러보기 단계 데이터, 공고 분석 · AI 대화 그림.
- `app/(landing)/ProductTour.tsx` · `TailorDemo.tsx` · `Reveal.tsx` — 클라이언트 컴포넌트.
- `app/(landing)/landing.module.css`, `app/(landing)/images/*.jpg`(7장), `LandingSections.test.tsx`.

**화면 이미지 출처.** Playwright로 로컬 개발 서버(`expresso_product_fixes` 복사본, `DEV_LOGIN` 계정 = 예시 인물 윤하린)를 1440×900 · 2배율로 찍었다. 재료 고르기 · 디자인 선택 · 편집기 · 공개 사이트 두 개(첫 화면 · 긴 화면 · 휴대폰). 공고 상세는 실제 회사(무신사) 공고라 쓰지 않았다.

**문구 출처.** 단계 이름은 제작 흐름 단계 줄(`WizardShell`)과 같은 말이다. 편집기 채팅 · 이력 되돌리기, 섹션별 체류 분석, 개인 주소 배포는 지금 제품에 있다.

## 버린 대안

- 정의서 HTML을 그대로 옮기는 것. 없는 기능(레시피 편집 · 디자인 3안 · 결제)을 소개하게 된다.
- 모든 단계를 HTML로 그린 그림. 첫 구현에서 썼고, 요청자가 실제 화면을 요구했다. 실제 화면을 찍을 수 없는 두 단계만 남긴다.
- 스톡 사진. 실제 사용자가 아닌 사람이 제품을 쓰는 것처럼 보인다.
- 랜딩을 밝은 화면으로 고정하는 것. 앱과 공개 사이트가 OS 설정을 따르는데 첫 화면만 어긋난다.

## 함정

- `app/page.tsx`와 `(landing)/page.tsx`가 함께 있으면 같은 경로 두 개로 빌드가 멈춘다.
- 공개 호스트의 `/`는 프록시가 `/site/{slug}`로 다시 쓴다. 랜딩은 앱 호스트에서만 그려진다.
- `matchMedia`는 서버에 없다. `useSyncExternalStore`의 서버 값은 "동작 줄임"으로 두어 서버에서 자동 넘김을 시작하지 않는다.
- 단계 목록을 따라가게 할 때 `scrollIntoView`를 쓰면 페이지가 세로로 움직인다. 목록의 `scrollLeft`만 바꾼다.
- 화면 팔레트 토큰(`--ex-ink-900` 등)은 `tokens.test.ts`가 막는다. 늘 어두운 지면은 허용 목록의 `#16223a`를 쓴다.
- 첫 화면 긴 이미지는 1440×2700(높이 = 폭 × 1.875)이고 창은 폭 × 0.6이다. 끝까지 내리는 거리는 이미지 높이의 68%다.

## 완료 기준

```
pnpm --filter @expresso/web typecheck
pnpm --filter @expresso/web test
pnpm --filter @expresso/web build
```

모두 종료 코드 0. 화면 확인은 plan의 「검증」에 적는다.
