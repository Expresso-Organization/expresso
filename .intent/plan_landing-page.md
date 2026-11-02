---
title: 비로그인 방문자용 랜딩 페이지
slug: landing-page
stage: plan
status: accepted
intent: .intent/intent_landing-page.md
spec: .intent/spec_landing-page.md
date: 2026-11-02
---

# 비로그인 방문자용 랜딩 페이지 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/app/page.tsx` | 삭제 |
| `services/web/src/app/(landing)/page.tsx` | 새로 · 로그인 분기 · 메타 · 구획 조립 |
| `services/web/src/app/(landing)/LandingSections.tsx` | 새로 · 구획 서버 컴포넌트 |
| `services/web/src/app/(landing)/LandingSections.test.tsx` | 새로 · 세 자리 로그인 · 회원가입 링크, 머리글 접근성 이름, 앵커 |
| `services/web/src/app/(landing)/landing.module.css` | 새로 · 단어 회전 키프레임 포함 |

## 작업 순서

1. 브랜치 `feat/landing-page`를 `origin/main`에서 딴다.
2. 정의서 CSS에서 구획별 간격 · 크기 · 색을 뽑아 토큰과 짝을 맞춘다 — 토큰에 없는 값은 가장 가까운 토큰으로 정하고 목록을 남긴다.
3. `page.tsx` 이동과 로그인 분기 — 로그인 · 로그아웃 각각 `/` 응답 확인.
4. 머리 메뉴 · 첫 화면 · 단어 회전 키프레임 — 1280px · 375px에서 스크롤 전에 「로그인」 · 「회원가입」이 보이는지 `getBoundingClientRect`로 확인.
5. 나머지 구획 — 1280px · 375px · 어두운 화면 확인.
6. 메타 — `curl`로 `<title>` · `og:*` 확인.
7. 문구 점검 — 화면의 모든 문장이 지금 제품에 있는 기능인지 대조하고, 레이아웃이 이미 말하는 문장은 지운다.
8. 검증 명령 · 커밋 · 푸시 · PR.

## 가장 위험한 단계

5단계. 그림 넷이 정의서 구성을 따르면서 지금 제품의 화면을 그려야 한다. 그림이 실제 화면과 다르면 다시 거짓 소개가 된다. 각 그림은 대응하는 실제 화면(공고 상세 요건 대조, AI 대화, 재료 고르기, 편집기 · 분석)을 로컬 서버에서 열어 놓고 맞춘다. 어긋나면 그 그림만 고친다.

## 검증

```
pnpm --filter @expresso/web typecheck
pnpm --filter @expresso/web test
pnpm --filter @expresso/web build
curl -s http://product.localhost:3120/ | grep -o '<title>[^<]*'
```

화면: 로그아웃 상태 `/`를 1280px · 375px · 밝은 · 어두운 화면으로 연다. 스크롤 전에 「로그인」 · 「회원가입」이 보인다. 「회원가입」 → `/signup`, 「로그인」 → `/login`, 앵커 두 개가 해당 구획으로 간다. 로그인 상태 `/` → `/home`.
