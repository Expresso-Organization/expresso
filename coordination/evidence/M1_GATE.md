# G01 커리어 종단 슬라이스 게이트

- 상태: verified
- 일자: 2026-08-09 (Asia/Seoul)
- 체크리스트: M1-06

## 실행 방식

`services/backend/test/e2e/career-vertical-slice.test.ts`가 Compose PostgreSQL 서버 안에 고유한 임시 데이터베이스를 생성하고, migration 0001–0006을 빈 상태에서 전부 적용한다. 그 데이터베이스를 사용하는 Fastify API를 실제 임의 TCP 포트에 기동한 뒤 Node `fetch` 요청만으로 사용자 흐름을 검증한다.

## 검증 흐름

1. 새 DB의 free plan으로 사용자 A와 B를 만들고 각 opaque session을 발급한다.
2. A의 HTTP 요청에서 고정 순서 시스템 카테고리 7종을 조회한다.
3. 동일 `Idempotency-Key`로 기록 생성을 재전송해 201→200, 같은 record ID, DB 한 행을 확인한다.
4. ETag `"v1"`로 자동 저장해 `"v2"`가 되고, 다시 `"v1"`을 보내면 412가 된다.
5. 저장된 본문의 정확한 `PostgreSQL` span만으로 `postgresql` 스킬을 계산한다.
6. 근거 조회 API가 같은 record ID와 원문 quote를 반환한다.
7. B의 session으로 A record UUID를 직접 조회하면 404다.

## 결과

| 검사 | 결과 |
|---|---|
| fresh DB migration 0001–0006 | PASS |
| 실제 TCP HTTP E2E | PASS — 1 file, 1 vertical-slice test |
| 전체 `pnpm test` | PASS — contracts 9 + database 11 + backend 32 = 52 tests |
| 전체 `pnpm typecheck` | PASS |
| 전체 `pnpm build` | PASS |
| migration 재실행 | PASS |
| `actionlint` / `git diff --check` | PASS |
| 임시 E2E DB 정리 | PASS — 잔여 0 |

이 게이트로 M1의 서비스별 통합 검증과 빈 DB 실제 HTTP 흐름이 동시에 충족됐다.
