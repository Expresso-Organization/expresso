---
title: 커리어 기록 감사 결함 전체 수정
slug: career-audit-fixes
stage: plan
status: accepted
intent: .intent/intent_career-audit-fixes.md
spec: .intent/spec_career-audit-fixes.md
date: 2026-11-02
---

# 커리어 기록 감사 결함 전체 수정 — 구현 계획

작업 위치는 워크트리 `.worktree/career-audit`, 브랜치 `fix/career-audit`(기준 `origin/main` `c2f0a694`)다. 검증 서버는 API 4141 · 웹 3141 · `careeraudit.localhost` · DB `expresso_career_audit_1102`를 쓴다.

## 바뀌는 파일

| 단계 | 파일 | 무엇을 |
|---|---|---|
| 1 | `infra/nginx/expresso.ai.kr.conf`, `scripts/operations/deploy.sh`, `docs/operations/DEPLOYMENT.md` | Upgrade 전달 · 101 확인 · 서버 적용 절차 |
| 2 | `services/web/src/app/(app)/career/records/[recordId]/page.tsx` · `page.module.css`, `services/web/src/features/career-editor/editor/BlockNoteBody.tsx` · `.module.css` | 스크롤 영역, AI 메뉴 portal |
| 3 | `services/web/src/features/career-editor/session/CareerEditorSession.ts` · `useCareerEditorSession.ts` · `editor/SaveState.tsx`, `services/backend/src/modules/career-editor/session-registry.ts` · `socket.ts` | 재 bootstrap, 재시도 간격, 거절 처리, beforeunload, 등록 토큰 |
| 4 | `services/backend/src/modules/career-editor/service.ts` · `blocknote-document.ts` · 새 `external-body.integration.test.ts`, `services/backend/src/modules/interview/service.ts`, `services/backend/src/modules/career/service.ts`, `services/backend/src/api/main.ts`, `packages/editor/src/markdown.ts` · `blocknote.ts` (+ 시험), `services/web/src/features/career-editor/history/RevisionHistory.tsx`, `editor/BlockNoteBody.tsx`, 새 `services/backend/src/cli/career-repair-escaped.ts` · `package.json` 스크립트 | 본문 원본 단일화(콜백 주입), Markdown 읽기, 긴 글, 복원 전 이력, 이미 깨진 글 복구 명령 |
| 5 | `services/backend/src/modules/career-editor/ai-proposals.ts` · `ai-adapter.ts`, `packages/contracts/src/career-ai.ts`, `services/web/src/features/career-editor/ai/AiProposalPanel.tsx` | 대상 블록만 적용, 기준 해시, undone 상태, 속성 검사 |
| 6 | `services/web/next.config.ts`, `editor/BlockNoteBody.tsx` | 업로드 상한, 메뉴 거르기 |
| 7 | `services/backend/src/worker/main.ts`, 새 `worker/processors/career-property-mutation.ts`, `career/property-schema.ts`, `scheduling/service.ts`, `career/mongo-record-guard.ts`, `career/views.ts` · `view-query.ts` · `routes.ts` · `category-move.ts` · `mongo-links.ts`, `career-editor/routes.ts`, `career-computation/service.ts`, 새 마이그레이션(스냅샷 인덱스) | R11 · R12 · R14 |
| 8 | `services/web/src/features/career-editor/views/*` · `properties/PropertyList.tsx` · `move/MoveCategoryDialog.tsx` · 문서 패널 | R13 · R15 |
| 9 | `services/web/e2e/career-editor*.spec.ts`, 각 모듈 `*.test.ts` · `*.integration.test.ts` | R16 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 운영 연결 — 로컬 nginx 없이 `nginx -t` 대신 설정 문법을 docker `nginx:1.18` 이미지로 `nginx -t` 해 확인한다. `deploy.sh`는 `bash -n`.
2. 화면 차단 — 검증 서버에서 휠 스크롤로 본문 도달, AI 메뉴 항목이 보이고 눌림.
3. 세션 — 토큰 수명을 시험에서 줄여(주입 가능한 시계) 만료 뒤 재연결 단위 시험, 검증 서버에서 API 재시작 뒤 저장 확인.
4. 본문 원본 — 감사의 H4 · H6 재현 절차가 통과, `markdown.test.ts` 기대값 수정, 통합 시험 추가.
5. AI 적용 — 글자색 · 자식 블록이 있는 문서에서 다른 블록 적용 뒤 보존(통합 시험 + 화면).
6. 업로드 · 메뉴 — 2MB PNG 업로드 화면 확인.
7. 백엔드 정합성 — 101건 카테고리 속성 변경 통합 시험, retention 실제 경로 시험, R14 항목별 시험.
8. 화면 정합성 · 낮음 — 단위 시험과 화면 확인.
9. 회귀 시험 · 마무리 — 전체 검증 명령, PR 갱신, 감사 보고서 재현 절차 재확인.

각 단계 끝에 커밋하고 푸시한다. 1단계가 끝나면 PR을 연다.

## 구현 중 바뀐 것

- 4단계: 인터뷰는 `mongo-answers.ts`가 아니라 `InterviewService.saveAnswer`에서 콜백을 부른다. 모듈 경계를 지키려고 career · interview가 career-editor를 가져오지 않고 `api/main.ts`가 콜백을 연결한다.
- 4단계: 2026-11-02 이전 첫 열기 변환이 이미 깨뜨린 글(`R&amp;D`)을 고치는 운영 명령 `career-repair-escaped`를 더했다. 기본은 점검만 하고 `--apply`로 고친다.

## 가장 위험한 단계

4단계(본문 원본 단일화). 인터뷰 · 정리 · 편집기가 같은 기록을 서로 다른 버전 필드로 쓰고, 옛 기록 첫 열기 변환을 바꾼다. 잘못되면 본문이 사라진다. 되돌리기는 4단계 커밋 revert로 하고, 변환 변경은 새 기록 · 첫 열기에만 닿으므로 이미 BlockNote인 문서는 그대로다. 4단계 전에 검증 DB 복사본으로 옛 기록 19건 · 더미 211건을 모두 열어 bootstrap 오류가 없는지 스크립트로 확인한다.

## 검증

```
pnpm typecheck
pnpm test
pnpm test:infra
pnpm --filter @expresso/web exec playwright test e2e/career-editor
curl -4 --http1.1 -s -i -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" https://expresso.ai.kr/v1/career/records/00000000-0000-4000-8000-000000000000/session   # 서버 적용 뒤 101
```

화면 확인: `http://careeraudit.localhost:3141`에서 감사 보고서 H2 · H3 · H4 · H5 · H6 · H7 · H8 · H12 재현 절차를 다시 따른다.
