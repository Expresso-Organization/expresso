# T13 배포 snapshot·공개 경계·자산 수명주기 증거

- 상태: verified
- 일자: 2026-08-09 (Asia/Seoul)
- 체크리스트: M5-01, M5-02, M5-03

## 주소와 불변 배포본

- PostgreSQL unique slug와 portfolio row lock으로 주소 예약 및 버전 증가를 원자화했다.
- 배포 시 section/block의 실제 내용을 독립 JSON snapshot으로 고정하고 trigger가 snapshot·주소·버전·공개 설정 변경을 거부한다.
- 주소 변경 시 기존 주소를 현재 주소로 연결하며 30일 만료 시각을 저장한다.
- 20개 동시 배포 경쟁에서 정확히 한 요청만 성공하고 deployment도 한 행만 생성됨을 확인했다.

## 공개·비공개·rollback 경계

- 익명 public route는 `portfolio.current_deployment_id`와 `published` 상태가 가리키는 배포 snapshot만 반환한다.
- draft block 변경은 재배포 전 공개 응답에 나타나지 않는다.
- rollback은 기존 deployment를 수정하지 않고 current pointer만 원자적으로 전환한다.
- unpublish 직후 직접 주소와 redirect 모두 공개 조회에서 제거된다.
- 연락처 공개 기본값은 `hidden`이다.

## Export와 이력서 자산

- 중앙 `export.document` entitlement를 PDF/deck export와 이력서 asset에 공통 적용한다.
- export submit은 idempotency key로 단일 job/outbox 이벤트에 수렴하고 중복 Worker 처리도 단일 asset/attempt로 끝난다.
- HMAC 서명은 asset UUID, version, nonce, 만료 시각을 묶는다.
- 만료 링크를 거부하고 이력서 교체 시 이전 asset을 revoke하여 기존 서명 링크를 즉시 무효화한다.

## 검증 결과

| 검사 | 결과 |
|---|---|
| migration 0016 PGlite/Compose PostgreSQL 적용 | PASS |
| slug 20-way 경쟁 / snapshot·version / 30일 redirect | PASS |
| public route unpublished-change·rollback·unpublish | PASS |
| export outbox 멱등 / entitlement 거부 | PASS |
| signed URL 만료 / resume 교체 무효화 | PASS |
| contracts | PASS — 13 tests |
| database | PASS — 11 tests |
| backend | PASS — 31 files, 64 tests |
| 전체 `pnpm test` | PASS — 88 tests |
| 전체 `pnpm typecheck` / `pnpm build` | PASS |
| `git diff --check` | PASS |

