---
title: 개발 포털 진행 현황 대시보드
slug: portal-status-dashboard
stage: spec
date: 2026-10-25
---

# 개발 포털 진행 현황 대시보드 — spec

## 요구사항

1. 포털 상단 탭 「진행 현황」(`#/status`)이 대시보드를 연다. `#/status?owner=채서현&tab=tasks`처럼 필터가 주소에 실리고, 그 주소로 들어오면 같은 필터로 열린다.
2. 대시보드는 `docs/status/status.json` 하나만 읽는다. 판정 · 일정 · 마일스톤 · 도메인 · AI · 관리자 · PR · 남은 작업이 모두 이 파일에 있다. 파일이 깨졌거나 못 읽으면 오류 상태(`Alert`)를 띄운다.
3. 오늘 위치(학기 주차)는 열 때의 날짜로 계산한다. 데이터 기준일과 기준 커밋은 따로 표시한다.
4. 담당자 필터는 상세기능(도메인 담당) · 관리자 기능 · 남은 작업 · 막힌 자리에 적용된다.
5. 포털 테마(`expresso_portal_theme_v1`: light · dark · system)를 따르고, 포털에서 바꾸면 바로 바뀐다.
6. 화면 부품은 shadcn 컴포넌트를 쓴다 — Card · Badge · Table · Tabs · Select · ToggleGroup · Input · Progress · Alert · Chart(Recharts) · Tooltip · Separator · Collapsible.
7. 색 · 글꼴은 `services/web/src/styles/tokens.css`의 역할 토큰에서 온다. 새 색을 만들지 않는다.

## 설계

- **원본**: `services/dev-portal/status/` — Vite · React 19 · TypeScript · Tailwind v4 · shadcn(`base-nova`, Base UI — 제품 웹과 같은 base). pnpm 작업 공간(`services/*`) 밖이므로 자체 `pnpm-lock.yaml`을 두고 `pnpm install --ignore-workspace`로 설치한다. 루트 잠금 파일은 바뀌지 않는다.
- **결과물**: `vite build`가 `docs/status/index.html`과 `docs/status/assets/`를 쓴다(`base: './'`). `emptyOutDir`는 끄고 빌드 전에 `docs/status/assets/`만 지운다 — 같은 폴더의 `status.json`을 지우지 않기 위해서다.
- **토큰 대응**: `src/index.css`가 `tokens.css`를 가져오고 `@theme inline`으로 shadcn 변수를 `--ex-*` 역할 토큰에 대응한다. 대응표는 `services/web/src/styles/agent-chat-framework.css`와 같다. 차트 계열은 완료 `--ex-fg` · 부분 `--ex-fg-muted` · API만 `--ex-fg-faint` · 미구현 `--ex-bg-tint-strong`.
- **데이터**: `src/data.ts`가 zod 스키마로 `status.json`을 검사하고 타입을 파생한다. 판정 값은 `done | partial | api | todo`.
- **필터 상태**: `owner · domain · state · q · tab`을 쿼리 문자열에 둔다(`history.replaceState`). 포털 안(iframe)이면 `postMessage({type: 'expresso-status-route', query})`로 포털 주소를 맞춘다.
- **포털**: `Expresso 개발 포털.dc.html`에 `STATUS_TAB`을 더한다 — NAV · `routeOf` · `parseRoute` · `applyRoute` · `shellClass` · 검색 결과. 본문은 `<iframe class="portal-status-frame">`. iframe 주소는 탭을 열 때 한 번 정하고, 쿼리 갱신 메시지로는 다시 불러오지 않는다.
- **갱신 명령**: `scripts/status/refresh-status.mjs`가 `asOf` · `commit`(origin/main) · `prs`(`gh pr list`)를 다시 쓴다. 이미 있는 PR의 범위 분류는 유지하고, 새 PR은 「미분류」로 넣는다.
- **정리**: `docs/작업-범위와-진행-현황.html`과 `docs/index.html`의 그 줄을 지우고 진행 현황 링크로 바꾼다. 포털 변경 알림(`build_portal_changes.mjs`)에 항목을 더한다.

## 열린 질문

없음
