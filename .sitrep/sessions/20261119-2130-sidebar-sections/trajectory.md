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

### 22:08 · T5.1 발견 · 라이브러리와 목록 불일치
- 라이브러리 「포트폴리오」는 만들던 제작도 세는데 사이드바는 포트폴리오만 셈
- `AppChrome`이 `gridItems(home.activeBrews, …)`와 `resumeStep`을 재사용하도록 변경

### 22:10 · T7.1 완료 · 링크 호버 감사
- 7개 화면에서 클래스 색 + 호버 색 없는 링크 추출: 강조색 버튼 3종(의도한 수정), 흐린 링크 7종
- 흐린 링크 7종의 `:hover`에 `--ex-fg-strong` 명시 → 재감사에서 강조색 버튼만 남음

### 22:12 · T8.3 완료 · 첫 페인트 깜빡임
- 변경 전: 접힌 묶음이 하이드레이션 전 1프레임 펼쳐짐(978ms)
- `sidebar-group-storage.ts`의 `SIDEBAR_GROUPS_BOOTSTRAP`을 루트 `<head>`에 추가 → 696프레임 중 펼침 0

### 22:15 · 보고 · 구현 중 95%
- web typecheck 통과, vitest 89파일 478개 통과
- D1 push · PR 여부 사용자 결정 대기

## 2026-11-20

### ~09:00 · D1 결정 · PR 생성 후 머지와 정리
- 사용자 결정: 「PR 만들고 머지 후 정리」
- 머지하면 `web-deploy.yml`이 운영에 배포함
- 분기 뒤 main에 #242~#244가 머지됨. 충돌 없음, `/goal` 레이아웃이 `AppChrome`을 씀 → 반영 후 재검증

### ~00:42 · T9.1 발견 · 운영 빌드 타입 오류
- 새 main 반영(6ac9bea5) 뒤 `pnpm --filter @expresso/web build`에서 `Sidebar.test.tsx`의 href 문자열이 `Route`에 맞지 않음. `tsc --noEmit`은 통과했음
- `AppChrome`과 같이 `as Route`로 고침 → 빌드(39쪽) · typecheck · vitest 89파일 478개 통과
