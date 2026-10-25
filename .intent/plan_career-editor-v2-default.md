---
title: 커리어 편집기 v2 기본 활성화와 이전 기록 화면 삭제
slug: career-editor-v2-default
stage: plan
status: accepted
intent: .intent/intent_career-editor-v2-default.md
spec: .intent/spec_career-editor-v2-default.md
date: 2026-10-25
---

# 커리어 편집기 v2 기본 활성화와 이전 기록 화면 삭제 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/app/(app)/career/[categorySlug]/page.tsx` | v2 분기 삭제, `CareerBrowser`만 |
| `services/web/src/app/(app)/career/[categorySlug]/LegacyCareerBrowser.tsx` | 삭제 |
| `services/web/src/app/(app)/career/[categorySlug]/page.module.css` | 쓰이지 않는 클래스 삭제 |
| `services/web/src/app/(app)/career/records/[recordId]/page.tsx` | `CareerDocumentEditor`만 |
| `services/web/src/features/career-editor/feature-flag.ts` · `.test.ts` | 삭제 |
| `services/web/src/features/career-editor/editor/CareerDocumentEditor.tsx` · `.test.tsx` | `CareerDocumentReadOnly` 삭제, 404 안내 |
| `services/web/src/features/career-editor/session/CareerEditorSession.ts` | `unavailable` 주석 |
| `services/web/playwright.config.ts` · `e2e/career-editor.spec.ts` | 꺼짐용 서버 · 시나리오 삭제 |
| `services/backend/src/config/runtime-config.ts` · `.test.ts` | 키 삭제 |
| `services/backend/src/api/main.ts` | 문서 서비스 늘 등록 |
| `services/backend/test/support/agent-chat-preview.ts` | 넘기던 값 삭제 |
| `services/backend/.env.example` · `scripts/operations/deploy.sh` | 값 · 보완 블록 삭제 |
| `docs/operations/CAREER_EDITOR_RELEASE_CHECKLIST.md` · `docs/architecture/career-record-editor-design.md` | 설정값 삭제와 되돌리기 |

## 작업 순서

1. API 설정 · 등록 — `pnpm --filter @expresso/backend typecheck`와 `runtime-config.test.ts`.
2. 웹 분기 · 이전 화면 · 편집기 404 안내 — 웹 typecheck와 `CareerDocumentEditor.test.tsx`.
3. CSS 정리 — 클래스별 grep으로 사용처 0인 것만 지운다.
4. Playwright · 배포 · 문서.
5. 전체 검증과 화면 확인, 커밋 · 푸시 · PR(base `main`).

## 가장 위험한 단계

CSS 정리. `styles[변수]`처럼 동적으로 쓰는 클래스를 놓치면 다른 화면이 깨진다. 동적 접근 여부를 먼저 grep하고, 의심되면 남긴다.

## 검증

```
pnpm typecheck
pnpm test
pnpm test:infra
pnpm --filter @expresso/web exec playwright test
```

화면: 이 워크트리 전용 포트로 API · 웹을 띄워 개발 로그인 뒤 `/career/project` 갤러리 → 기록 클릭(문서 패널) → `/career/records/:id` 본문 편집. API를 `CAREER_EDITOR_V2_ENABLED=false`로 다시 띄워 같은 경로를 반복한다.
