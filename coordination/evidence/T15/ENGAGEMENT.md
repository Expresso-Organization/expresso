# T15 알림·홈·통합 검색 증거

- 상태: verified
- 일자: 2026-08-09 (Asia/Seoul)
- 체크리스트: M6-01, M6-02

## 알림

- deadline/saved_search/generation/traffic 종류별 preference를 중앙 테이블에서 기본 true로 판정한다.
- KST 날짜와 `(user, dedupe key)` unique index로 사용자별 하루 1건만 생성한다.
- 50개 동시 생성 요청이 notification 1행과 outbox 1행으로 수렴한다.
- provider 실패는 시도 수, 실패 상태, sanitized error class, exponential next attempt를 보존한다.
- 재시도 시각 전 호출은 효과가 없고 이후 성공은 sent 1회로 수렴한다.
- 생성 후 preference가 꺼지면 Worker 직전 검사에서 suppressed 처리한다.

## 홈과 통합 검색

- 홈 read model은 진행 중 brew, portfolio, match score 추천 공고, current deployment metric을 user scope로 조합한다.
- 각 영역에 데이터가 없을 때 빈 배열과 명시적 empty boolean을 함께 반환한다.
- 통합 검색은 record/portfolio/match된 job만 합치며 다른 사용자의 리소스를 노출하지 않는다.
- `lower(title), resource type, UUID` 복합 커서로 동률에서도 중복·누락 없는 안정 페이지네이션을 제공한다.

## 검증 결과

| 검사 | 결과 |
|---|---|
| migration 0018 PGlite/Compose PostgreSQL 적용 | PASS |
| preference off / 50-way daily dedupe / outbox 1회 | PASS |
| delivery failure·backoff·retry | PASS |
| home populated/empty fixture | PASS |
| unified search scope/stable cursor | PASS |
| contracts | PASS — 13 tests |
| database | PASS — 11 tests |
| backend | PASS — 34 files, 72 tests |
| 전체 `pnpm test` | PASS — 96 tests |
| 전체 `pnpm typecheck` / `pnpm build` | PASS |
| `git diff --check` | PASS |

