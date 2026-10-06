---
title: 설계서 7.3 API 설계 확장과 8.2 컬렉션 명세서 자동 생성
slug: design-doc-api-collection-spec
stage: spec
status: accepted
intent: .intent/intent_design-doc-api-collection-spec.md
date: 2026-10-05
---

# 설계서 7.3 API 설계 확장과 8.2 컬렉션 명세서 자동 생성 — 명세

## 요구사항

- [ ] R1 7.3에 아래 17개 API가 기존 9개 뒤에 10) – 26)으로 더해진다. 각각 유형 줄 · 요청 · 응답
      방향 그림(`그림 7.3.N`) · 파라메터 표(`표 7.3.N`, 속성 · IN · OUT · Type · Description) · IN/OUT
      전송 예시 · 설명 한 문단을 갖는다.
- [ ] R2 파라메터 표의 속성 · 타입 · 필수 여부 · enum · 범위는 `packages/contracts/src`의 Zod 스키마와
      `services/backend/src/modules/*/routes.ts`에서 확인한 값이다. 예시 값만 새로 만든다.
- [ ] R3 7.3 도입문과 「요청 · 응답 유형」 표의 대표 열이 26개에 맞게 고쳐진다.
- [ ] R4 `scripts/dump-collection-spec.mjs`가 임시 DB에 MongoDB 마이그레이션 전부를 적용하고
      `listCollections` · `listIndexes`로 읽어, 8.2의 `<!-- collection-spec:auto -->` 구간을 컬렉션별
      필드 표와 인덱스 목록으로 갈아 끼운다. 임시 DB는 끝나면 지운다. `--check`는 달라진 것이 있으면
      종료 코드 1을 낸다.
- [ ] R5 8.2 표는 컬렉션마다 필드 · 타입 · 필수 · 제약(enum · 최대 길이 · 범위)을 적고, UUID pattern은
      「UUID 문자열」로 줄인다. 중첩 객체는 `부모.자식` 경로로 펼친다.
- [ ] R6 8.1 · 8.2의 컬렉션 개수 표기가 스크립트 결과와 같다.
- [ ] R7 md 초안(07 · 08) · PDF가 갱신되고 PDF가 200쪽 이상이다.

### 추가할 API (주요기능별 대표)

| 번호 | 주요기능 | API |
| --- | --- | --- |
| 10 | 로그인 (6.2.1) | `POST /v1/auth/login` |
| 11 | F1.1 카테고리 관리 | `POST /v1/career/categories` |
| 12 | F1.3 기록 문서 편집 | `POST /v1/career/records/:recordId/document/updates` |
| 13 | F1.4 뷰 · 필터 · 정렬 | `GET /v1/career/view-configurations/:viewId/query` |
| 14 | F1.6 스킬 자동 집계 | `GET /v1/career/skills` |
| 15 | F2.2 자연어 검색 | `POST /v1/jobs/search/interpret` |
| 16 | F2.4 공고 상세 | `GET /v1/jobs/postings/:id` |
| 17 | F4.1 소스 기록 추천 | `GET /v1/brews/:id/materials` |
| 18 | F5.2 응답 수집 | `PUT /v1/interview-sessions/:id/answers/:questionId` |
| 19 | F6.1 레시피 생성 | `POST /v1/brews/:id/recipes` |
| 20 | F7.1 지면 생성 | `POST /v1/generation-jobs` |
| 21 | F8.2 대화형 수정 | `POST /v1/portfolios/:id/blocks/:blockId/edit-preview` |
| 22 | F9.1 배포와 버전 | `POST /v1/portfolios/:id/deployments` |
| 23 | F10.1 방문 데이터 수집 | `POST /v1/analytics/events` |
| 24 | F10.2 대시보드 구성 | `GET /v1/portfolios/:id/analytics/dashboard` |
| 25 | F11.1 홈 대시보드 | `GET /v1/home` |
| 26 | F12.1 사용량과 플랜 게이팅 | `GET /v1/entitlements/:capability` |

## 설계

- **7.3**: 기존 9개의 마크업(`h4` · `figure.fig` 안 SVG viewBox 900×130 · 표 · `figure.code` 두 개 · `p`)을
  그대로 복제한다. 그림의 marker id는 `ap10` – `ap26`. API별 사실 확인과 초안 작성은 하위 에이전트에
  나누어 맡기고, 결과 조각을 모아 넣은 뒤 표기 · 문체를 한 번에 맞춘다.
- **8.2 스크립트**: `@expresso/database`의 `migrateMongo({ databaseUrl, databaseName })`로 임시 DB
  `expresso_spec_<uuid>`에 적용한다. 주소는 `MONGODB_URL` · `TEST_MONGODB_URL`, 없으면 `infra:up`의
  `mongodb://127.0.0.1:57017/?replicaSet=rs0` 계열을 쓴다(실제 값은 `.env.example`에서 확인).
  `scripts/dump-erd-schema.mjs`의 구간 교체 · `--check` 방식을 따른다.
- 컬렉션 순서는 8.2 「컬렉션 목록」의 영역 분류를 따르고, 분류에 없는 컬렉션이 있으면 멈춘다.

## 버린 대안

- `0001/schema.json`만 읽기 — 0002 – 0008이 validator를 고치므로 현재 스키마와 다르다.
- 마이그레이션 코드 정적 분석 — `collMod` 조합을 다시 구현해야 하고 틀리기 쉽다.
- 163개 API 전부 설계 — 같은 형태의 반복이 대부분이다. 주요기능 대표로 한정한다.

## 함정

- 영역 분류 표의 개수와 스크립트 결과가 다르면 8.1 · 8.2 본문 숫자도 함께 바뀐다.
- `anyOf` · `bsonType` 배열(nullable) 표기를 일관되게 줄여야 표가 읽힌다.
- 큰 표가 PDF 폭을 넓히지 않게 열을 5개 이하로 둔다(9.2에서 겪은 문제).

## 완료 기준

- `node scripts/dump-collection-spec.mjs --check` 종료 코드 0.
- 7.3의 `<h4 …>N) …` 26개, `그림 7.3.N` · `표 7.3.N`이 1 – 26으로 이어진다.
- `node scripts/doc-pdf.mjs docs/졸업작품-설계서.html` 결과 200쪽 이상, 표가 지면 밖으로 넘치지 않는다.
