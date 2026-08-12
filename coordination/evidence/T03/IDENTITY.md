# T03 인증·사용자 격리 증거

- 상태: verified
- 일자: 2026-08-09 (Asia/Seoul)
- 체크리스트: M0-05

## 산출물

- `0004_identity_sessions.sql`: 사용자 소유 세션, SHA-256 token hash, 만료·해제·최근 사용 시각과 활성 세션 인덱스.
- 256-bit opaque access token 발급과 원문 비저장 검증을 수행하는 `IdentityService`.
- `Authorization: Bearer` 검증 후 `request.auth`에 `sessionId`와 인증된 사용자만 주입하는 auth context.
- 보호 라우트 `GET /v1/me`와 소유자 조건을 강제하는 `DELETE /v1/identity/sessions/:sessionId`.
- 사용자·세션 DTO와 OpenAPI 3.1 schema component.

## 실제 PostgreSQL 통합 검증

한 테스트 안에서 사용자 A/B와 각 세션을 만든 뒤 다음 순서를 검증했다.

1. 인증 없는 `/v1/me`는 공통 `AUTH_REQUIRED` 봉투로 401을 반환한다.
2. 유효한 A 토큰은 request user context를 통해 A만 반환한다.
3. DB의 세션 행에는 원문 access token이 아니라 64자리 SHA-256 hash만 존재한다.
4. A가 B의 세션 UUID를 직접 해제 요청하면 404를 반환한다.
5. 위 요청 뒤에도 B 토큰은 정상적으로 B를 인증한다.
6. A가 자기 세션을 해제하면 204이고, 같은 토큰의 다음 요청은 401이다.

## 검증 결과

| 명령 또는 검사 | 결과 |
|---|---|
| Compose DB `pnpm db:migrate` | PASS — `0004_identity_sessions.sql` 적용 |
| migration 재실행 | PASS — 0001–0004 모두 `already applied` |
| backend infra integration | PASS — 4 files, 5 tests |
| contracts | PASS — 7 tests |
| database | PASS — 11 tests |
| backend | PASS — 9 files, 18 tests |
| 전체 `pnpm test` | PASS — 36 tests |
| 전체 `pnpm typecheck` | PASS |
| 전체 `pnpm build` | PASS |
| `actionlint .github/workflows/backend-ci.yml` | PASS |
| `git diff --check` | PASS |

## 자체 리뷰

- 인증 결과의 `userId`는 요청 body/params에서 받지 않고 검증된 세션과 사용자 join에서만 생성한다.
- 세션 해제 쿼리는 `id`와 인증 사용자의 `user_id`를 동시에 조건으로 사용해 IDOR을 차단한다.
- 존재 여부 누출을 줄이기 위해 타인 세션과 없는 세션은 같은 404 응답을 사용한다.
- 삭제 유예 중인 사용자는 기존 세션으로 인증할 수 없다.
- access token은 API 응답 또는 로그용 principal에 보존하지 않으며 DB에도 hash만 저장한다.
