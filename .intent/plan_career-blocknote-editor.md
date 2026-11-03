---
title: 커리어 기록 본문 BlockNote 편집기 전환
slug: career-blocknote-editor
stage: plan
status: accepted
intent: .intent/intent_career-blocknote-editor.md
spec: .intent/spec_career-blocknote-editor.md
date: 2026-10-28
---

# 커리어 기록 본문 BlockNote 편집기 전환 — 구현 계획

브랜치 `feat/career-blocknote`, 워크트리 `.worktree/career-blocknote`. `origin/spike/blocknote-editor`를 합친 상태에서 시작한다.

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/editor/src/blocknote.ts` (+ test) | `blockNoteToCareerDocument`, `deterministicUuid` |
| `packages/database/src/documents/career.ts` | `documentBodyHash` |
| `services/backend/src/modules/career-editor/blocknote-document.ts` (+ test) | `syncBlockNoteDocument`, `openBlockNote` |
| `services/backend/src/modules/career-editor/service.ts` (+ test) | v1 모양 사본, 외부 `bodyMd` 동기화, 투영 큐, `appendServerUpdate`, v2 `restoreRevision` |
| `services/backend/src/modules/career-editor/ai-proposals.ts` (+ `ai-proposals.integration.test.ts`) | v2 적용 · 되돌리기, 409 차단 제거. 시험의 사용자 편집을 BlockNote 업데이트로 |
| `services/backend/src/modules/career-editor/index.ts` | `syncBlockNoteDocument` 노출(career 모듈 시험이 진입점으로 씀) |
| `services/backend/src/modules/career-editor/compaction.ts` | 변경 없음 확인(v2 분기 있음) |
| `services/backend/src/modules/career-editor/repository.ts` | `setBodyMarkdown` 해시 기록 |
| `services/backend/src/modules/career/service.ts` (+ `career.integration.test.ts`) | v2 옛 `bodyMd` 쓰기 허용, 시험을 v2 의미로 |
| `services/backend/src/api/main.ts` · `worker/main.ts` · 새 `worker/processors/career-document-projection.ts` | 투영 작업 연결 |
| `services/backend/src/modules/career-editor/spike-migrate-report.ts` → `migration-report.ts` | 운영 dry-run 보고 도구 |
| 새 `services/backend/src/modules/career-editor/blocknote-rollback.ts` | v2 → v1 되돌리기 도구(이전 버전 재배포 전 실행) |
| `services/web/src/features/career-editor/editor/BlockNoteBody.tsx` | AI 편집 툴바, 문서 변경 알림 |
| `services/web/src/features/career-editor/editor/CareerDocumentEditor.tsx` | v2 제안 패널. 요청 뒤에도 패널을 열어 둔다(옛 편집기는 처리 직후 접혀 적용 단추가 숨었다) |
| 새 `services/web/src/features/career-editor/ai/ai-actions.ts` · `editor/SelectionToolbar.tsx` | AI 지시 목록 공용화 |
| `docs/operations/CAREER_EDITOR_MIGRATION.md` | BlockNote 옮기기 dry-run 절차와 되돌리기 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 공용 역변환과 결정적 ID — editor 시험(왕복 · ID 유지 · 목록 묶음 ID 고정) 통과.
2. `syncBlockNoteDocument` — 교체 · 삽입 · 삭제 · 이동 · 빈 문서, 동시 편집 병합 시험 통과.
3. 서비스: v1 모양 사본 · `appendServerUpdate` · v2 복원 · 외부 `bodyMd` 동기화 · 투영 큐 — 백엔드 단위 시험 통과.
4. AI 제안 v2 — `pnpm test:infra`의 career-editor · career · agent-chat 시험이 모두 통과(검증 브랜치에서 실패하던 10건 포함).
5. Worker 투영 작업 연결 — 검증 서버에서 저장 뒤 `bodyMd`가 바뀐다.
6. 웹 AI 툴바와 제안 패널 — 웹 시험 · build 통과.
7. 화면 확인과 운영 문서.

## 가장 위험한 단계

2번과 4번이다. 동기화가 틀리면 AI 적용 · 복원이 사용자 문단을 지우거나 중복시킨다. 동시 편집 병합과 중복 없음은 Yjs 수준 시험으로 고정한다. v1 문서는 옮길 때 스냅샷을 새로 쓰고 v1 스냅샷 · 업데이트는 지우지 않으므로, 되돌릴 때는 `documentSchemaVersion`과 v2 스냅샷을 지우는 절차로 v1로 돌아갈 수 있다. 이 절차는 운영 문서에 적는다.

## 검증

```bash
pnpm typecheck
pnpm test
pnpm test:infra
pnpm --filter @expresso/web build
```

화면(검증 서버 `blocknote.localhost`):
1. 기존 기록 열기 → 고치기 → 새로고침.
2. 두 탭에서 같은 문단의 다른 자리 고치기.
3. 저장 몇 초 뒤 목록 카드 미리보기.
4. 문장 고르기 → AI 편집 → 적용 → 열린 편집기에 반영 → 변경 되돌리기.
5. 인터뷰 답변 다시 하기 → 그 기록 열기.
