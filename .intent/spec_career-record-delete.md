---
title: 커리어 기록 삭제 동작 정비
slug: career-record-delete
stage: spec
status: accepted
intent: .intent/intent_career-record-delete.md
date: 2026-11-10
---

# 커리어 기록 삭제 동작 정비 — 명세

## 요구사항

- [ ] 문서 패널(`DocumentPanel`) 머리말에 「휴지통으로 옮기기」 버튼(`trash` 아이콘)이 있고, 누르면 열린 기록에 삭제 흐름이 돈다. 삭제 뒤 패널이 닫힌다.
- [ ] 기록 전체 페이지(`/career/records/[recordId]`) 머리말 오른쪽에 「…」 메뉴가 있고, 메뉴의 「휴지통으로 옮기기」는 항상 확인 창을 띄운다. 확인하면 `DELETE` 뒤 `/career/{categoryKey}`로 이동한다.
- [ ] 일괄 선택 막대(`선택한 기록 작업`)에 「삭제」 버튼이 있고, 고른 기록 전부에 삭제 흐름이 돈다. 「되돌리기」는 옮긴 기록 전부를 복원한다.
- [ ] 삭제 흐름은 먼저 `GET /career/records/:id/delete-impact`를 부른다. `portfolioCount > 0`인 기록이 하나라도 있으면 확인 창을 띄우고, 확인 전에는 `DELETE`를 보내지 않는다. 모두 0이면 확인 없이 옮기고 지금처럼 「되돌리기」 안내를 띄운다.
- [ ] 영향 조회가 실패하면 기록을 옮기지 않고 "삭제 영향을 확인하지 못했습니다."를 띄운다.
- [ ] 일부 `DELETE`만 실패하면 실패한 기록만 목록에 되돌리고 실패 안내를 띄운다.
- [ ] 영향 응답은 계약(`CareerDeleteImpactResponseSchema`)으로 파싱한다.

## 설계

재사용하는 것:
- 백엔드 `GET /career/records/:recordId/delete-impact`, `DELETE`, `POST …/restore`는 그대로 쓴다. 영향 조회는 트랜잭션 없이 `deletedAt: null`인 기록의 포트폴리오 · 블록 사용 수를 센다(`mongoDeleteImpact`).
- 휴지통 창의 모양(`views.module.css`의 `.trashDialog` · `.trashTitle`)과 `@/components/ui/dialog`를 확인 창에 그대로 쓴다.
- 기록 페이지 「…」는 `CategoryMenu`와 같은 `headerMenuButton` · `AnchoredMenu` · `tabMenuSection` 구조를 쓰고, 위험 항목은 `ViewTabs`처럼 `data-danger="true"`를 붙인다.

새로 만드는 것:
- 계약 `CareerDeleteImpactResponseSchema = z.strictObject({ data: CareerDeleteImpactSchema })` (`packages/contracts/src/career.ts`).
- 웹 프록시 `app/api/career/records/[recordId]/delete-impact/route.ts` (GET). `restore/route.ts`와 같은 모양.
- `features/career-editor/views/record-trash.tsx`
  - `loadDeleteImpacts(ids)`: 기록마다 영향을 받아 `{ usedRecordCount, portfolioCount }`로 합친다. 하나라도 실패하면 `null`.
  - `RecordTrashConfirm`: 확인 창. 제목은 한 개면 「{제목}」, 여러 개면 「기록 N개」를 휴지통으로 옮길지 묻는다. 쓰는 곳이 있으면 한 개일 때 "포트폴리오 N곳에서 이 기록을 근거로 씁니다.", 여러 개일 때 "선택한 기록 중 N개를 포트폴리오가 근거로 씁니다."를 쓰고, 이어서 "옮겨도 그 포트폴리오의 문장은 바뀌지 않습니다."를 쓴다. 끝에 "휴지통에서 30일 동안 복원할 수 있습니다."를 쓴다. 버튼은 「취소」 · 「휴지통으로 옮기기」.
- `CareerViewShell`: `deleteRecord(id)`를 `requestDelete(ids)` → (확인) → `trashRecords(ids)`로 나눈다. `restoreRecord`는 `restoreRecords(ids)`로 일반화한다. 뷰의 `onDeleteRecord`, 패널의 `onDelete`, 일괄 막대가 모두 `requestDelete`를 부른다.
- `DocumentPanel`: `onDelete?: () => void` 속성과 머리말 버튼.
- `app/(app)/career/records/[recordId]/RecordPageMenu.tsx`: 기록 페이지 「…」와 확인 창. 이동 뒤에는 「되돌리기」를 띄울 자리가 없으므로 쓰는 곳이 없어도 확인 창을 띄운다.

## 버린 대안

- 보드 · 갤러리 · 목록 · 타임라인 카드마다 행 메뉴를 새로 만드는 방법: 카드 모양을 다섯 군데 바꿔야 하고, 어느 뷰에서든 카드를 누르면 문서 패널이 열리므로 패널 버튼 하나로 모든 뷰가 덮인다.
- `DELETE`가 영향을 함께 돌려주므로 먼저 지우고 영향을 보여 주는 방법: 명세 T1.3.5는 지우기 전에 확인을 받으라고 한다.

## 함정

- `CareerDeleteImpactSchema`의 `deletedAt` · `purgeAfter`는 조회 시점 기준 값이라 화면에 쓰지 않는다. 보관 기간은 문구의 30일로 쓴다(백엔드 `30 * 86_400_000`과 같다).
- 일괄 삭제는 기록마다 `DELETE`를 따로 보낸다. 일괄 삭제 API는 없다. 기록 수만큼 영향 조회도 따로 보낸다.
- 패널을 연 기록을 지우면 `activeId`를 비워 패널을 닫아야 한다. 지금 `deleteRecord`가 이미 그렇게 한다.
- 기록 페이지는 서버 컴포넌트(`page.tsx`)라 메뉴는 클라이언트 컴포넌트로 따로 둔다.

## 완료 기준

- `pnpm --filter @expresso/web typecheck` 통과.
- `pnpm --filter @expresso/web test` 통과. 새 테스트: 패널 삭제(영향 0 → 확인 없이 옮김), 영향 있음(확인 창 · 취소 시 `DELETE` 없음 · 확인 시 옮김), 일괄 삭제와 되돌리기, 영향 조회 실패.
- 브라우저에서 보드 뷰 → 패널 삭제, 기록 페이지 → 메뉴 삭제 → 카테고리 이동, 일괄 삭제를 직접 해 본다.
