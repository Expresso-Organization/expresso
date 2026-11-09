---
title: 디자인 선택 단계 생성 방식 선택
slug: design-page-format
stage: plan
status: draft
intent: .intent/intent_design-page-format.md
spec: .intent/spec_design-page-format.md
date: 2026-11-09
---

# 디자인 선택 단계 생성 방식 선택 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/contracts/src/generation.ts` | `PageGenerationFormatSchema`, `SubmitGenerationSchema.pageFormat` |
| `packages/database/src/documents/generation.ts` | `GenerationJobDoc` · `PortfolioDoc`에 `pageFormat` |
| `services/backend/src/modules/generation/service.ts` | 저장 · 포트폴리오로 옮기기 · `prepareFreeHtml` 반환 |
| `services/backend/src/modules/page/format-router.ts` | 새 라우터 |
| `services/backend/src/modules/page/generator.ts` · `service.ts` | `context.pageFormat`, `options.pageFormat` |
| `services/backend/src/worker/processors/generation.ts` · `worker/main.ts` · `api/main.ts` | 라우터 연결, 작업 방식 전달 |
| `services/web/src/app/(app)/brew/[brewId]/design/DesignCatalog.tsx` · `.module.css` · `design-actions.ts` | 라디오 · 비활성 · 전달 |
| 시험: `format-router.test.ts` · `processors/generation.test.ts` · `design-actions.test.ts` · `generation.integration.test.ts` | 새 동작 확인 |

## 작업 순서

1. 계약 · 문서 타입 — 계약 빌드 통과
2. 생성 서비스 저장과 반환 — 통합 시험에 `pageFormat` 확인 추가
3. 라우터와 `context.pageFormat` — 라우터 단위 시험
4. 워커 · API 연결 — 처리기 단위 시험
5. 화면과 액션 — 액션 시험, 브라우저 확인
6. `pnpm typecheck` · `pnpm test` · `pnpm test:infra` · 커밋 · PR

## 가장 위험한 단계

4단계. 워커가 생성기를 잘못 고르면 모든 생성이 한쪽 방식으로 나간다. 처리기 시험에서 작업 방식이 `html` · `json-render` · `null`일 때 각각 어느 생성기가 불리는지 확인한다. 되돌리기는 커밋 되돌림으로 충분하다(DB는 선택 칸이 하나 더해질 뿐이다).

## 검증

```
pnpm typecheck
pnpm test
pnpm test:infra
```

화면: 브루의 `/brew/<id>/design` → 생성 방식 「자유 생성」 → 짜임새 칸 비활성 확인 → 「구조화 생성」으로 돌리면 다시 활성.
실제 생성 비교는 AI 공급자가 켜진 서버에서 한다(이번 확인은 AI off).
