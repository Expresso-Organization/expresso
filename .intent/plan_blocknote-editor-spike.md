---
title: 커리어 기록 본문 BlockNote 교체 검증
slug: blocknote-editor-spike
stage: plan
status: accepted
intent: .intent/intent_blocknote-editor-spike.md
spec: .intent/spec_blocknote-editor-spike.md
date: 2026-10-28
---

# 커리어 기록 본문 BlockNote 교체 검증 — 구현 계획

브랜치 `spike/blocknote-editor`, 워크트리 `.worktree/blocknote-spike`. 편집기 코드는 `main`에 합치지 않는다.

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/package.json` · `services/backend/package.json` · `pnpm-lock.yaml` | BlockNote 0.56.0 고정(web: core · react · ariakit, backend: server-util · core · react · react-dom) |
| `packages/contracts/src/career-editor.ts` | bootstrap에 선택 필드 `editor` · `stateBase64` 추가. `document`는 v1 모양 그대로 둔다(v2는 Markdown 투영 사본) |
| `packages/database/src/documents/career-editor.ts` | 스냅샷 `state?: Binary` |
| 새 `packages/editor/src/blocknote.ts` (+ test) · `package.json` · `tsconfig.json` | 웹 · 서버 공용 BlockNote 스키마(콜아웃 포함)와 v1 → BlockNote 변환. DOM 타입은 쓰는 기능만 좁혀 적어 백엔드 컴파일에 DOM lib가 필요 없다 |
| `pnpm-workspace.yaml` | `yjs` 13.6.33 단일화. 두 벌이면 BlockNote가 두 번 로드되어 중단된다 |
| 새 `services/backend/src/modules/career-editor/blocknote-document.ts` | v2 Yjs 복원, 상태 생성, Markdown 투영 |
| 새 `services/backend/src/modules/career-editor/blocknote-document.test.ts` | 머리글 표 · 줄바꿈 복원, 두 클라이언트 병합, Markdown 투영 |
| `services/backend/src/modules/career-editor/service.ts` | bootstrap v2 분기와 v1 → v2 옮기기, `bodyMd` debounce 투영 |
| `services/backend/src/modules/career-editor/compaction.ts` · `ai-proposals.ts` · `index.ts` | v2 압축, v2 AI 제안 409, 복원 함수 노출 |
| `services/backend/src/modules/career/service.ts` · `agent-chat/requirement-review.ts` | v2 기록 본문을 `career-editor` 진입점으로 읽기 |
| 새 `services/backend/src/modules/career-editor/spike-migrate-report.ts` | 복사본 DB 기록 전부 dry-run 대응표 · 손실 글자 수 |
| `services/web/src/features/career-editor/session/useCareerEditorSession.ts` | 훅이 `yDocument`를 직접 돌려준다. 편집기가 세션 내부를 열지 않게 한다 |
| `services/web/src/features/career-editor/session/CareerEditorSession.ts` (+ test) | v2 모드: `Y.Doc` 보유, 300ms 묶음 전송, 원격 프레임 적용 |
| 새 `services/web/src/features/career-editor/editor/BlockNoteBody.tsx` · `.module.css` | BlockNote 편집기(ariakit), `--bn-*` → `--ex-*` 연결 |
| 새 `services/web/src/features/career-editor/editor/media-actions.ts` | 본문 이미지 업로드 서버 액션 |
| `services/web/src/features/career-editor/editor/CareerDocumentEditor.tsx` | v2면 `BlockNoteBody`를 `next/dynamic`으로 렌더 |
| 새 `docs/architecture/career-editor-blocknote-spike.md` | 검증 보고서 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 의존 추가 · 계약 · DB 타입 — `pnpm typecheck` 통과.
2. 백엔드 변환기와 시험 — `blocknote-document.test.ts`의 대응표 항목이 모두 통과. 변환 뒤 `blocksToMarkdownLossy` 결과에 원문 글자가 남는다.
3. bootstrap v2 · 옮기기 · 투영 · 압축 · AI 409 · 단건 조회 — `pnpm --filter @expresso/backend test -- src/modules/career-editor` 통과.
4. 웹 세션 v2 모드와 시험 — 가짜 소켓으로 묶음 전송 · 재연결 재전송 · 원격 적용 시험 통과.
5. `BlockNoteBody` · 콜아웃 · 토큰 스타일 · 업로드 — 검증 서버에서 패널이 BlockNote로 열린다.
6. 검증 DB 준비 — 체험 DB `expresso_portfolio_trial`을 `expresso_blocknote_spike`로 복사(`$out`), `pnpm db:migrate`. 웹 3160 · API 4160 · Worker, 호스트 `blocknote-spike.localhost`, `HOST=::`.
7. 화면 확인 — spec 요구사항 순서대로. 동시 편집은 탭 두 개를 앞에 두고 확인한다.
8. 옮기기 보고 — `spike-migrate-report.ts`를 복사본에 dry-run.
9. 보고서 작성 — 결과표, 스크린샷, 교체 판단, 남는 작업(AI 제안 명령 재정의, 운영용 투영, 디자인 맞춤, 기존 기록 일괄 전환)과 규모.

## 가장 위험한 단계

3번 v1 → v2 옮기기다. 기록을 처음 열 때 스냅샷을 새로 쓰므로 되돌릴 수 없다. 복사본 DB에서만 돌린다. 깨지면 `expresso_blocknote_spike`를 지우고 6번부터 다시 복사한다. 체험 · 운영 DB에는 연결하지 않는다(API `.env`의 `MONGODB_DATABASE`를 시작 전에 확인).

두 번째 위험은 4번의 Yjs 기준 상태 불일치다. 클라이언트와 서버가 다른 기준에서 출발하면 본문이 두 번 들어간다. bootstrap이 스냅샷 `state` 바이트를 그대로 내려보내고, 클라이언트가 그 바이트로 `Y.Doc`을 시작하는지 시험으로 고정한다.

## 검증

```bash
pnpm typecheck
pnpm --filter @expresso/backend test -- src/modules/career-editor
pnpm --filter @expresso/web test -- src/features/career-editor
cd services/backend && node --env-file=.env --import tsx src/modules/career-editor/spike-migrate-report.ts
```

화면 경로(`http://blocknote-spike.localhost:3160`):

1. `/career/project` → 기록 열기 → `/` → 표 · 구분선 · 콜아웃 넣기, `Shift+Enter`, `Cmd+U` → 새로고침.
2. 이미지 끌어 놓기 → 새로고침.
3. 같은 기록을 탭 두 개로 열고 서로 다른 문단 입력 → 둘 다 새로고침.
4. 패널을 닫고 목록 카드 미리보기에 방금 쓴 문장이 보이는지 확인.
