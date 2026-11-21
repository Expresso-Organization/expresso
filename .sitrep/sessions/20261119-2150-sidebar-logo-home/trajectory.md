# 작업 이력

## 2026-11-19

### 21:50 · T1 시작 · 저장소 상태 확인
- 로컬 `main`이 `origin/main`보다 990커밋 뒤처지고, 미커밋 변경(`.claude/launch.json`, `AGENTS.md`, `next-env.d.ts`)이 있음 → 건드리지 않고 `origin/main`에서 `fix/sidebar-logo-home` 워크트리 생성

### ~22:00 · T2 완료 · 아티팩트 커밋
- 3a0fd6fd intent, 423f2825 spec, 0b07ec4d plan

### ~22:05 · T3–T5 완료 · 구현
- 브랜드 줄: `title`이 없으면 `<Link href="/home" aria-label="Expresso 홈">`, 접힘 시 `tabIndex=-1` · `aria-hidden` · `pointer-events: none`
- 검색 버튼 · `openSearch` import · `.searchRow` · `.shortcut` 제거
- 새 테스트 4개 먼저 실패 확인 후 통과

### ~22:08 · T6 완료 · 검증
- `pnpm typecheck` 통과, `pnpm test` 90 파일 · 477 테스트 통과

### ~22:12 · T6 발견 · 로컬 공용 Mongo 인증 실패
- `.env.example` 자격 증명이 공용 컨테이너 사용자 비밀번호와 다름, 다른 워크트리 `.env` 복사는 권한 거부
- 대안: 전용 컨테이너 `sidebar-qa-mongo`(57117, 인증 없음 replica set)에 마이그레이션 0001–0033 적용 후 API 기동, 확인 뒤 컨테이너 삭제

### ~22:22 · T6 완료 · 화면 확인 (localhost:3191)
- `/jobs` 로고 클릭 → `/home`, Tab 첫 초점 「Expresso 홈」 → Enter → `/home`
- 사이드바 「검색」 줄 없음, ⌘K 검색 창 열림
- 접힘: 로고 `tabindex=-1` · `aria-hidden` · `pointer-events: none`, 로고 자리 클릭은 「사이드바 펼치기」가 받음, 다시 펼침 정상

### 22:25 · 보고 · 완료됨 100%
- 로고 홈 이동 · 검색 줄 제거 구현과 검증 완료
- 결정 요청 없음, push는 사용자 확인 대기
