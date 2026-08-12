# T16 entitlement·quota 증거

- 상태: verified
- 일자: 2026-08-09 (Asia/Seoul)
- 체크리스트: M6-03

## 제품 문서 반영

- `Expresso 데이터 모델 명세서`: `plan.features`, `generation_quota`, 사용자·월별 `usage_counter`를 그대로 사용했다.
- `Expresso 구현 명세서` §10: Single/Double/Extra를 `free/pro/team`에 대응한 기능 매트릭스를 기본값으로 구현했다.
- quota reset은 문서대로 KST 매월 1일 00:00이며, 숫자는 코드 상수가 아니라 plan 설정에서 읽는다.
- 결제 사업자 연동은 구현하지 않고 내부 entitlement만 제공한다.

## 산출물

- `0005_entitlements.sql`: 새 환경의 free/pro/team 기본 plan과 명시적 feature flags.
- `EntitlementService`: 생성, 내보내기, 고급 분석을 포함한 모든 기능이 사용하는 단일 판정 진입점.
- DB `plan.features` boolean이 기본 매트릭스를 코드 변경 없이 override하는 설정 경계.
- `GET /v1/entitlements/:capability`: 인증된 현재 사용자만 판정할 수 있는 보호 route.
- 공통 capability, decision, quota usage DTO와 OpenAPI component.

## 완료 기준 검증

| 기준 | 결과 |
|---|---|
| entitlement matrix | PASS — free/pro/team의 생성·내보내기·고급 분석 및 feature override 테스트 |
| 월 quota/reset | PASS — KST 월 경계 직전 소진, 경계 직후 used 0/remaining 복원 |
| 중앙 판정 결과 | PASS — 생성·내보내기·고급 분석이 동일한 `EntitlementDecision` 계약 사용 |
| 다운그레이드 보존 | PASS — team→free 변경 후 권한은 잠기고 기존 사용자 record 행은 유지 |
| 보호 HTTP route | PASS — opaque session 인증과 request user context로 현재 사용자만 판정 |

## 회귀 결과

| 명령 또는 검사 | 결과 |
|---|---|
| Compose DB migration | PASS — `0005_entitlements.sql` 적용 |
| migration 재실행 | PASS — 0001–0005 모두 `already applied` |
| backend infra integration | PASS — 5 files, 8 tests |
| 전체 `pnpm test` | PASS — contracts 8 + database 11 + backend 24 = 43 tests |
| 전체 `pnpm typecheck` | PASS |
| 전체 `pnpm build` | PASS |
| `actionlint .github/workflows/backend-ci.yml` | PASS |
| `git diff --check` | PASS |
| integration test data cleanup | PASS — entitlement test users 0 |

## 자체 리뷰

- 판정 API는 임의 `userId`를 받지 않고 인증 context의 사용자만 사용한다.
- 월 조회는 `(user_id, period_start)`의 기존 unique key를 사용하며, 판정 자체는 counter를 증가시키지 않는다.
- 실제 quota 차감은 T11 생성 transaction에서 이 중앙 서비스를 재사용하며 원장과 함께 원자적으로 추가한다.
- 다운그레이드 함수에 사용자 데이터 수정·삭제 동작을 두지 않아 읽기 가능 데이터가 보존된다.
- paid unlimited는 `generation.unlimited` feature로 표현해 정수 sentinel을 사용하지 않는다.
