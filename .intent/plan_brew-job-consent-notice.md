---
title: 질문·레시피 작업의 동의 실패 안내
slug: brew-job-consent-notice
stage: plan
status: accepted
spec: .intent/spec_brew-job-consent-notice.md
date: 2026-10-26
---

# 질문·레시피 작업의 동의 실패 안내 — 계획

## 순서

1. 계약 · 문서 타입
   - `packages/contracts/src/jobs.ts`: `failure.requiredConsent`
   - `packages/database/src/documents/brew.ts`: `BrewJobDoc.requiredConsent`
2. 백엔드
   - `brew-jobs/public.ts`: `FailureClassifier` 반환 확장
   - `brew-jobs/service.ts`: `brewJobStatus` 추출, `process` · `submit`에 `requiredConsent` 기록 · 초기화
   - `brew-jobs/index.ts`: `brewJobStatus` 내보내기
   - `materials/service.ts`: `latestJob`을 `brewJobStatus`로
   - 구 MySQL 두 곳: `requiredConsent: null`
   - `worker/processors/brew-jobs.ts`: `ConsentError` 분기, 주석
3. 웹
   - `src/lib/consent-copy.ts` 새 파일, `account/page.tsx`가 가져다 쓰고 동의 묶음에 `id="ai-consent"`
   - `Waiting.tsx` · `Waiting.module.css`: 동의 실패 문구와 링크
4. 테스트
   - `worker/processors/brew-jobs.test.ts`: `ConsentError` → `CONSENT_REQUIRED` · `UnrecoverableError`
   - `brew-jobs.integration.test.ts`: 동의 실패 기록 · 브루 상태 · 새 키 재시도 성공
   - `services/web/.../Waiting.test.tsx`: 동의 실패 · 일반 실패 문구
5. 검증
   - `pnpm typecheck`, `pnpm test`, `pnpm infra:up` 후 `pnpm test:infra`
   - 이 워크트리의 개발 서버로 dev01 계정의 동의를 끄고 03 화면에서 질문 만들기 → 안내 · 링크 → 동의 켜고 다시 누르기

## 검증 명령

```bash
pnpm typecheck
pnpm test
pnpm test:infra
```

## 위험

- 화면 확인은 워커가 떠야 한다. `AI_PROVIDER=off`로 띄우면 질문 생성은 규칙 기반이라 동의 검사(`this.writer`가 있을 때만)를 지나지 않는다. 화면 확인은 AI를 켠 워커가 필요하며, 키가 없으면 단위 · 통합 테스트로 갈음하고 그 사실을 보고한다.
