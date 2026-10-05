---
title: 설계서 그림의 제안서 양식 반영
slug: design-doc-proposal-figures
stage: plan
status: accepted
spec: .intent/spec_design-doc-proposal-figures.md
date: 2026-10-05
---

# 설계서 그림의 제안서 양식 반영 — 계획

## 바뀌는 파일

`docs/졸업작품-설계서.html` · `docs/졸업작품-설계서.pdf` · `docs/design-doc/01` · `03` · `04` · `06`의 그림 설명.

## 순서

1. 역할 색 클래스를 `svg.dg`에 더한다.
2. 하위 에이전트 넷이 조각을 만든다 — A: 4.2 · 4.3 · 단계적 활용, B: 3.1 · 3.2 · 교사 지식 증류,
   C: 1.1 · 6.1, D: 1.2.
3. 조각을 본문과 대조해 넣고, 그림 번호와 참조를 고친다. PDF를 뽑아 그림마다 확인한다.
4. 묶음마다 커밋 `docs: 설계서 … 그림 제안서 양식 반영`.

## 가장 위험한 단계

3단계. 조각 속 수치가 본문과 다를 수 있다. 숫자 · 이름을 본문에서 grep으로 대조하고 다르면 본문을 따른다.

## 검증 명령

```bash
node scripts/doc-pdf.mjs docs/졸업작품-설계서.html
grep -o '그림 [34]\.[0-9]*' docs/졸업작품-설계서.html | sort -u
```

## 실행 중 벗어난 곳

없음
