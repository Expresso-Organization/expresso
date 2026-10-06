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

## 실행 중 벗어난 곳

- 새 API를 작성한 에이전트가 기존 7.3.1의 예시 값이 스키마와 다르다고 보고하여, 기존 1 – 9도 같은 방식으로
  계약과 대조해 고쳤다. 상태 값 · 응답 감싸기(`{data}`) · 상태 코드(3번 412, 4번 200, 5번 201/200) ·
  식별자 형식 · 9번 서명 URL의 응답과 만료 시간이 바뀌었다.
- 7.3.6은 계약에 `decidedBy` · `evidenceRecords`가 없어 규칙 일치도 산출 API로 고쳐 쓰고, 유형 표의
  「학습 모델 판정」 행을 「일치도 산출」로 바꿨다.
- 8.2의 「대표 문서」 표는 생성 표와 겹쳐 지웠고, 8.1의 현황 고지 문장 두 개를 함께 지웠다.
