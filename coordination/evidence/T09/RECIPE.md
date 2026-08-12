# T09 근거 레시피·변경 이력 증거

- 상태: verified
- 일자: 2026-08-09 (Asia/Seoul)
- 체크리스트: M3-04, M3-05

## M3-04 근거 레시피

- 선택 기록, 공고 요구사항, 인터뷰 답변을 읽어 세 개 기본 섹션과 근거 기반 항목을 생성한다.
- 각 항목은 source type/UUID/label에서 recipe item/target path로 이어지는 별도 경로를 가지며 최소 3개를 계약으로 강제한다.
- 섹션 context에 목표·요점·수치·형식·톤·제외 항목을 구조화한다.
- 선택했지만 분량 우선순위상 배치하지 않은 기록을 사유와 함께 `recipe_unused_source`에 보존한다.

## M3-05 편집·잠금·이력

- 섹션 순서/추가/삭제, 항목 순서/추가/삭제/수정, 제한된 문장 지시를 지원하고 변경 path의 before/after diff를 반환한다.
- 사용자 수정 섹션·항목은 locked/user로 표시된다.
- 매 변경 전 전체 recipe snapshot과 diff/actor/action을 저장하고 DB trigger가 최근 50개만 유지한다.
- revision snapshot에서 개별 항목 문구를 복원하며 모호한 자연어 지시는 적용 전 409로 거부한다.

## 검증 결과

| 검사 | 결과 |
|---|---|
| migration 0011 PGlite/Compose PostgreSQL 적용 | PASS |
| 실제 PostgreSQL recipe generation/edit integration | PASS — 2 tests |
| source→target path와 unused source assertion | PASS |
| 8개 편집 operation, item restore, 50 revision boundary | PASS |
| contracts | PASS — 13 tests |
| database | PASS — 11 tests |
| backend | PASS — 24 files, 51 tests |
| 전체 `pnpm test` | PASS — 75 tests |
| 전체 `pnpm typecheck` / `pnpm build` | PASS |
| `git diff --check` | PASS |
