---
title: 공고 분석 동의 없는 공고 검색
slug: jobs-search-consent
stage: spec
status: draft
intent: .intent/intent_jobs-search-consent.md
date: 2026-11-09
---

# 공고 분석 동의 없는 공고 검색 — 명세

## 요구사항

- [ ] AI가 켜져 있고 `job_posting_analysis` 동의가 없으면 `POST /v1/jobs/search/interpret`가 200을 내고 `conditions: []`, `needsClarification: false`, `requiredConsent: "job_posting_analysis"`를 돌려준다.
- [ ] 그 경우 `interpreter.interpret`를 부르지 않는다.
- [ ] 그 경우에도 최근 검색에 남는다(`recentSearchId`).
- [ ] 동의가 있으면 응답에 `requiredConsent`가 없다. AI가 꺼져 있으면 지금과 같다.
- [ ] `/jobs?q=…`가 `requiredConsent`를 받으면 해석 칩 행의 라벨 자리에 동의 안내와 `CONSENT_SETTINGS_HREF` 링크를 그린다.

## 설계

- 계약: `InterpretedJobSearchSchema`에 `requiredConsent: ConsentScopeSchema.optional()`을 더한다. 웹은 이 계약으로 응답을 파싱한다.
- 백엔드: `JobMarketService.interpretSearch`가 `consent.require(userId, "search_interpret")`의 `ConsentError`만 잡는다. 잡으면 해석을 건너뛰고(`conditions = []`) 기존 최근 검색 기록 트랜잭션을 그대로 지난다. 다른 오류는 그대로 던진다. 동의 판정은 기존 `ConsentService.require`를 재사용한다(새 동의 API를 만들지 않는다).
- 웹: `SearchQueryCard`에 `requiredConsent`를 넘긴다. 있으면 「이렇게 이해했습니다」 대신 안내 문장과 링크를 그린다. 문구 이름은 `CONSENT_COPY[scope].title`을 재사용한다. 칩 · 조건 추가 · 저장 버튼은 그대로 둔다. 스타일은 `page.module.css`에 `--ex-*` 토큰만으로 더한다.
- 검색은 `searchFilters(q, [])`가 이미 `{ q }` 원문 검색으로 떨어지므로 바꾸지 않는다.

## 버린 대안

- 웹에서 403을 잡고 해석 없이 진행: 최근 검색이 남지 않고, 같은 처리를 부르는 다른 클라이언트(모바일 등)도 각자 고쳐야 한다.
- 규칙 기반 해석기(`search-parser.ts`)로 대신 해석: 그 경로는 AI 해석으로 교체되며 쓰지 않기로 한 상태다.

## 함정

- `ConsentService.require`는 동의를 지난 경우 `useVersion`을 올린다. 동의가 없을 때는 올리지 않으므로 부작용이 없다.
- `legacy-mysql-service.ts`도 같은 반환 타입을 쓴다. 필드가 optional이라 타입 검사를 지난다.
- 페이지가 `interpret`를 두 번 부른다(해석 · 결과 수 기록). 두 번 모두 200이므로 따로 처리하지 않는다.

## 완료 기준

- `pnpm typecheck` · `pnpm test` 통과, `pnpm test:infra`에서 jobs 통합 테스트 통과.
- 로컬에서 AI를 fixture로 켜고 동의 없는 계정으로 `/jobs?q=서울 백엔드`를 열면 결과와 안내가 보인다.
