# T08 근거 인터뷰·답변 기록화 증거

- 상태: verified
- 일자: 2026-08-09 (Asia/Seoul)
- 체크리스트: M3-02, M3-03

## M3-02 근거 질문

- missing/partial 요구사항과 선택 기록의 수치 gap만으로 3–6개 질문을 결정적으로 구성한다.
- 각 질문은 requirement UUID 또는 record UUID, 판정/gap, 원문 근거를 구조화해 보존한다.
- 질문 교체는 원 질문을 비활성 이력으로 남기고 같은 순서·근거의 대안 문구를 생성한다.
- pause/resume과 현재 순서·답변 수를 DB에 저장하고 재조회 시 남은 질문 목록을 그대로 복원한다.
- skip과 owner scope를 강제하며 근거가 전혀 없으면 질문을 만들지 않는다.

## M3-03 답변 자동 저장·기록 승격

- text/voice transcript를 질문별로 upsert하고 idempotency key/hash로 같은 재전송을 한 answer에 수렴시킨다.
- 첫 답변은 interview origin 기록을 즉시 만들고 변경 목록에 created와 정확한 source quote를 남긴다.
- 수정 답변은 동일 기록을 강화하고 version, changed fields, strengthened 이력을 갱신한다.
- 생성 기록의 제목·본문은 답변 문자열에서만 가져오며 DB trigger가 transcript에 없는 source quote 저장을 거부한다.

## 검증 결과

| 검사 | 결과 |
|---|---|
| migration 0010 PGlite/Compose PostgreSQL 적용 | PASS |
| 질문 배정 golden/근거 없음 부정 테스트 | PASS — 2 tests |
| 실제 PostgreSQL 교체·재개·답변 멱등 통합 | PASS — 2 tests |
| contracts | PASS — 13 tests |
| database | PASS — 11 tests |
| backend | PASS — 23 files, 49 tests |
| 전체 `pnpm test` | PASS — 73 tests |
| 전체 `pnpm typecheck` / `pnpm build` | PASS |
| `git diff --check` | PASS |
