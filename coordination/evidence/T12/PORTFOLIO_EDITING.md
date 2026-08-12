# T12 포트폴리오 편집·잠금·복원 증거

- 상태: verified
- 일자: 2026-08-09 (Asia/Seoul)
- 체크리스트: M4-05, M4-06

## M4-05 대상 지정 preview/apply

- portfolio/section/block 경로가 포함된 edit proposal에 before/after를 저장한다.
- preview 단계는 block을 변경하지 않고 pending proposal만 만들며 apply 때 원본 상태를 다시 비교한다.
- text/style/record 삽입을 구조화된 명령으로 제한하고 자유 색 대신 theme-derived 속성만 허용한다.
- record 삽입은 원문 body와 source record UUID를 block 및 `record_usage`에 연결한다.

## M4-06 잠금·개별 revert·전체 restore

- 승인된 직접 편집 block은 자동 locked/user-owned 상태가 된다.
- revision after와 현재 block이 다르면 revert 영향 충돌을 409로 먼저 반환하고 확인 후에만 적용한다.
- 개별 revert 자체를 `revert` revision으로 기록한다.
- 전체 snapshot restore 직전 상태를 새 snapshot으로 남기고 restore revision을 추가한다.
- 복원은 portfolio draft block/section만 변경하며 기존 deployment 행은 byte-equivalent JSON 상태를 유지한다.

## 검증 결과

| 검사 | 결과 |
|---|---|
| migration 0015 PGlite/Compose PostgreSQL 적용 | PASS |
| preview 전 DB 무변경 / apply source usage·lock | PASS |
| conflict impact→confirmed individual revert | PASS |
| pre-restore snapshot + full restore revision | PASS |
| deployment before/after JSON equality | PASS |
| contracts | PASS — 13 tests |
| database | PASS — 11 tests |
| backend | PASS — 29 files, 60 tests |
| 전체 `pnpm test` | PASS — 84 tests |
| 전체 `pnpm typecheck` / `pnpm build` | PASS |
| `git diff --check` | PASS |
