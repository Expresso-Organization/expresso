---
title: 재료 고르기 → AI 대화 대기 단축
slug: interview-prestart
stage: plan
status: accepted
intent: .intent/intent_interview-prestart.md
spec: .intent/spec_interview-prestart.md
date: 2026-11-10
---

# 재료 고르기 → AI 대화 대기 단축 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/contracts/src/interview.ts` | `InterviewQuestionBasesResponseSchema` 추가 |
| `services/backend/src/modules/interview/service.ts` | `questionBases` 추가 |
| `services/backend/src/modules/interview/index.ts` | `InterviewApi`에 `questionBases` |
| `services/backend/src/modules/interview/routes.ts` | `GET /brews/:id/interview-bases`, 주석의 "1분쯤" 정정 |
| `services/backend/src/modules/interview/interview.integration.test.ts` | 근거 조회 · 남의 제작물 404 |
| `services/web/src/lib/api/endpoints.ts` | `brews.interviewBases` |
| `services/web/src/app/(app)/brew/[brewId]/brew-actions.ts` | `beginInterviewAction` |
| `services/web/src/app/(app)/brew/[brewId]/materials/page.tsx` | `beginsInterview` · `basisJobId` 계산 |
| `services/web/src/app/(app)/brew/[brewId]/materials/MaterialPicker.tsx` | 시작 버튼 폼 · 저장 중 잠금 |
| `services/web/src/app/(app)/brew/[brewId]/materials/BeginInterviewButton.tsx` (새) | `useFormStatus` 제출 버튼 |
| `services/web/src/app/(app)/brew/[brewId]/Waiting.tsx` · `.module.css` | `detail` 슬롯 · 안내 문구 |
| `services/web/src/app/(app)/brew/[brewId]/counter/QuestionBases.tsx` · `.module.css` (새) | 근거 목록 |
| `services/web/src/app/(app)/brew/[brewId]/counter/page.tsx` | 대기 상태에서 근거 읽기 |
| `services/web/src/app/(app)/brew/[brewId]/counter/basis-kind.ts` (새) | 근거 종류 문구 — 근거 패널과 근거 목록이 같이 쓴다 |
| `services/backend/test/security/security-gate.test.ts` | 새 라우트도 인증 없이 401 |
| 웹 테스트(`Waiting.test.tsx` · `brew-actions.test.ts`) | 안내 문구 · 슬롯 · 근거 목록 · `beginInterviewAction` 키와 이동 |

구현 중 더한 것: 옛 MySQL 통합 테스트는 `InterviewApi`의 새 메서드를 갖지 않아, 그 묶음에서만 거절하는 `questionBases`를 붙였다(그 묶음은 이 라우트를 부르지 않는다).

## 작업 순서

1. 계약 → `pnpm --filter @expresso/contracts build` 통과.
2. 백엔드 `questionBases` · 라우트 · 통합 테스트 → `pnpm test:infra`의 interview 테스트 통과.
3. 웹 `beginInterviewAction` · 재료 화면 → 타입 검사 통과.
4. 웹 `Waiting` 슬롯 · `QuestionBases` · 대화 화면 → 웹 테스트 통과.
5. 브라우저 확인: 재료 화면에서 시작 → 대기 카드와 근거 → 질문.

## 가장 위험한 단계

3단계. 시작 버튼이 잘못된 조건에서 잡을 내면 이미 질문이 있는 제작물의 대화 화면이 대기 카드로 돌아가거나, 돌고 있는 잡 옆에 잡이 하나 더 생긴다. `beginsInterview` 조건을 세션 유무와 잡 상태 둘로 막고, 문제가 생기면 버튼을 기존 링크로 되돌리면 된다(백엔드 변경과 독립).

## 검증

```
pnpm --filter @expresso/backend typecheck && pnpm --filter @expresso/web typecheck
pnpm --filter @expresso/backend test && pnpm --filter @expresso/web test
pnpm test:infra
```

화면: 새 제작물로 재료 화면 → 「AI와 대화 시작」 → 대기 카드에 "물어볼 자리" 목록 → 질문 표시. 질문이 있는 제작물에서 재료로 돌아가 다시 누르면 기존 대화로 간다.
