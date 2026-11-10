---
title: 커리어 기록 삭제 동작 정비
slug: career-record-delete
stage: plan
status: accepted
intent: .intent/intent_career-record-delete.md
spec: .intent/spec_career-record-delete.md
date: 2026-11-10
---

# 커리어 기록 삭제 동작 정비 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/contracts/src/career.ts` | `CareerDeleteImpactResponseSchema` 추가 (고침) |
| `services/web/src/app/api/career/records/[recordId]/delete-impact/route.ts` | 영향 조회 프록시 (새 파일) |
| `services/web/src/features/career-editor/views/record-trash.tsx` | `loadDeleteImpacts` · `RecordTrashConfirm` (새 파일) |
| `services/web/src/features/career-editor/views/views.module.css` | 확인 창 본문 · 버튼 줄 스타일 (고침) |
| `services/web/src/features/career-editor/views/CareerViewShell.tsx` | `requestDelete` · `trashRecords` · `restoreRecords`, 일괄 「삭제」, 패널 `onDelete` 연결 (고침) |
| `services/web/src/app/(app)/career/[categorySlug]/DocumentPanel.tsx` | `onDelete` 속성과 머리말 버튼 (고침) |
| `services/web/src/app/(app)/career/records/[recordId]/RecordPageMenu.tsx` | 기록 페이지 「…」 메뉴 (새 파일) |
| `services/web/src/app/(app)/career/records/[recordId]/page.tsx` | `DocumentHeader`에 `actions`로 메뉴 연결 (고침) |
| `services/web/src/features/career-editor/views/CareerViewShell.test.tsx` | 삭제 흐름 테스트 (고침) |
| `services/web/src/features/career-editor/views/record-trash.test.tsx` | 확인 창 문구 · 영향 합산 테스트 (새 파일) |

## 작업 순서

1. 계약과 프록시 — `pnpm --filter @expresso/contracts build` 통과.
2. `record-trash.tsx`와 스타일 — `record-trash.test.tsx` 통과.
3. `CareerViewShell` 삭제 흐름과 일괄 막대 — 기존 「moves deleted records to the trash with an undo」와 새 테스트 통과.
4. `DocumentPanel` 버튼 — 셸 테스트에서 패널 목(mock)으로 `onDelete` 호출 확인.
5. 기록 페이지 메뉴 — 타입 검사 통과.
6. 검증 — 아래 명령과 브라우저 확인.

## 가장 위험한 단계

3단계. 낙관적 갱신(목록에서 먼저 빼기)과 실패 시 되돌리기를 여러 기록으로 넓히면서 한 기록만 실패할 때 다른 기록까지 되살리거나, 「되돌리기」가 일부만 복원할 수 있다. 실패한 id만 이전 목록에서 다시 넣고, 테스트에서 일부 실패를 재현한다. 깨지면 `deleteRecord`를 이전 단일 구현으로 되돌리고 일괄 삭제만 뺀다.

## 검증

```
pnpm --filter @expresso/web typecheck
pnpm --filter @expresso/web test
```

브라우저(체험 DB 복사본, 워크트리 전용 포트):
- 보드 뷰 카드 → 문서 패널 → 휴지통 버튼 → 카드가 사라지고 「되돌리기」.
- 포트폴리오가 쓰는 기록 → 확인 창의 포트폴리오 수 → 취소 시 남음.
- 기록 페이지 → 「…」 → 휴지통으로 옮기기 → 카테고리 화면 이동 → 휴지통에 있음.
- 표에서 세 개 선택 → 「삭제」 → 「되돌리기」로 세 개 복원.
