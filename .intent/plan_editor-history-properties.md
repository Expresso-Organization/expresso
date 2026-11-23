---
title: 다듬기 이력 탭 완성과 속성 탭 정리
slug: editor-history-properties
stage: plan
status: draft
intent: .intent/intent_editor-history-properties.md
spec: .intent/spec_editor-history-properties.md
date: 2026-11-24
---

# 다듬기 이력 탭 완성과 속성 탭 정리 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/contracts/src/page.ts` | `PageChangeSchema` · `RevertPageRevisionSchema`, `GeneratedPageSchema.change` |
| `packages/database/src/documents/portfolio.ts` | `GeneratedPageDoc.change` |
| `packages/portfolio-renderer/src/editing.ts` | `textPathParts` |
| `services/backend/src/modules/page/structured-history.ts` (새) | 판 비교 · 요약 · 되돌리기 |
| `services/backend/src/modules/page/structured-history.test.ts` (새) | 위 모듈 단위 테스트 |
| `services/backend/src/modules/page/structured.mongo.integration.test.ts` | `change` 기록 · 옛 판 추정 · `revertRevision` |
| `services/backend/src/modules/page/service.ts` | 쓰기 지점의 `change`, `revertRevision`, `history` 키, `legacyChange` |
| `services/backend/src/modules/page/public.ts` | `PageServiceError.details`, 서비스 인터페이스에 `revertRevision` |
| `services/backend/src/modules/page/routes.ts` | `POST …/page/revert`, `lift`의 details |
| `services/web/src/lib/api/endpoints.ts` | `page.revert` |
| `services/web/src/app/(editor)/edit/[portfolioId]/edit-actions.ts` | `revertPageAction` |
| `services/web/src/app/(editor)/edit/[portfolioId]/StructuredHistory.tsx` (새) | 구조화 지면 이력 패널 |
| `services/web/src/app/(editor)/edit/[portfolioId]/Editor.tsx` | 이력 탭 연결, 패널 머리 문구 |
| `services/web/src/app/(editor)/edit/[portfolioId]/ElementProperties.tsx` | 속성 탭 순서 · 묶음 · 접기 · 저장 띠 |
| `services/web/src/app/(editor)/edit/[portfolioId]/page.module.css` | 이력 줄 누르기, 속성 탭 레이아웃 |

## 작업 순서

1. 계약 · 문서 타입 · `textPathParts` — `pnpm --filter @expresso/contracts build`가 통과한다.
2. `structured-history.ts`와 테스트 — 단위 테스트가 비교 · 요약 · 되돌리기 · 충돌을 통과한다.
3. 서비스 쓰기 지점 · `revertRevision` · `history` · 라우트 — 백엔드 테스트 · 타입 검사 통과.
4. 웹 API · 액션 · `StructuredHistoryPanel` · `Editor` 연결 — 로컬에서 이력 줄 · 거르기 · 되돌리기 · 화면에서 보기 · 복원을 눌러 본다.
5. 속성 탭 정리 — 수치 띠 · 사례 · 첫 화면을 골라 1440 화면에서 캡처해 본다.
6. 전체 검증 — 두 패키지 test · typecheck.

## 가장 위험한 단계

3단계의 `revertRevision`. 잎 칸 병합이 틀리면 지면 검증을 통과하지 못하거나 다른 편집을 덮는다. 새 판으로만 쌓으므로 잘못된 결과도 「복원」으로 되돌릴 수 있다. 병합은 2단계 테스트로 먼저 고정한다.

## 검증

```
pnpm --filter @expresso/backend typecheck && pnpm --filter @expresso/backend test
pnpm test:infra
pnpm --filter @expresso/web typecheck && pnpm --filter @expresso/web test
```

화면: 관리자 → 문가령으로 보기 → 「무신사 지원 포트폴리오」 다듬기. 속성 탭에서 수치 띠 글자 크기를 바꿔 저장 → 이력 맨 위 직접 편집 줄 확인 → 사례 글 하나 고쳐 저장 → 수치 띠 줄의 「되돌리기」 → 사례 글이 남았는지 확인 → 「AI 편집」 거르기 → 줄 누르기로 요소 고르기 → 「AI 생성 직후」 복원.
