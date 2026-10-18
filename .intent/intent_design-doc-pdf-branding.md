---
title: 설계서 PDF의 Expresso 브랜딩 적용
slug: design-doc-pdf-branding
stage: intent
status: accepted
author: Nedian0Brien
date: 2026-10-05
---

# 설계서 PDF의 Expresso 브랜딩 적용

## 문제

제출용 PDF(`scripts/doc-pdf.mjs`가 만드는 `docs/졸업작품-설계서.pdf`)가 Expresso의 모습을 하고 있지
않다. 표지는 검은 테두리 상자에 「설 계 서」만 있는 범용 양식이고, 머리말 · 꼬리말은 시스템 글꼴에
남색 선이며, 로고 마크 · 워드마크 · 브랜드 색(espresso · crema · bean)이 어디에도 없다. 본문은 이미
디자인 토큰을 쓰지만 종이로 나온 첫인상은 다른 팀의 문서와 구분되지 않는다.

## 원하는 결과

- 표지: 로고 마크(`services/web/src/components/brand/Logo.tsx` 좌표 그대로)와 워드마크
  「Expre<em>ss</em>o」, 브랜드 색 지면을 쓴 표지. 양식이 요구하는 항목(프로젝트명 · 문서명 「설계서」 ·
  날짜 · 소속 · 팀장/팀원)은 모두 남는다.
- 문서 정보 쪽: 같은 브랜드 서체와 색 체계.
- 머리말 · 꼬리말: 양식 문구(「팀번호 · 프로젝트명 · 버전」 / 「2026 가천대학교, 설계서 · 쪽 번호」)는
  그대로 두고, 로고 마크 · Pretendard/Outfit · espresso 선으로 바꾼다.
- 장 시작(01 – 10): 장 번호와 장 제목에 브랜드 서체와 색을 적용한다.
- 화면과 「PDF로 저장」으로 받는 파일이 같은 디자인이다.

## 영향 범위

`docs/졸업작품-설계서.html`의 인쇄 CSS · 표지 · 문서 정보 마크업, `scripts/doc-pdf.mjs`의 머리말 · 꼬리말
템플릿, `docs/졸업작품-설계서.pdf`. 결정 권한은 사용자(팀장).

## 제약

- 색 · 서체는 `services/web/src/styles/tokens.css`와 디자인 시스템 문서의 토큰만 쓴다. 새 색을 만들지 않는다.
- `docs/AGENTS.md`의 선: 장식용 그러데이션 없음, 숫자는 Outfit 300, 한글에 JetBrains Mono 금지,
  시그니처 지면(bean)은 한 번(표지)만.
- 로고 마크는 `Logo.tsx`의 좌표와 두 색 짝을 그대로 쓴다.
- 본문의 쪽 흐름을 바꾸지 않는다 — 207쪽 안팎을 유지한다.

## 범위 밖

- 본문 장 내용 · 표 구조 변경.
- 다른 문서(제안서 등)와 문서 양식 템플릿(`docs/templates/expresso-doc.html`) 수정.

## 열린 질문

1. 표지의 방향 — 답: 기본안(2026-10-05 사용자 결정). 흰 지면에 로고와 워드마크, 「설계서」를 큰 글자로 두고 아래 띠를 bean 지면으로
   한 담백한 구성. 제안서 표지처럼 espresso 전면 지면으로 갈 수도 있다.
2. 머리말에 로고 마크를 넣는가 — 답: 기본안(2026-10-05 사용자 결정). 넣는다(왼쪽 팀번호 앞, 높이 4mm).
