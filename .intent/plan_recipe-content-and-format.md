---
title: 레시피 세 영역 — 내용 고르기 · 문장 종류 · 보여주는 형식
slug: recipe-content-and-format
stage: plan
status: accepted
intent: .intent/intent_recipe-content-and-format.md
spec: .intent/spec_recipe-content-and-format.md
date: 2026-09-15
---

# 레시피 세 영역 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/contracts/src/recipe-vocabulary.ts` | 역할 · 형식 · 종류 enum, 역할별 형식 표, 한국어 이름 (새로) |
| `packages/contracts/src/recipe-v2.ts` | 섹션 role · presentation, 문장 kind · 값, `update_item_content` (고침) |
| `packages/contracts/src/recipe.ts` | 플래너 초안에 kind · metric · link · caption · role · presentation (고침) |
| `packages/contracts/src/media.ts` · `index.ts` | 목록 응답 스키마 · export (고침) |
| `packages/contracts/src/contracts.test.ts` | 새 스키마 파싱 (고침) |
| `packages/database/src/documents/recipe.ts` | 문서 필드 (고침) |
| `packages/database/src/mongodb-migrations/0006/migration.ts` | `extendValidator` export (고침) |
| `packages/database/src/mongodb-migrations/0009/migration.ts` | 검증기 확장 (새로) |
| `packages/database/src/mongo-migrations.ts` | 0009 등록 (고침) |
| `services/backend/src/modules/recipe/recipe-v2-service.ts` | 읽기 · 적용 · restore · 이관 (고침) |
| `services/backend/src/modules/recipe/service.ts` | v1 저장에 content · role/presentation (고침) |
| `services/backend/src/modules/recipe/planner.ts` | 프롬프트 · 폴백 role (고침) |
| `services/backend/src/modules/recipe/recipe-v2.integration.test.ts` | 새 필드 검사 (고침) |
| `services/web/src/styles/tokens.css` | 미리보기 파란 토큰 (고침) |
| `services/web/src/lib/api/endpoints.ts` | `media.list` (고침) |
| `services/web/src/components/ui/MediaUploader.tsx` | 올리기 공용 (새로) — `MediaDrop`이 이것을 씀 |
| `services/web/src/app/(app)/edit/[portfolioId]/MediaDrop.tsx` | 올리기 부분을 공용으로 (고침) |
| `services/web/src/app/(app)/brew/[brewId]/recipe/recipe-actions.ts` | `uploadMediaAction` (고침) |
| `services/web/src/app/(app)/brew/[brewId]/recipe/recipe-editor.ts` | 리듀서 분기 (고침) |
| `services/web/src/app/(app)/brew/[brewId]/recipe/Wireframe.tsx` · `.module.css` | 형식 와이어프레임 (새로) |
| `services/web/src/app/(app)/brew/[brewId]/recipe/SourceRail.tsx` | 왼쪽 세 탭 (새로) |
| `services/web/src/app/(app)/brew/[brewId]/recipe/FormatPanel.tsx` | 오른쪽 형식 목록 (새로) |
| `services/web/src/app/(app)/brew/[brewId]/recipe/Workbench.tsx` · `.module.css` | 세 영역 · 역할 · 종류별 칸 · 목차 줄 (고침) |
| `services/web/src/app/(app)/brew/[brewId]/recipe/Setup.tsx` · `.module.css` | 「미디어」 카드 (고침) |
| `services/web/src/app/(app)/brew/[brewId]/recipe/page.tsx` | 미디어 목록 전달 (고침) |
| `docs/architecture/portfolio-creation-flow-v2.md` | §7 정정 · §20 (고침) |

## 작업 순서

1. 계약 — 어휘 파일, v2 · 초안 · 미디어 스키마, 테스트. `pnpm --filter @expresso/contracts test`.
2. 저장 — 문서 · 0009 · 등록. `pnpm --filter @expresso/database build` · `pnpm db:migrate`.
3. 백엔드 — v2 서비스 · v1 저장 · 플래너. 통합 테스트. `pnpm test:infra`.
4. 토큰 · 미디어 — 파란 토큰, `media.list`, `MediaUploader`, `uploadMediaAction`.
5. 편집기 훅 — 리듀서 분기.
6. 와이어프레임 — 형식 id → SVG + keyframes. 화면 없이 `/dev` 없이 Workbench 안에서 확인.
7. Workbench — 세 영역, SourceRail, FormatPanel, 역할 select, 종류별 칸, 목차 줄.
8. Setup — 미디어 카드. page.tsx — 미디어 목록.
9. 문서 — §7 · §20.
10. 검증 — spec 「완료 기준」. 커밋은 계약+저장+백엔드 하나, 웹 하나, 문서 하나.

## 가장 위험한 단계

7번. 세 영역과 종류별 칸이 한 파일에 몰린다. 되돌리는 방법: 새 파일(SourceRail ·
FormatPanel · Wireframe)은 독립이라 Workbench의 배선만 빼면 앞 작업 화면으로 돌아간다.
3번의 `restore`가 새 필드를 빠뜨리면 되돌리기가 종류를 지운다 — 통합 테스트가 왕복을 잡는다.

## 검증

```
pnpm --filter @expresso/contracts build && pnpm --filter @expresso/database build
pnpm db:migrate
pnpm typecheck
pnpm test
pnpm test:infra
```

브라우저 — spec 「완료 기준」 그대로. 브루 `0b7a…`(섹션 6)와 `532f…`(섹션 2).
