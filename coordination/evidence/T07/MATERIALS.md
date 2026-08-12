# T07 포트폴리오 재료 추천·선택 증거

- 상태: verified
- 일자: 2026-08-09 (Asia/Seoul)
- 체크리스트: M3-01

## 구현 결과

- 완료된 공고 분석으로 brew를 만들 때 활성 `organized`/`verified` 기록만 후보로 선별한다.
- 요구사항 토큰 일치와 verified 가산점으로 결정적 순위를 계산하고 최대 10개만 자동 선택한다.
- 초안, 휴지통 기록, 다른 사용자 기록은 후보와 선택에서 제외한다.
- `brew_source`에 score, reason, rank, selected 여부, auto/user 주체, 제외 사유를 보존한다.
- 사용자 선택은 고유한 record 1–10개만 허용하며 0개·비후보·교차 사용자 선택을 거부한다.
- DB trigger가 활성 정리 기록 소유권, 선택 10개 상한, 후보가 생긴 brew의 최소 1개 선택을 방어한다.

## 검증 결과

| 검사 | 결과 |
|---|---|
| migration 0009 PGlite/Compose PostgreSQL 적용 | PASS |
| ranking golden test | PASS — 1 test |
| 실제 PostgreSQL material selection integration | PASS — 1 test |
| contracts | PASS — 12 tests |
| database | PASS — 11 tests |
| backend | PASS — 21 files, 45 tests |
| 전체 `pnpm test` | PASS — 68 tests |
| 전체 `pnpm typecheck` / `pnpm build` | PASS |
| `git diff --check` | PASS |
