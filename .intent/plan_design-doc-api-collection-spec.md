---
title: 설계서 7.3 API 설계 확장과 8.2 컬렉션 명세서 자동 생성
slug: design-doc-api-collection-spec
stage: plan
status: accepted
spec: .intent/spec_design-doc-api-collection-spec.md
date: 2026-10-05
---

# 설계서 7.3 API 설계 확장과 8.2 컬렉션 명세서 자동 생성 — 계획

## 바뀌는 파일

- 새로 만든다: `scripts/dump-collection-spec.mjs`
- 고친다: `docs/졸업작품-설계서.html` · `docs/졸업작품-설계서.pdf` · `docs/design-doc/07-API-설계.md` ·
  `docs/design-doc/08-데이터-설계.md`

## 순서

1. **8.2 스크립트** — Docker · `pnpm infra:up` 확인, `@expresso/database` 빌드, 스크립트 작성,
   8.2에 자동 구간 표식을 넣고 생성. 확인: `--check` 0, 임시 DB가 남지 않음(`listDatabases`).
   커밋 `feat: 설계서 컬렉션 명세서 생성 스크립트 추가` · `docs: 설계서 8.2 컬렉션 명세서 전체 생성`.
2. **7.3 API 17개** — 하위 에이전트 3개에 API를 6 · 6 · 5개씩 나누어, 라우트와 Zod 스키마를 읽고
   파라메터 표 · 전송 예시 · 설명 초안을 HTML 조각으로 받는다. 조각을 검토해 스키마와 대조한 뒤
   7.3에 넣고 도입문 · 유형 표를 고친다. 확인: 번호 1 – 26 연속, 계약에 없는 필드 0.
   커밋 `docs: 설계서 7.3 주요기능별 API 설계 17개 추가`.
3. **md · PDF** — md 07 · 08을 HTML에서 변환, PDF 재생성. 확인: 200쪽 이상, 표 잘림 없음.

## 가장 위험한 단계

2단계. 에이전트 초안에 계약에 없는 필드가 섞일 수 있다. 조각마다 속성 이름을 Zod 스키마 파일에서
grep으로 대조하고, 찾지 못한 속성은 지운다. 단계별 커밋이라 `git revert`로 되돌릴 수 있다.

## 검증 명령

```bash
node scripts/dump-collection-spec.mjs --check
grep -c '<h4 data-page="[0-9]*">[0-9]*) ' docs/졸업작품-설계서.html
node scripts/doc-pdf.mjs docs/졸업작품-설계서.html
```

## 자기 점검

- 깨질 수 있는 것: 8.1 · 8.2의 개수 문장, 7.3 유형 표의 대표 번호, PDF 폭.
- 버린 대안(schema.json만 읽기, 정적 분석, 163개 전부)은 spec과 같다.
