---
title: 설계서 PDF의 Expresso 브랜딩 적용
slug: design-doc-pdf-branding
stage: plan
status: accepted
spec: .intent/spec_design-doc-pdf-branding.md
date: 2026-10-05
---

# 설계서 PDF의 Expresso 브랜딩 적용 — 계획

## 바뀌는 파일

- 새로 만든다: `docs/assets/fonts/outfit-latin-400.woff2` · `outfit-latin-500.woff2` · `OFL.txt`
- 고친다: `docs/졸업작품-설계서.html`(표지 · 문서 정보 마크업, 인쇄 CSS), `scripts/doc-pdf.mjs`
  (머리말 · 꼬리말 템플릿, 목차 제목), `docs/졸업작품-설계서.pdf`

## 순서

1. 표지 · 문서 정보 · 장 머리 — 마크업과 인쇄 CSS. 확인: 헤드리스 PDF 1 – 3쪽을 이미지로 본다.
2. 머리말 · 꼬리말 · 목차 — `doc-pdf.mjs`. 확인: 본문 쪽에서 로고 · Outfit 적용 여부를 본다.
3. PDF 재생성 · 쪽 흐름 비교. 확인: 205 – 210쪽, 장 시작 쪽 ±2.

커밋은 단계마다 하나.

## 가장 위험한 단계

2단계. 머리말 템플릿은 Chrome이 따로 렌더링해 오류가 보이지 않는다. 머리말이 비면 이전 템플릿으로
`git revert` 한다.

## 검증 명령

```bash
node scripts/doc-pdf.mjs docs/졸업작품-설계서.html
```

## 실행 중 벗어난 곳

- 사용자 요청으로 표지 가운데에 로고 구성 그리드(선만)를 넣고, 이를 브랜드 자산으로 만든다.
  `scripts/build-brand-assets.py`가 `Logo.tsx` 좌표 상수에서 `assets/brand/expresso-logo-grid-{light,dark}.svg`를
  생성하고, 개발 포털이 `docs/`만 발행하므로 문서용 사본을 `docs/assets/brand/`에도 쓴다. 표지는 이 파일을
  `<img>`로 쓴다. `draw_mark`의 좌표도 같은 상수로 옮긴다.
- 구성 그리드는 사용자가 준 구성도 양식(단일 면 · 진한 윤곽 · 실선 기준 원 · 점선 외접원과 방사 축 · 교점 네모 표식)을
  따르도록 다시 그렸다. 경계 상자와 모서리 앵커는 뺐다.
