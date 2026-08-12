# T05 공고 입력·검색·일치도 증거

- 상태: verified
- 일자: 2026-08-09 (Asia/Seoul)
- 체크리스트: M2-01, M2-02, M2-03

## M2-01 사용자 공고 입력

- 외부 크롤링 없이 회사·직무·URL(선택)·사용자 제공 원문을 받는 B1 경계를 유지.
- 계약과 API에서 200자 미만 원문을 400으로 거부.
- NFKC/공백 정규화 hash로 중복 입력을 한 `job_posting`에 수렴시키되 최초 `description_raw`와 `source_url`을 그대로 저장.
- source, URL, 원문, dedupe hash의 직접 update는 DB immutable trigger가 거부.
- 사용자별 idempotent `job_analysis`와 `job.normalize` outbox를 같은 transaction에서 생성.

## M2-02 검색·저장·관심

- 자연어에서 역할, 경력, 근무 형태, 위치, 연봉, 기술 조건을 편집 가능한 condition으로 변환.
- 저신뢰 연봉 조건은 만들되 기본 disabled로 반환하고, 해석 실패 시 예시와 clarification 상태 제공.
- 원문 질의와 수정 가능한 조건을 함께 saved search에 저장하고 사용자별 10개 상한을 서비스와 DB state로 검증.
- 최근 검색은 owner-scoped 삭제, 관심 공고는 사용자별 stage/deadline/memo upsert.

## M2-03 설명 가능한 일치도

- 실제 활성 record가 3건 미만이면 409와 required/actual을 반환.
- 기술 40, 규모·지표 20, 역할·연차 25, 근무 조건 15의 네 축 합으로 0–100 정수를 계산.
- matched/missing 항목, 가장 약한 축의 한 문장 사유, 실행 가능한 다음 행동을 함께 저장.
- 공고 표본 4개까지 demand ratio를 null로 유지하고 5개부터 실제 비율 계산.

## 검증 결과

| 검사 | 결과 |
|---|---|
| migration 0007 적용·재실행 | PASS |
| parser/score focused unit | PASS — 2 tests |
| 실제 PostgreSQL jobs integration | PASS — 3 tests |
| backend infra integration | PASS — 7 files, 16 tests |
| 전체 `pnpm test` | PASS — contracts 10 + database 11 + backend 37 = 58 tests |
| 전체 `pnpm typecheck` / `pnpm build` | PASS |
| `actionlint` / `git diff --check` | PASS |
| test user/outbox cleanup | PASS — 0 / 0 |
