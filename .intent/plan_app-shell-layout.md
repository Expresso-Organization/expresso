---
title: 앱 셸 공용 레이아웃
slug: app-shell-layout
stage: plan
status: accepted
intent: .intent/intent_app-shell-layout.md
spec: .intent/spec_app-shell-layout.md
date: 2026-11-20
---

# 앱 셸 공용 레이아웃 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/app/(app)/layout.tsx` | 새로 만듦. `AppChrome`을 그린다 |
| `services/web/src/app/(app)/*/layout.tsx` 12개 | 지움 |
| `services/web/src/app/(app)/edit/[portfolioId]/*` (deploy 제외) | `app/(editor)/edit/[portfolioId]/`로 `git mv` |
| `services/web/src/components/shell/AppChrome.tsx` | 머리 주석을 공용 레이아웃 기준으로 |
| `services/web/src/app/(app)/jobs/[jobId]/interest-actions.ts` | 주석만 |
| `services/web/src/features/agent-chat/AgentChat.tsx` | 실행이 끝나면 `router.refresh()` |
| `services/web/src/styles/tokens.test.ts` | 편집기 경로 키 5개 |
| `services/dev-portal/status/scanner/config.json` | D8 경로 |

## 작업 순서

1. origin/main 운영 빌드 경로 목록과 Playwright 기준선(실패 확인)을 먼저 남긴다.
2. 편집기 `git mv` — 상대 import가 없음을 grep으로 확인.
3. 공용 레이아웃 추가 · 구간 레이아웃 삭제 · 주석 정리.
4. AgentChat 실행 종료 새로고침.
5. 경로 키 · 스캐너 갱신 → `pnpm typecheck` · `pnpm test`.
6. 운영 빌드 경로 목록 diff → Playwright 검증(이동 · 스켈레톤 · 편집기 왕복 · 분류 추가 뒤 사이드바 갱신).

## 가장 위험한 단계

2단계. 두 그룹에 걸친 `/edit/[portfolioId]`가 빌드에서 충돌하거나 deploy가 편집기 경계를 잃을 수 있다. 깨지면 `git mv`를 되돌리고 `(app)/(shell)` 대안으로 간다.

## 검증

```
pnpm typecheck
pnpm test
pnpm --filter @expresso/web build   # 경로 목록 비교
node <scratchpad>/shell-persist.mjs  # next start 대상 Playwright
```
