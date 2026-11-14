---
title: 재료 고르기 후보 갱신과 초안 안내
slug: draft-records-materials
stage: plan
date: 2026-11-14
---

# 재료 고르기 후보 갱신과 초안 안내 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/contracts/src/materials.ts` | `draftCount` |
| `services/backend/src/modules/materials/service.ts` | 라벨 읽기 함수 분리 · `#syncSources` · 읽기 필터 · `draftCount` |
| `services/backend/src/modules/materials/materials.integration.test.ts` | 정리 후 후보 추가 · 대화 시작 후 고정 · 초안 수 |
| `services/web/src/app/(app)/brew/[brewId]/materials/MaterialPicker.tsx` · `page.module.css` | 초안 안내 |
| 웹 테스트 픽스처 | `draftCount` 필드 |

## 작업 순서

1. 계약 필드 추가 → 타입 검사로 깨지는 픽스처 찾기
2. 서비스 — 라벨 함수, `#syncSources`, 읽기 필터, `draftCount`
3. 통합 테스트
4. 화면 안내
5. `pnpm typecheck` · 백엔드 · 웹 테스트 · `test:infra`(materials)

## 가장 위험한 단계

2단계. GET이 쓰기를 한다. `status === "draft"`에서만, 새 줄이 있을 때만 쓰고 upsert라 반복 호출에도 같은 결과다.

## 검증

```
pnpm typecheck
pnpm --filter @expresso/backend test
pnpm test:infra -- materials
```
