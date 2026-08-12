# T01 공유 API·이벤트 계약 증거

- 상태: verified
- 일자: 2026-08-09 (Asia/Seoul)
- 체크리스트: M0-03

## 산출물

- `/v1` prefix와 안정적인 오류 code/envelope.
- cursor pagination과 최대 100개 제한.
- 16–128자 `Idempotency-Key`와 quoted resource ETag(`"vN"`).
- schema version 1 background-job envelope, job type, status, progress/failure event.
- OpenAPI 3.1 JSON Schema component document.
- strict object 검증과 유효/거부 fixture 6개.

## 검증

| 명령 | 결과 |
|---|---|
| `pnpm --filter @expresso/contracts test` | PASS — 1 file, 6 tests |
| `pnpm --filter @expresso/contracts typecheck` | PASS |
| `pnpm --filter @expresso/contracts build` | PASS |
| `pnpm test` | PASS — contracts 6 + backend 4 + database 11 = 21 tests |
| `pnpm typecheck` | PASS — 3 workspace packages |
| `pnpm build` | PASS — 3 workspace packages |
| `git diff --check` | PASS |

## 자체 리뷰

- job envelope helper가 지정된 job type만 허용하도록 literal type과 payload schema를 함께 묶었다.
- HTTP와 job object는 unknown field를 거부해 mass-assignment와 계약 drift를 조기에 노출한다.
- failed/dead-letter progress만 failure object를 요구하고 정상 상태의 failure object는 거부한다.
- cached input이나 외부 provider가 없는 결정론적 테스트만 사용한다.
