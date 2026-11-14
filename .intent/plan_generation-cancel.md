---
title: 포트폴리오 생성 멈추기
slug: generation-cancel
stage: plan
date: 2026-11-14
---

# 포트폴리오 생성 멈추기 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/contracts/src/generation.ts` | `GENERATION_CANCELLED` |
| `services/backend/src/modules/generation/{service,legacy-mysql-service,routes}.ts` | `cancel` · `process` 재실행 막기 · 라우트 |
| `services/backend/src/modules/generation/generation.integration.test.ts` | 멈춤 · 늦은 완료 · 재전달 · 구성 대기 |
| `services/web/src/lib/api/endpoints.ts` | `generation.cancel` |
| `services/web/src/app/(app)/brew/[brewId]/design/{design-actions.ts,Generating.tsx,page.tsx,GenerationWait.module.css}` | 버튼 · 액션 · 안내 |

## 작업 순서

1. 계약 · 서비스 · 라우트
2. 통합 테스트
3. 웹 버튼 · 안내
4. 타입 검사 · generation · brew 웹 테스트, 브라우저에서 멈추기 확인

## 가장 위험한 단계

1단계. 워커가 늦게 끝내는 결과가 완료 · 차감으로 이어지면 멈춘 생성이 크레딧을 쓴다. 통합 테스트에서 멈춘 뒤 `completeFreeHtml`을 불러 차감이 없는지 본다.

## 검증

```
pnpm typecheck
npx vitest run src/modules/generation/            # backend, TEST_MONGODB_URL 포함
npx vitest run "src/app/(app)/brew"               # web
```
