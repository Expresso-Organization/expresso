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
| `services/web/src/app/(landing)/page.tsx` | 새로 · 로그인 분기 · 메타 |
| `services/web/src/app/(landing)/LandingSections.tsx` | 새로 · 구획 서버 컴포넌트 · 둘러보기 단계 · 그림 둘 |
| `services/web/src/app/(landing)/ProductTour.tsx` | 새로 · 제작 과정 둘러보기 |
| `services/web/src/app/(landing)/TailorDemo.tsx` | 새로 · 공고별 기록 순서 데모 |
| `services/web/src/app/(landing)/Reveal.tsx` | 새로 · 스크롤 등장 |
| `services/web/src/app/(landing)/landing.module.css` | 새로 |
| `services/web/src/app/(landing)/images/*.jpg` | 새로 · 실제 화면 7장 |
| `services/web/src/app/(landing)/LandingSections.test.tsx` | 새로 · 링크 세 쌍, 머리글 이름, 앵커, 단계 전환, 순서 바꾸기 |

## 작업 순서

1. 브랜치 `feat/landing-page`를 `origin/main`에서 딴다.
2. 정의서 CSS에서 구획별 간격 · 크기 · 색을 뽑아 토큰과 짝을 맞춘다.
3. `page.tsx` 이동과 로그인 분기 — 로그인 · 로그아웃 각각 `/` 응답 확인.
4. 문체 · 랜딩 모범 사례를 검색해 문구 원칙과 구성을 정한다(요청자 지적 뒤 추가한 단계).
5. 로컬 서버에서 실제 화면을 찍는다 — 찍은 이미지를 열어 개발 표시 · 개발 주소 · 실제 회사 이름이 없는지 본다.
6. 구획 · 클라이언트 컴포넌트 · CSS — 1280px · 375px · 밝은 · 어두운 화면 확인.
7. 메타 — `curl`로 `<title>` · `og:*` 확인.
8. 문구 점검 — 사물을 사람처럼 쓴 문장, 대구 · 잠언, 번역투, 개수 세기가 없는지 문장마다 본다.
9. 검증 명령 · 커밋 · 푸시 · PR.

## 가장 위험한 단계

5단계. 찍은 화면에 실제 회사 이름, 개발 주소, 깨진 데이터(관계 속성의 UUID 등)가 섞이면 그대로 소개 화면에 나간다. 화면마다 이미지를 열어 확인하고, 문제가 있는 화면(공고 상세 · 커리어 목록 · 분석)은 쓰지 않는다. 되돌릴 때는 `images/`의 해당 파일과 그 `import`만 지우면 된다.

## 검증

```
pnpm --filter @expresso/web typecheck
pnpm --filter @expresso/web test
pnpm --filter @expresso/web build
curl -s http://landing.localhost:3120/ | grep -o '<title>[^<]*'
```

화면: 로그아웃 상태 `/`를 1280px · 375px · 밝은 · 어두운 화면으로 연다. 스크롤 전에 「회원가입」 · 「로그인」이 보인다. 둘러보기 단계를 눌러 화면이 바뀌는지, 기업 맞춤 공고를 눌러 순서가 움직이는지 본다. 로그인 상태 `/` → `/home`.

## 2차 개편 (2026-11-02) — 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/app/(landing)/HeroPassage.tsx` | 새로 · 3D 첫 화면 구간 |
| `services/web/src/app/(landing)/LandingHeader.tsx` | 새로 · 첫 화면 위 머리 메뉴 |
| `services/web/src/app/(landing)/BrewDemo.tsx` | 새로 · 공고 주문서 데모(`TailorDemo` 대신) |
| `services/web/src/app/(landing)/motion/engine.js` · `wgsl-std.ts` · `cup-shader.ts` | 새로 · 3D 엔진 · 표준 함수 · 잔 셰이더 |
| `services/web/src/app/(landing)/images/hero-cup.jpg` · `site-flow-long.jpg` | 새로 · 포스터 · 예시 사이트 긴 화면 |
| `services/web/src/app/(landing)/Reveal.tsx` · `TailorDemo.tsx` · `images/site-grid.jpg` | 삭제 |
| `services/web/src/app/(landing)/LandingSections.tsx` · `landing.module.css` · `LandingSections.test.tsx` | 구성 · 움직임 개편 |

순서: 스킬 설치 · 원문 검토 → 셰이더를 `check-shader.mjs`로 검증하고 `render-headless.mjs`로 시작 · 끝 · 좁은 화면 구도를 렌더해 확인 → 컴포넌트 → 1280px · 375px · 스크롤 0 · 35% · 끝 · 공고 전환을 브라우저에서 확인 → 검증 명령.

가장 위험한 단계: WebGPU 장면. 지원하지 않는 브라우저나 GPU 실패에서 빈 화면이 되면 첫 화면이 사라진다. 포스터를 캔버스 아래에 깔아 두고, 실패는 콘솔 경고로만 남긴다. 되돌릴 때는 `HeroPassage`의 엔진 호출만 빼면 포스터 첫 화면이 된다.
