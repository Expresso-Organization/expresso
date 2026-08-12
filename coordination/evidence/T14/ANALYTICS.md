# T14 개인정보 최소 분석·재집계·인사이트 증거

- 상태: verified
- 일자: 2026-08-09 (Asia/Seoul)
- 체크리스트: M5-04, M5-05, M5-06

## 수집 경계

- strict event schema가 방문·완독·섹션 체류·연락처·다운로드·링크 이벤트별 필수 필드를 검증한다.
- payload는 8KB 이하만 받고 visitor session은 salt SHA-256 값만 저장한다.
- referrer는 origin만 보존하며 path/query를 폐기한다.
- 이벤트 UUID와 payload hash로 동일 재전송은 단일 효과, 다른 payload 재사용은 409가 된다.
- 방문자 hash별 advisory lock과 최근 1분 receipt로 동시 rate limit을 직렬화한다.

## 재현 가능한 집계

- owner 인증 방문과 1,000ms 미만 section view를 raw에는 보존하되 집계에서 제외한다.
- UTC 일 경계로 visit/complete/conversion/section metrics를 raw table에서 다시 계산해 upsert한다.
- 동일 raw event를 두 번 재집계한 결과와 `metric_daily` 행이 완전히 일치한다.
- derived metric은 누락 input과 0 denominator를 반환하지 않는다.
- 기존 DB trigger의 portfolio row lock으로 dashboard view 최대 6개를 동시 요청에서도 강제한다.

## 표본·근거 인사이트

- visits 최소 5건 미만이면 비교·narrative 대신 `INSUFFICIENT_SAMPLE`만 반환한다.
- 표시 가능한 인사이트는 기간, sample size, 실제 metric key를 함께 반환한다.
- validator가 존재하지 않는 evidence metric 및 한국어/영어 추측 표현을 저장 전에 거부한다.

## 검증 결과

| 검사 | 결과 |
|---|---|
| migration 0017 PGlite/Compose PostgreSQL 적용 | PASS |
| event dedupe/hash/referrer/size/rate limit | PASS |
| owner·sub-second 제외 / raw replay equality | PASS |
| derived zero denominator / dashboard 10-way 경쟁 | PASS |
| insight sample boundary / evidence·speculation validator | PASS |
| contracts | PASS — 13 tests |
| database | PASS — 11 tests |
| backend | PASS — 32 files, 67 tests |
| 전체 `pnpm test` | PASS — 91 tests |
| 전체 `pnpm typecheck` / `pnpm build` | PASS |
| `git diff --check` | PASS |

