---
title: 커리어 기록 본문 BlockNote 편집기 전환
slug: career-blocknote-editor
stage: spec
status: accepted
intent: .intent/intent_career-blocknote-editor.md
date: 2026-10-28
---

# 커리어 기록 본문 BlockNote 편집기 전환 — 명세

검증 브랜치 `spike/blocknote-editor`의 코드(스키마 v2 스냅샷, 웹 Yjs 세션, `BlockNoteBody`)를 출발점으로 합니다.

## 요구사항

- [ ] 문서 bootstrap이 v1 기록을 BlockNote(`schemaVersion: 2`)로 옮긴다. 옮긴 뒤 블록 ID는 v1 블록 ID와 같다.
- [ ] bootstrap의 `document`는 BlockNote 블록을 v1 모양으로 바꾼 사본이고 블록 ID를 유지한다. 글머리 · 번호 · 할 일 목록의 묶음 블록 ID는 첫 항목 ID에서 결정적으로 만든다.
- [ ] `syncBlockNoteDocument(state, updates, target)`가 문서를 목표 블록 배열로 맞추는 증분 Yjs 업데이트를 만든다. 바뀌지 않은 최상위 블록의 Yjs 항목은 그대로 둔다. 다른 클라이언트가 그 블록을 동시에 고친 업데이트와 합쳐도 두 수정이 남는다.
- [ ] AI 제안 생성 · 적용 · 되돌리기 · 에이전트 채팅 제안이 v2 기록에서 동작한다. 적용 결과는 `update` 프레임으로 열린 편집기에 바로 반영된다.
- [ ] 변경 이력 복원(`restoreRevision`)이 v2 스냅샷으로 문서를 맞춘다.
- [ ] 본문 저장 뒤 `bodyMd` 투영은 Worker 작업(`career.document.project`)이 맡는다. 같은 기록의 2초 안 작업은 하나로 합쳐진다.
- [ ] `bodyMd`가 편집기 밖에서 바뀌면(인터뷰 답변, 옛 `bodyMd` 쓰기) 다음 bootstrap에서 문서가 그 내용으로 맞춰진다. 판단은 투영 때 저장한 `documentBodyHash`와 현재 `bodyMd` 해시 비교로 한다.
- [ ] 웹 BlockNote 편집기에 선택 서식 툴바의 「AI 편집」과 제안 패널이 있다.
- [ ] v1 전제였던 통합 시험이 v2에서 통과한다.

## 설계

**공용(`packages/editor/src/blocknote.ts`)**
- `blockNoteToCareerDocument(blocks)`를 추가한다. 연속한 목록 항목을 v1 목록 블록으로 묶는다. 묶음 ID는 `deterministicUuid(firstItemId + ":list")`로 만든다(FNV 해시 4개로 버전 8 UUID). 스타일 `bold · italic · strike · code · underline`과 링크를 mark로 바꾸고, 색 스타일은 버린다. 표 머리글 행은 `tableHeader` 칸으로 바꾼다.

**백엔드(`career-editor`)**
- `blocknote-document.ts`
  - `syncBlockNoteDocument`: 현재 최상위 블록과 목표 블록을 정규화(목표를 임시 Y.Doc에 넣었다 꺼내 기본 속성을 채움)한 JSON으로 비교한다. 같은 블록 중 목표 순서에서 가장 긴 증가 부분열을 남긴다. 나머지는 지우고, 새 · 바뀐 블록은 임시 문서의 `blockContainer`를 `clone()`해 제자리에 넣는다. 결과는 `Y.encodeStateAsUpdate(doc, 이전 state vector)`다.
  - `openBlockNote(state, updates)`: 복원한 Y.Doc과 블록.
- `service.ts`
  - bootstrap v2: `document = blockNoteToCareerDocument(blocks)`.
  - `documentBodyHash`가 있고 `bodyMd` 해시와 다르면 `markdownToCareerDocument(bodyMd)`를 목표로 동기화한다. 그 업데이트를 `actor: "migration"`으로 저장한다.
  - 투영은 생성자에 받은 `enqueueProjection`으로 Worker에 넘긴다. 없으면 지금처럼 프로세스 안 타이머를 쓴다.
  - `appendServerUpdate(userId, recordId, expectedVersion, update, actor)`를 추가한다. AI · 복원 · 외부 쓰기가 같은 방식으로 업데이트를 저장한다.
- `ai-proposals.ts`: v2면 `before = blockNoteToCareerDocument(...)`, `after = applyCareerCommands(before, commands)`, `update = syncBlockNoteDocument(..., careerDocumentToBlockNote(after).blocks)`로 적용한다. 전후 스냅샷은 v2(state 포함)로 남긴다. 되돌리기는 `restoreRevision`을 따른다.
- `repository.ts`: `setBodyMarkdown`이 `documentBodyHash`도 쓴다.
- `career/service.ts`: v2 기록의 옛 `bodyMd` 쓰기는 409 대신 `bodyMd`만 바꾼다. 문서 동기화는 다음 bootstrap의 해시 비교가 맡는다.
- Worker `career.document.project` 처리기와 API 큐 연결을 둔다.

**DB**: `CareerRecordDoc.documentBodyHash?: string | null`. `career_records` 검증 규칙은 추가 필드를 막지 않아 마이그레이션이 필요 없다.

**웹**
- `BlockNoteBody`: `FormattingToolbarController`에 기본 항목과 「AI 편집」 메뉴(기존 다섯 지시)를 둔다. 고른 블록 ID는 `editor.getSelection()?.blocks` 또는 커서 블록에서 얻는다. `onChange`로 v1 모양 문서를 위로 올린다.
- `CareerDocumentEditor`(v2): `AiProposalPanel`을 v1과 같은 자리에 둔다. AI 지시 목록은 `ai/ai-actions.ts`로 옮겨 두 편집기가 함께 쓴다.

## 버린 대안

- 서버에서 BlockNote 편집기를 Y.Doc에 붙여 블록 API로 고치기: y-sync 플러그인은 화면(EditorView)이 있어야 붙고, jsdom에서 화면을 띄우는 비용과 불안정성이 크다.
- 적용 때 문서 전체를 지우고 다시 넣기: 같은 시각 다른 블록을 고친 사용자 입력이 사라진다.
- AI 명령 형식을 BlockNote 블록 형식으로 바꾸기: 프롬프트 · 계약 · 에이전트 도구 · 비교 화면을 모두 바꿔야 한다. 이번에는 v1 모양 사본으로 기존 형식을 지킨다.

## 함정

- 목록 묶음 블록에는 BlockNote 대응이 없다. 묶음 ID를 결정적으로 만들지 않으면 bootstrap마다 ID가 바뀌어 적용이 「unknown block」으로 막힌다.
- `blocksToYDoc`의 블록 ID 유지 여부를 시험으로 고정한다.
- 정규화 없이 비교하면 기본 속성 차이로 모든 블록이 바뀐 것으로 보인다.
- 빈 목표 배열이면 빈 문단 하나를 넣는다(BlockNote는 블록이 하나 이상 있어야 한다).

## 완료 기준

```bash
pnpm typecheck
pnpm test
pnpm test:infra
pnpm --filter @expresso/web build
```

검증 서버에서 기존 기록 열기 · 두 탭 병합 · 미리보기 반영 · AI 편집 적용과 되돌리기 · 인터뷰 답변 반영을 화면으로 확인한다.
