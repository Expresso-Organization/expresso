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

### 16:45 · T3 머지 · PR #232

### 16:50 · T4 완료 · fix/analyze-bubble-button
- 원인: 말풍선은 「이 요건은 AI 대화에서 질문함」 상태 표시인데 강조색 아이콘만 있고 뜻은 툴팁에만 있어 버튼으로 보임. 근거 표시가 없는 요건 행은 disabled라 눌러도 반응 없음
- CoverageMap gapSlot에 「AI 대화에서 질문」 글자, 근거 수와 같은 캡션 색 · 크기
- web typecheck · test 471 통과

### 17:05 · T4 머지 · PR #233
- 화면 확인에서 행마다 따로인 그리드의 마지막 열이 `auto`라 근거 수가 어긋나는 것을 발견, 표시를 요건 이름 아래 줄로 옮김(e2cb3b26)

### 17:10 · 발견 · 목록 밖 제보 2건
- 11-10 04:58 테스트 프로젝트 삭제 버튼 없음(T10), 11-10 04:23 「단순 AI 오류」 스크린샷(T11)을 작업 트리에 더함

### 17:15 · T5 완료 · fix/edit-revision-before-edit
- 원인: 편집 이력은 10분 만의 첫 저장을 반영한 뒤의 본문을 담아 조합 중 글자(「저는 ㅅ」)가 남음
- recordEditRevision(editSequence) · captureBlockNoteSnapshotBefore: 편집을 연 업데이트 직전 본문을 스냅샷(version = seq - 1)
- 한계: 10분 경계를 넘어 쉬지 않고 입력하면 다음 이력의 직전 본문도 입력 중일 수 있음
- career-editor 단위 27 · career 통합 121 통과

### 17:40 · T5 머지 · PR #234

### 17:45 · T6 완료 · fix/saved-search-conditions
- 원인: 「이 검색 저장」의 저장 여부를 검색 문장만으로 판단해, 태그를 바꿔도 「저장한 검색」으로 잠김. 저장한 검색을 보여 주는 화면이 없음
- saved-search.ts(conditionsKey · isSavedSearch · savedSearchQuery), 오른쪽 「저장한 검색 N」 카드(열기 · 지우기), DELETE /v1/jobs/saved-searches/:id
- jobs 통합 159 · 웹 jobs 42 통과, 브라우저: 조건을 바꾸면 저장 버튼이 다시 열림 · 열기 주소에 저장 조건 · 지우기 반영 확인
