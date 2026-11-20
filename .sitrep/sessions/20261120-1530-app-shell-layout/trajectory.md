# 진행 기록 — 앱 셸 공용 레이아웃

## 2026-11-20

### ~15:30 · 시작 · 화면 이동마다 사이드바 재마운트
- 원인: `app/(app)/*/layout.tsx` 12개가 각자 `AppChrome`을 그림 → 구간 이동 때 레이아웃 세그먼트가 바뀜
- 분리 이유: a6df4b39 "사이드바를 9곳에 복붙하던 것"을 구간 레이아웃으로 올린 결과. 공용 레이아웃이 없던 것은 편집기 때문으로 보임

### ~15:50 · 발견 · Server Action은 루트부터 다시 그림
- `next/dist/client/components/router-reducer/reducers/server-action-reducer.js` 주석과 `FreshnessPolicy.RefreshAll` 확인
- `revalidatePath`를 부르는 Server Action과 `router.refresh()`가 공용 레이아웃까지 갱신 → 사이드바 갱신 경로 유지. AI 대화(클라이언트 fetch)만 빠져 새로고침 추가

### ~16:15 · 발견 · main 운영 빌드의 스켈레톤은 미리 받기가 덮음
- 미리 받기가 끝난 뒤 누르면 새 사이드바가 데이터째 들어와 스켈레톤이 보이지 않음(노드는 매번 교체)
- 미리 받기를 막으면(`NO_PREFETCH=1`) main에서 스켈레톤 49~263회 기록 → 검증은 두 모드 모두 돌림

### 16:45 · 완료 · 앱 셸 공용 레이아웃
- `pnpm typecheck` 통과, `pnpm test` 전 패키지 통과(웹 90파일 488개)
- 운영 빌드 경로 87개 main과 동일
- Playwright(운영 빌드, API 앞 300ms + 사이드바 응답 1.5s 지연 프록시): 라이브러리 → 탐색 → 분석 → 커리어 기록 → 홈, 미리 받기 허용 · 차단 모두 같은 사이드바 노드 · 스켈레톤 0회. main은 두 모드 모두 노드 교체
- 편집기 왕복: 편집기에 사이드바 0, 돌아오면 1. 배포 화면은 셸 안
- 갱신: 사이드바 카테고리 추가(router.refresh) · 바깥에서 만든 카테고리가 설정 알림 토글(Server Action) 뒤 보임, 둘 다 같은 노드

### 17:10 · T7 완료 · main 리베이스와 재검증
- #261(앱 모션)이 먼저 머지됨 → origin/main(1c5e8df9) 위로 리베이스. 충돌: `.sitrep/index.md`, `AgentChat.tsx`(main이 카드를 `tool-parts.tsx` 등록표로 옮김)
- 기록 초안 승인 갱신은 `RecordDraftCard` 안으로 옮기고 테스트(`RecordDraftCard.test.tsx`)에 `refresh` 호출 확인 추가
- 재검증: `pnpm typecheck` 통과, `pnpm test` 통과(웹 101파일 549개. `CheckinFeed.test.tsx` 1건은 전체 실행 부하에서 한 번 실패, 단독 3회 · 웹 재실행 통과)
- 운영 빌드 경로 88개 = main 87개 + main이 새로 더한 `/api/consultant/commitments/[id]`
- Playwright 재실행: 미리 받기 허용 · 차단 모두 같은 노드 · 스켈레톤 0, 편집기 왕복, 375px 서랍 닫힘, 카테고리 추가 · Server Action 갱신 통과
- 미검증: AI 대화 실행 종료 · 기록 초안 승인 뒤 갱신의 브라우저 확인(AI off 환경)

