---
title: 다듬기 이력 탭 완성과 속성 탭 정리
slug: editor-history-properties
stage: spec
status: draft
intent: .intent/intent_editor-history-properties.md
date: 2026-11-24
---

# 다듬기 이력 탭 완성과 속성 탭 정리 — 명세

## 요구사항

- [ ] 구조화 지면의 새 판은 저장할 때 `change { actor, kind, summary }`를 남긴다. 생성 · 다듬기 · 에이전트 고침은 `ai`, 직접 편집 · 기록 추가 · 판 복원 · 변경 되돌리기는 `user`다.
- [ ] `change`가 없는 옛 판도 `history`가 `instruction` · `generationJobId` · 다른 판의 `refinement.revisionId`로 종류와 요약을 추정해 내려준다.
- [ ] `GET …/page/history`의 각 판은 바로 앞 판과 비교해 바뀐 요소 키(`change.keys`)를 싣는다.
- [ ] `POST …/page/revert { revision, expectedRevision, force? }`가 판 `revision`의 변경만 무른 새 판을 쌓는다. 그 뒤에 같은 칸이 또 바뀌었으면 `force` 없이는 409(`details.reason = "revert_conflict"`)를 내고, `force`면 덮는다. 최신 판 번호가 다르면 지금처럼 409. 무를 것이 없으면 409, 결과가 지면 검증에 걸리면 422다. 되돌리기는 지면 스냅샷만 바꾼 판(`element` · `edited` · `record` · `reverted`)에만 있다 — 생성 · 다듬기 · 복원 판은 스타일 · 스크립트까지 바꾸므로 「복원」만 쓴다.
- [ ] 이력 탭(구조화 지면)은 오늘 · 어제 · 날짜 묶음, 주체 표시, 요약, 「N분 전」, 「지금 보는 상태」, 줄마다 「되돌리기」, 「전체 · AI 편집 · 직접 편집」 거르기, 되돌릴 수 있는 지점 세 종류와 「복원」을 보인다. 지점은 판 번호로 겹침을 없애고 지금 판과 같은 지점은 숨긴다.
- [ ] 이력 줄을 누르면 `change.keys` 가운데 최신 지면에 남아 있는 첫 요소를 고르고 스크롤한다. 남은 요소가 없으면 누를 수 없다.
- [ ] 속성 탭은 글 → 모양 → 글자 순서, 글 칸 묶음 제목 + 짧은 칸 이름, 접히는 글자 부분(고른 부분만 펼침), 고정 폭 칸 이름 열, 패널 아래에 붙는 저장 띠(바뀐 곳 수 · 변경 취소 · 저장)를 갖는다. 저장하는 값과 서버 요청은 바뀌지 않는다.

## 설계

**계약** — `packages/contracts/src/page.ts`에 `PageChangeSchema = { actor: "ai"|"user", kind: "generated"|"refined"|"element"|"edited"|"record"|"restored"|"reverted", summary(≤200), keys(≤40) }`와 `RevertPageRevisionSchema`를 더하고 `GeneratedPageSchema.change`를 선택 칸으로 둔다. DB 검증 규칙은 추가 칸을 허용하므로(`0001/schema.json`, `additionalProperties` 없음) 마이그레이션은 없다. `GeneratedPageDoc.change`를 더한다.

**판 비교** — 새 순수 모듈 `services/backend/src/modules/page/structured-history.ts`.
- 병합은 잎 칸까지 내려간다. 객체는 키별로, id가 있는 배열(`sections` · `career` · `evidence`)은 id별로 내려간다. 순번 배열(`metrics` · `details` · `steps` · `points`)은 세 판의 길이가 같을 때만 자리별로, 아니면 배열 통째로 본다. Spec 노드의 `children`은 판 N이 더한 키를 빼고 뺀 키를 다시 넣는다(순서만 바꾼 경우는 통째). 수치 띠처럼 여러 섹션의 글을 보이는 요소의 편집과 사례 본문 편집이 같은 섹션 안 다른 칸이면 서로 겹치지 않는다.
- `changedElementKeys(before, after)`: 노드가 다르거나 `elementTextPaths`(portfolio-renderer `editing`)의 글이 달라진 요소 키. 루트는 자식 순서가 바뀐 경우만 넣는다.
- `describeChange(before, after)`: 바뀐 요소를 `elementTitle`로 불러 "수치 띠 · 글 2곳, 글자 모양 고침", "목차 순서 바꿈" 같은 요약을 만든다.
- `revertChange(before, changed, current, force)`: 판 N에서 바뀐 잎 칸마다 current가 changed와 같으면 before로 바꾸고, before와 같으면 둔다. 둘 다 아니면 충돌로 모은다. 결과를 `validateStructuredPortfolio`로 검사한다.

**서비스** — `nextRevision`과 `#commitStructured`의 note는 `change`를 필수 인자로 받는다(바탕 판의 `change`가 새 판에 따라오지 않게). `PageService`의 각 쓰기 지점(`generate` · `refine` · `editComposition` · `editElementByAgent` · `addRecordSection` · `restoreRevision`)이 `change`를 넣는다. `#commitStructured`의 note에 `change`를 받는다. `editComposition`은 `describeChange`로 요약을 만든다. 새 `revertRevision`은 `#structured`로 최신 판을 확인하고 `revertChange` 결과를 `#commitStructured`로 쌓는다. `history`는 판마다 앞 판과 `changedElementKeys`를 계산해 `change.keys`를 채운다. 옛 판 추정(`legacyChange`)도 `history`가 판 목록 전체를 보고 한다. `PageServiceError`에 선택 `details`를 더하고 `lift`가 `publicDetails`로 넘긴다(오류 `code`는 계약의 정해진 목록이라 새 값을 만들지 않는다).

**웹** — `endpoints.ts`의 `page.revert`, `edit-actions.ts`의 `revertPageAction`. 이력은 새 파일 `StructuredHistory.tsx`의 `StructuredHistoryPanel`이 그린다. 모양은 기존 `HistoryPanel`의 클래스(`historyFilters` · `revision*` · `checkpoint*`)를 그대로 쓴다. 거르기는 받은 목록을 화면에서 거른다. 되돌릴 수 있는 지점은 목록에서 고른다 — 가장 최근 `generated`, 그 뒤 첫 `refined`, 그 뒤 첫 `user` 직전 판. `Editor.tsx`는 구조화 지면의 이력 탭에 이 패널을 쓰고 `onPick`으로 `pickElement(key, null, true)`를 넘긴다. 패널 머리의 "판 N개"는 "변경 N건"이 된다.

**속성 탭** — `editing.ts`에 `textPathParts(snapshot, path, { section })`(묶음 제목 · 칸 이름)을 더해 `textPathLabel`과 같은 이름표를 쓴다. `ElementProperties.tsx`는 순서와 묶음을 바꾸고 글자 부분을 `<details>` 대신 버튼 + 상태로 접는다(고른 부분이 바뀌면 그 부분을 연다). 스타일은 `page.module.css`의 기존 `prop*` 클래스를 고치고 저장 띠(`propDock`)를 `position: sticky; bottom: 0`으로 둔다. 색 · 크기는 `tokens.css`의 `--ex-*`만 쓴다.

## 버린 대안

- 판마다 바뀐 키를 저장 — 옛 판에는 없고, 앞 판과의 비교로 언제든 계산된다. 저장하면 두 출처가 생긴다.
- 블록형 `HistoryPanel`을 구조화 지면에 그대로 연결 — 그 패널은 `portfolio_revisions` · 체크포인트 API를 읽는데 구조화 지면의 편집은 그 표에 쌓이지 않는다.
- 되돌리기를 "그 판 직전으로 복원"으로 구현 — 그 뒤의 다른 편집까지 사라진다. 04c가 말하는 "이 변경만"이 아니다.

## 함정

- `history`는 지금 모든 판의 HTML을 싣는다. 이번 변경은 칸을 더할 뿐 크기 문제는 그대로다.
- `refine`이 만든 판은 `instruction`을 초안에서 옮겨 받는다. 옛 판 추정에서 지시문이 있는 판을 에이전트 고침으로 보면 다듬은 판이 섞일 수 있다. 다듬은 판은 초안의 `refinement.revisionId`로 먼저 가려낸다.
- 에이전트 고침의 되돌리기(`undoPageEdit`)는 `restoreRevision`을 부르므로, 그 판은 `restored`로 남는다.
- 자식 순서가 바뀐 루트와 그 뒤 기록 추가가 겹치면 충돌이다. 충돌 문장은 "그 뒤에 이 자리를 또 고쳤습니다…"로 기존 패널과 같게 쓴다.
- 이름표 `textPathLabel`의 결과를 쪼개 쓰지 않는다. 같은 표에서 묶음 · 칸을 따로 만든다.

## 완료 기준

- `pnpm --filter @expresso/backend test` · `pnpm test:infra` · `pnpm --filter @expresso/web test` · 두 패키지 `typecheck` 통과. `structured-history.test.ts`가 비교 · 요약 · 되돌리기 · 충돌(같은 섹션의 다른 칸, 순서 바꾼 뒤 기록 추가 되돌리기 포함)을 검사한다. 로컬은 AI가 꺼져 있어 에이전트 · 다듬기 판을 손으로 만들 수 없으므로, `ai` 판 · 옛 판 추정 · 되돌리기는 서비스 통합 테스트로 확인한다.
- 로컬 문가령 계정 화면에서 intent의 개발 목표 다섯 가지를 직접 확인한다.
