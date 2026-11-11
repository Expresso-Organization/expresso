---
title: 공고 분석 동의 없는 공고 검색
slug: jobs-search-consent
stage: plan
status: draft
intent: .intent/intent_jobs-search-consent.md
spec: .intent/spec_jobs-search-consent.md
date: 2026-11-09
---

# 공고 분석 동의 없는 공고 검색 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/contracts/src/job-market.ts` | `InterpretedJobSearchSchema.requiredConsent` 추가 |
| `services/backend/src/modules/jobs/service.ts` | `ConsentError`를 잡아 해석 생략 · `requiredConsent` 반환 |
| `services/backend/src/modules/jobs/jobs.integration.test.ts` | 동의 없음 · 있음 두 경우 검사 |
| `services/web/src/app/(app)/jobs/page.tsx` | `SearchQueryCard`에 동의 안내 |
| `services/web/src/app/(app)/jobs/page.module.css` | 안내 문장 · 링크 스타일 |

## 작업 순서

1. 계약 필드 추가 — contracts 빌드 통과
2. 서비스 수정 — 통합 테스트에 동의 없는 사용자 케이스 추가, `pnpm test:infra`로 확인
3. 웹 안내 — 타입 검사 통과
4. 로컬 화면 확인 — fixture AI 워커 · 동의 없는 계정으로 `/jobs?q=…`

## 가장 위험한 단계

2단계. `ConsentError` 외 오류까지 삼키면 장애를 숨긴다. `instanceof ConsentError`로만 잡는다. 되돌릴 때는 이 커밋만 되돌린다.

## 검증

```
pnpm typecheck
pnpm test
pnpm test:infra
```

화면: 동의 없는 계정 → `/jobs?q=서울 백엔드` → 결과 목록 · 안내 · 「동의 설정 열기」 → `/account#ai-consent`.
