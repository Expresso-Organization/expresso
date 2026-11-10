---
title: 검색 칸 · 검색 버튼 pill 곡률 통일
slug: search-pill-radius
stage: plan
status: accepted
intent: .intent/intent_search-pill-radius.md
spec: .intent/spec_search-pill-radius.md
date: 2026-11-10
---

# 검색 칸 · 검색 버튼 pill 곡률 통일 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/styles/tokens.css` | `--ex-radius-pill` 추가 |
| `services/web/src/styles/tokens.test.ts` | 「검색 칸 곡률」 검사 추가 |
| `services/web/src/app/(app)/home/page.module.css` | `.searchBar` · `.searchSubmit` 토큰 사용 |
| `services/web/src/app/(app)/jobs/page.module.css` | `.searchBar` · `.querySubmit` 토큰, `.queryCard` · `.queryRow` · `.parsedRow` 재배치 |
| `services/web/src/app/(app)/brew/new/page.module.css` | `.entrySearch` · `.entryGo` · `.search` pill |
| `services/web/src/app/(app)/analytics/page.module.css` | `.drawerSearch` pill |
| `services/web/src/app/(app)/brew/[brewId]/design/DesignCatalog.module.css` | `.searchField` pill |
| `services/web/src/features/agent-chat/AgentChat.module.css` | `.search` · `.browserTabs .search` pill |
| `services/web/src/features/career-editor/views/views.module.css` | `.searchField` · 닫기 버튼 pill |
| `services/web/src/app/(app)/edit/[portfolioId]/page.module.css` | `.librarySearch` 추가 |
| `services/web/src/app/(app)/edit/[portfolioId]/RecordLibrary.tsx` | 검색 칸에 `.librarySearch` 더함 |

## 작업 순서

1. 토큰과 검사 먼저 — `tokens.test.ts`를 더하고 돌려 지금 곡률 10곳이 실패하는지 본다.
2. 큰 검색바 — home · jobs 빈 바 · brew/new. 브라우저에서 `/home` · `/jobs` · `/brew/new` · `/portfolio/new`를 본다.
3. `/jobs` 확정 상태 재배치 — `/jobs?q=프론트엔드`에서 바 모양, 칩 줄, 칩 팝오버 열림을 본다.
4. 작은 검색 칸 다섯 곳 — 각 화면에서 칸을 열어 본다.
5. 검사 통과 확인 후 `.drawerSearch`를 10px로 되돌려 실패를 확인하고 원복한다.
6. 조사 스크립트를 다시 돌려 전후 스크린샷을 만들고 보고서를 쓴다.
7. 타입 검사 · 웹 테스트 후 커밋 · 푸시 · PR.

## 가장 위험한 단계

3단계. `.queryCard`의 테두리를 걷으면 칩 팝오버 위치나 모바일 폭 배치가 바뀔 수 있다. 깨지면 `jobs/page.module.css`의 해당 세 규칙만 되돌리면 이전 카드로 돌아간다(마크업은 바꾸지 않는다).

## 검증

```
pnpm typecheck
pnpm --filter @expresso/web test
node radius-probe.mjs http://radius.localhost:3161 <out> routes.json
```

화면: `/home` · `/jobs` · `/jobs?q=프론트엔드`(칩 눌러 팝오버) · `/brew/new` · `/brew/new?mode=list` · `/portfolio/new` · 커리어 분류 표에서 돋보기 · `/analytics` 지표 라이브러리 · 디자인 카탈로그 · 에이전트 채팅 대화 전환 · 편집기 기록 추가. 폭 1440px과 390px.
