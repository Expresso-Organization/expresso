---
title: 설계서 PDF의 Expresso 브랜딩 적용
slug: design-doc-pdf-branding
stage: spec
status: accepted
intent: .intent/intent_design-doc-pdf-branding.md
date: 2026-10-05
---

# 설계서 PDF의 Expresso 브랜딩 적용 — 명세

## 요구사항

- [ ] R1 표지: 흰 지면 위쪽에 로고 마크와 워드마크 「Expre<em>ss</em>o」, 가운데에 kicker · 프로젝트명 ·
      큰 「설계서」 · 버전과 날짜, 아래쪽 띠(bean-50 지면)에 소속과 팀장 · 팀원. 양식 항목이 모두 있다.
- [ ] R2 문서 정보 · 목차 쪽의 제목이 같은 체계(Pretendard 600, espresso 선)를 쓴다. 목차는
      `scripts/doc-pdf.mjs`의 `INJECT_TOC`가 만드므로 거기서 고친다.
- [ ] R3 머리말: 왼쪽 로고 마크(4mm)와 「팀번호: XX」, 가운데 프로젝트명, 오른쪽 버전(Outfit · espresso),
      아래 선 espresso 0.8pt. 꼬리말: 「2026 가천대학교, 설계서」와 쪽 번호(Outfit), 위 선 line-200.
- [ ] R4 장 머리(01 – 10)는 인쇄에서 장 번호를 Outfit 300 큰 숫자 · espresso로, 장 제목 아래 선을
      espresso로 둔다.
- [ ] R5 PDF가 205 – 210쪽이고, 본문 장 · 절의 쪽 흐름이 바뀌지 않는다(장 시작 쪽 차이 ±2 이내).

## 설계

- 표지 · 문서 정보는 기존 `.print-only.print-page` 섹션의 인라인 스타일을 걷어내고 인쇄 CSS 클래스
  (`.cover` · `.docinfo`)로 옮긴다. 로고 SVG는 topbar의 것(Logo.tsx 좌표 · light 짝)을 재사용한다.
- 머리말 · 꼬리말은 Chrome이 별도 문서로 그리므로 웹 글꼴이 오지 않는다. Outfit(라틴, OFL)
  woff2를 `docs/assets/fonts/`에 두고 `doc-pdf.mjs`가 data URI로 넣는다. 한글은 시스템 고딕으로 둔다.
  data URI 글꼴이 머리말에 적용되지 않으면 시스템 글꼴로 두고 그 사실을 보고한다.
- 색은 토큰 값(espresso #9a4030 · crema #e0b486 · bean-50 #fbeee4 · ink-900)만 쓴다. 머리말은 CSS
  변수를 못 읽으므로 같은 값을 상수로 둔다(출처 주석).

## 버린 대안

- espresso 전면 표지 — 사용자가 기본안(흰 지면 + bean 띠)을 골랐다.
- 머리말에 Pretendard 내장 — 한글 글꼴이 수 MB라 쪽마다 넣기 어렵다.

## 함정

- 표지에도 머리말이 찍힌다. 양식 표지에 머리말이 있어도 되므로 그대로 두되, 표지 레이아웃이 머리말과
  겹치지 않게 본문 영역(182×258mm) 안에서 짠다.
- 시그니처 지면(bean)은 표지 한 번만 쓴다.

## 완료 기준

- `node scripts/doc-pdf.mjs docs/졸업작품-설계서.html` → 205 – 210쪽.
- PDF 1 · 2 · 3쪽과 장 시작 쪽, 임의의 본문 쪽을 눈으로 확인한다.
