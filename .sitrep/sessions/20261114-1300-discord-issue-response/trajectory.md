# 기록

## 2026-11-14

### 13:05 · T1 발견 · 운영자 이름 · 이메일이 다른 사용자 지면에 찍힘
- 운영 generated_pages 7건(포트폴리오 42e8aa02, 2026-11-10 03:27–04:04) 끝 띠에 운영자 이름 · 이메일. 배포 없음
- 서버 claude 2.1.272가 컨텍스트에 로그인 이메일 · Git user를 실음(haiku 실측). 자유 지면 프롬프트에 작성자 · 연락처 없음

### 13:20 · T1 폐기 · CLI 옵션으로 이메일 줄 제거
- 시도: --system-prompt, IS_DEMO=1, CLAUDE_CODE_DISABLE_CLAUDE_MDS=1 — 모두 이메일 줄 남음
- 대안: CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS=1(Git user 제거) + 프롬프트 작성자 절 + 근거 없는 이메일 check

### 13:40 · T1 완료 · PR #230
- 커밋 8a066de0 · f4f5eadc · 7ee81aa7(intent · spec · plan), fix 커밋
- typecheck 통과 · backend test 609 통과 · test:infra 340 통과

### 13:45 · 보고 · 구현 중 10%
- T1 완료(PR #230, CI 대기). D1 운영 지면 7개 처리 결정 요청 — 권장 B

### 13:50 · D1 결정 · A(줄 지우기) — 사용자
- 백업: Oracle-Server ~/db-backups/2026-11-14-operator-identity/generated_pages.json(7건)
- generated_pages 7건 html에서 이름 · Email 줄 2개 삭제, rationale 2건의 이름 · 이메일을 「서버 계정 정보」로 교체
- 운영 전체 generated_pages에서 두 문자열 0건 확인

### 13:55 · T1.1 완료

### 14:20 · T2 발견 · 역량 선택지 누적 원인
- record-cleaner가 카테고리의 기존 역량 이름을 모름, 기록당 최대 8개
- select-options의 대조가 trim · 소문자만 봐서 「·」와 「/」를 다른 이름으로 봄

### 15:10 · T2 완료 · fix/competency-option-sprawl
- optionKey(공백 · 구분 기호 제거) 대조, 정리 프롬프트에 기존 역량 절 · 3개까지, RECORD_CLEANUP_PROMPT_VERSION 3
- typecheck 통과 · backend test 605 통과 · test:infra 340/341(account-lifecycle · ai-proposals 5초 초과 2건은 단독 재실행 통과)

### 15:40 · D2 결정 · A(CI 통과 뒤 머지) — 사용자("모든 이슈 해결까지 진행")
- #230 · #231 머지(8dca160f)

### 16:20 · T3 완료 · fix/draft-records-materials
- 원인: 재료 후보는 제작을 열 때 한 번만 줄 세우고 초안은 후보가 아님 → 나중에 정리한 기록이 이미 연 제작에 안 들어옴, 화면은 초안을 언급하지 않음
- MaterialsService.#syncSources(brew.status=draft일 때 새 정리 기록 upsert), 읽기에서 지움 · 초안 기록 제외, BrewMaterials.draftCount, MaterialPicker 초안 안내 · 커리어 링크
- materials 통합 7 통과 · backend 611 · web 471 통과
