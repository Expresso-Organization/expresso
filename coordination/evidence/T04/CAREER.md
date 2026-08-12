# T04 커리어 기록 도메인 증거

- 상태: verified
- 일자: 2026-08-09 (Asia/Seoul)
- 체크리스트: M1-01, M1-02, M1-03, M1-04, M1-05

## 개발포털 원본 반영

- `task-spec.js` T1.1.1의 고정 7종 이름·순서와 기본 view를 migration fixture로 사용했다.
- 데이터 모델의 global system category(`user_id is null`) 설계를 유지해 모든 신규 사용자가 같은 immutable 정의를 보고, 사용자 기록 수만 owner scope로 계산한다.
- T1.3.5의 사용처 사전 확인·30일 휴지통, T1.5.1의 양방향 연결, T1.6.1–3의 정규화·근거 span·최근 사용 보정을 구현했다.

## M1-01 기본 카테고리

- 경험, 프로젝트, 학력·이력, 자격증·수상, 학술·집필, 활동·리더십, 스킬·도구 7개를 migration에서 idempotent seed.
- 고정 `sort_order`, default view, 속성 schema를 제공하고 DB trigger로 system category의 update/delete를 거부.
- 반복 조회에서 같은 7개 ID만 보이며 DB count도 7을 유지.

## M1-02 기록 CRUD·자동 저장

- 보호된 생성/조회/수정/휴지통 API와 owner-scoped SQL.
- `Idempotency-Key`와 request hash로 같은 재전송은 한 행에 수렴하고 다른 payload 재사용은 409.
- version trigger와 quoted ETag(`"vN"`)를 사용하며 stale `If-Match`는 412.
- 실제 HTTP에서 사용자 B의 사용자 A record UUID 조회는 404.

## M1-03 속성·뷰·연결

- category schema에 없는 속성, 타입 불일치, 잘못된 월 값을 app과 DB 양쪽에서 거부.
- 값이 있는 속성 제거는 409와 `propertyValueCounts`를 먼저 반환하고 명시적 확인 후 제거.
- filter/sort/visible properties를 가진 저장 view와 category당 8개 DB 상한.
- 관련 record link는 한 행으로 저장하고 양쪽 조회에서 상대 record를 반환; 교차 사용자 link는 404와 DB FK로 이중 차단.

## M1-04 휴지통·복원

- 삭제 전 `delete-impact`에서 portfolio/block 사용처 수와 예정 purge 시각 제공.
- soft delete 시 30일 purge window를 DB check로 고정하고 만료 전 복원, 만료 시 404.
- record가 휴지통에 있어도 materialized block content/source와 deployment 행이 바뀌지 않음을 실제 그래프로 검증.

## M1-05 스킬 근거

- k8s/Kubernetes, postgres/PostgreSQL 등의 표기를 정규화.
- system category의 owned record만 근거로 허용하고 원문 `title`/`body_md` slice와 quote의 exact match를 검증.
- 근거 수로 1–5 level을 계산하고 2년 초과 비최근 근거는 한 단계 감점.
- 근거 1개는 weak, 2–4개 supported, 5개 이상 strong이며 근거 0개·변조 quote는 거부.
- 보호된 evidence 조회 API가 record title과 원문 span을 반환.

## 회귀 결과

| 명령 또는 검사 | 결과 |
|---|---|
| Compose DB migration | PASS — `0006_career_runtime_invariants.sql` 적용 |
| migration 재실행 | PASS — 0001–0006 모두 `already applied` |
| career focused integration | PASS — 5 tests |
| backend infra integration | PASS — 6 files, 13 tests |
| 전체 `pnpm test` | PASS — contracts 9 + database 11 + backend 31 = 51 tests |
| 전체 `pnpm typecheck` | PASS |
| 전체 `pnpm build` | PASS |
| `actionlint .github/workflows/backend-ci.yml` | PASS |
| `git diff --check` | PASS |
| DB post-check | PASS — system categories 7, career test users 0 |
