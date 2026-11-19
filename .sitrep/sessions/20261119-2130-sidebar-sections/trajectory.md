# 작업 기록

## 2026-11-19

### 21:30 · T1 시작 · 운영 main 기준 사이드바 조사
- `origin/main` 2479678a(PR #240)에서 `.worktree/sidebar-sections` 생성
- `4819fd0e`에서 사이드바 포트폴리오 · 관심 공고 · 커리어 묶음 제거 확인

### 21:45 · T2 완료 · 아티팩트 커밋
- 939b70ff intent · 3abc197b spec · eea9f5a8 plan

### 21:50 · T3~T6 완료 · 묶음 구현
- 새 파일: `SidebarGroup.tsx`, `SidebarGroup.test.tsx`, `SidebarPortfolios.tsx`
- 수정: `SidebarConversations`, `SidebarCategories`, `Sidebar`, `AppChrome`, `lib/app-data`, `SidebarSkeleton`, `Sidebar.module.css`, `Sidebar.test`
- web typecheck 통과, vitest 89파일 478개 통과

### 21:55 · T7 발견 · 호버 글자 검정
- 원인: `styles/global.css`의 `a:hover`(0,1,1)가 `.brew`(0,1,0)의 글자색을 `--ex-fg-strong`으로 덮어씀
- `a:where(:hover)`로 우선순위를 낮춤. 브라우저 호버에서 `rgb(255,255,255)` 확인

### 22:05 · 보고 · 구현 중 90%
- 대화 · 커리어 기록 묶음 접기, 새로고침 뒤 유지, 레일 아이콘, 서랍 확인
- 포트폴리오 묶음은 단위 테스트만. 시험 계정에서 포트폴리오를 만들려면 AI 처리 동의가 필요함
- D1 push · PR 여부 사용자 결정 대기
