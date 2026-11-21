## 2026-11-20

### ~22:30 · 시작 · 커리어 기록 편집기 디자인 시스템 정합
- origin/main 014d632c에서 worktree/career-editor-design, feat/career-editor-design 생성
- 로컬 전용 인프라(expresso-ced, Mongo 57117 · Redis 56479), API 4031 · 웹 3131로 실행

### ~23:00 · T1 발견 · 정의서 05 · 05b와 어긋난 곳
- 패널: OS 체크박스 목록 · 브라우저 날짜 입력, 본문이 제목보다 86px 안쪽, 제목 위 빈 이력 줄
- 보드 · 타임라인: OS 체크박스 상시 표시, 보드 카드 빈 줄
- 표: ISO 날짜 잘림, 390 폭 제목 칸 앞 96px 빈칸, 화면 제목 18px
- 소켓 "오프라인"은 웹 localhost · API 127.0.0.1 쿠키 불일치 환경 문제(로컬 env로 해결, 코드 무관)

### 23:12 · T2 완료 · intent · spec · plan
- bab1437f · 31c61f29 · 5925ca38

### 23:30 · T3 · T4 완료 · 팝업 분리와 문서 속성 편집
- 55ddddce. 달력 팝업 max-height 270px 넘침(표에도 있던 문제)을 폭 286px · 높이 어림 380px로 고침

### 23:40 · T5 완료 · 문서 한 열 정렬
- 819dd94f. 패널 · 전체 페이지 제목 · 속성 · 본문 x 좌표 일치(809 · 513), 블록 단추 48px 안에 들어감

### 23:55 · T6 · T7 완료 · 선택 상자 · 제목 · 좁은 화면 표
- 36a859d6

## 2026-11-21

### 00:30 · T6 완료 · 갤러리 · 목록 · 선택 속성 · 터치 기기
- 7274f8b5. tokens.test.ts 위반 2건(selectMark 곡률 역할, :focus-within 링)을 checkMark · .rowCheckbox 범위로 고침
- 패널에서 옵션 두 개 연달아 선택 후 새로고침 → 둘 다 저장 확인

### 00:40 · 완료 · 커리어 기록 편집기 디자인 시스템 정합
- pnpm typecheck exit 0, pnpm test exit 0(web 566 · backend 722 통과)

### 00:40 · 보고 · 완료됨 100%
- 문서 속성 · 카드 선택 상자 · 문서 정렬 · 기간 표기 · 화면 제목 · 좁은 화면 표 정합
- 결정 요청: 기간 표기 단위(월 단위 유지 권장), push · PR(사용자 결정)

### ~01:10 · 발견 · PR #266 e2e 실패
- `career-editor.spec.ts` 「adds a property and a new chip」이 패널의 옛 「역량 새 항목」 입력과 체크박스를 찾다가 시간 초과
- 칩 단추 → 옵션 팝업 경로로 테스트 수정, macOS 시각 기준 이미지(375 · 1280 · 1440)를 새 패널 모양으로 갱신
- 로컬(설치된 Chrome, 전용 인프라)에서 career-editor.spec 3개 + visual 1개 통과, 두 번 연속 실행

### ~01:30 · T9 완료 · PR #266 머지와 배포
- 머지 커밋 c991ab6b, 운영 배포 · 웹 CI · 백엔드 CI 성공. 워크트리 · 브랜치 삭제, 로컬 main을 origin/main으로 fast-forward(미커밋 AGENTS.md · launch.json 보존)

### ~02:00 · T10 시작 · 본문 편집 메뉴 디자인 정합
- 사용자 지적: BlockNote(ariakit) 블록 단추 · 블록 메뉴 · 색 메뉴 · `/` 메뉴가 튐. 원인은 ariakit 기본 스타일(#007acc 고른 항목, 입체 단추, 기울임 안내)
- 메뉴가 .bn-root 안 bn-portal-anchor에 그려져 BlockNoteBody.module.css의 .body 범위로 덮어씀

### ~02:40 · 결정 · `/` 메뉴 단축키 표시 제거(사용자)
- slashItems에서 badge를 빼서 그림. 단축키 동작은 유지

### ~02:50 · T10 완료 · 본문 편집 메뉴 디자인 정합
- 고른 항목 배경 계산값: 어두운 rgb(42,42,46), 밝은 rgb(228,233,242)(--ex-bg-tint-strong)
- pnpm typecheck exit 0, pnpm test exit 0(web 566 · backend 722), e2e career-editor · visual · long-record 5 통과(로컬 Chrome)

