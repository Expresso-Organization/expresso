---
title: 개발 포털 진행 현황 대시보드
slug: portal-status-dashboard
stage: plan
date: 2026-10-25
---

# 개발 포털 진행 현황 대시보드 — plan

## 순서

1. `docs/status/status.json` — 2026-10-25 조사 결과를 스키마에 맞춰 옮긴다.
2. `services/dev-portal/status/` — `shadcn init -t vite --preset base-nova`로 뼈대를 만들고 작업 공간 밖 설치로 바꾼다. 필요한 컴포넌트를 `shadcn add`로 넣는다.
3. `src/index.css` 토큰 대응, `src/data.ts` 스키마, `src/theme.ts` 포털 테마 동기화, `src/route.ts` 쿼리 상태.
4. 화면 — `App.tsx`(머리 · 담당자 필터 · 탭), `overview/`(지표 카드 · 일정 차트 · 마일스톤 · 도메인 차트 · 막힌 자리), `tasks/`(상세기능 표), `ai/`, `ops/`(관리자 · PR), `next/`(남은 작업).
5. `vite.config.ts` 출력 설정과 `build` 스크립트(자산 폴더 정리 → 타입 검사 → 빌드). 빌드 결과 커밋.
6. 포털 탭 · 라우트 · 검색 연결, `docs/index.html` 정리, 이전 문서 삭제.
7. `scripts/status/refresh-status.mjs`, 포털 변경 알림 갱신.

## 검증

- `pnpm --dir services/dev-portal/status build` 통과(타입 검사 포함).
- 로컬 포털(`scripts/serve-docs.py`)에서 `#/status` 직접 진입 · 탭 클릭 · 담당자 「채서현」 필터 · 도메인 막대 클릭 · 행 펼치기를 확인한다.
- 포털 테마를 어둡게 바꾸면 대시보드가 바뀌는지, 좁은 폭(768px)에서 가로 넘침이 없는지 확인한다.
- `node scripts/status/refresh-status.mjs` 실행 후 `status.json` 차이가 기준일 · 커밋 · PR에만 있는지 본다.
- 루트 `pnpm-lock.yaml`이 바뀌지 않았는지 `git status`로 확인한다.
