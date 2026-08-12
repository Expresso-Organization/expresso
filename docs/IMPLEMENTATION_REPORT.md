# Expresso 백엔드 구현 리포트

- 전체 상태: 구현·통합·출시 게이트 완료 (50/50)
- 작성일: 2026-08-09
- 기준 상태: `coordination/evidence/BASELINE.md`
- 최종 상태: 구현·통합·출시 게이트 종료 후 기록

## 현재 결과

서브에이전트 없이 dependency 순서대로 27개 task를 직접 구현하고 각 단계의 자체 리뷰·전체 회귀·증거 감사를 통과했다. 50개 체크리스트와 최종 staging rollout/rollback을 모두 닫았다.

## 체크리스트 증거 인덱스

`docs/IMPLEMENTATION_CHECKLIST.md`의 50개 ID를 구현 진행에 맞춰 갱신한다.

| Checklist ID | Status | Evidence | Notes |
|---|---|---|---|
| M0-01 | complete | `coordination/evidence/BASELINE.md` | 현재 filesystem 기준선과 검증 명령 기록 |
| M0-02 | complete | `docs/IMPLEMENTATION_PLAN.md` | 직렬 실행과 제품 결정 범위 확정 |
| M0-03 | complete | `coordination/evidence/T01/CONTRACTS.md` | `/v1` HTTP/job/OpenAPI 계약 6 tests |
| M0-04 | complete | `coordination/evidence/T02/PLATFORM.md` | Compose, outbox, retry/DLQ, 실제 인프라 4 tests |
| M0-05 | complete | `coordination/evidence/T03/IDENTITY.md` | opaque session, request auth context, 교차 사용자 UUID 404 |
| M0-06 | complete | `coordination/evidence/T02/PLATFORM.md` | request/error/log 보호와 actionlint CI |
| M1-01 | complete | `coordination/evidence/T04/CAREER.md` | immutable 기본 카테고리 7종 |
| M1-02 | complete | `coordination/evidence/T04/CAREER.md` | user scope CRUD, idempotency, ETag/412 |
| M1-03 | complete | `coordination/evidence/T04/CAREER.md` | 속성 영향, 저장 view, 양방향 link |
| M1-04 | complete | `coordination/evidence/T04/CAREER.md` | 사용처 사전 조회, 30일 휴지통, material 보존 |
| M1-05 | complete | `coordination/evidence/T04/CAREER.md` | exact span 근거 기반 스킬 집계 |
| M1-06 | complete | `coordination/evidence/M1_GATE.md` | 빈 DB 실제 TCP HTTP 인증→기록 E2E |
| M2-01 | complete | `coordination/evidence/T05/JOB_MARKET.md` | 200자 원문, immutable source, hash dedupe/outbox |
| M2-02 | complete | `coordination/evidence/T05/JOB_MARKET.md` | editable 조건, saved/recent search, interest scope |
| M2-03 | complete | `coordination/evidence/T05/JOB_MARKET.md` | 최소 3 records, 네 축 정수 점수, 표본 5 기준 |
| M2-04 | complete | `coordination/evidence/T06/JOB_ANALYSIS.md` | 실제 Worker 재개·중복 전달 1회 반영, 실패 retryability 보존 |
| M2-05 | complete | `coordination/evidence/T06/JOB_ANALYSIS.md` | 3–6개 요구사항, Unicode exact span 이중 검증 |
| M2-06 | complete | `coordination/evidence/T06/JOB_ANALYSIS.md` | covered/partial/missing record ID, 직전 1세대와 영향 응답 |
| M2-07 | complete | `coordination/evidence/M2_GATE.md` | fresh DB HTTP→outbox→Redis Worker→근거·점수 E2E |
| M3-01 | complete | `coordination/evidence/T07/MATERIALS.md` | 정리 기록 ranking, 최대 10개, 선택 메타데이터와 0개 거부 |
| M3-02 | complete | `coordination/evidence/T08/INTERVIEW.md` | requirement/record gap 근거 질문, 교체·skip·pause/resume |
| M3-03 | complete | `coordination/evidence/T08/INTERVIEW.md` | 답변 멱등 autosave, exact-fact 기록 생성·강화 이력 |
| M3-04 | complete | `coordination/evidence/T09/RECIPE.md` | 기록·요구사항·답변 source→item 경로와 미사용 사유 |
| M3-05 | complete | `coordination/evidence/T09/RECIPE.md` | 구조 편집 diff, 사용자 잠금, 항목 복원, 최근 50 이력 |
| M3-06 | complete | `coordination/evidence/M3_GATE.md` | fresh DB HTTP/Worker 분석→재료→인터뷰→기록→recipe E2E |
| M4-01 | complete | `coordination/evidence/T10/TEMPLATES.md` | 모든 실제/빈 section 렌더, tone 추천, 4.5:1 자동 보정 |
| M4-02 | complete | `coordination/evidence/T11/GENERATION.md` | 100회 요청/Worker 중복에도 성공 시 quota·ledger 1회 |
| M4-03 | complete | `coordination/evidence/T11/GENERATION.md` | sentence trace, unsupported claim/number·exclude·lock 차단 |
| M4-04 | complete | `coordination/evidence/T11/GENERATION.md` | portfolio materialization, record usage, 초기 snapshot |
| M4-05 | complete | `coordination/evidence/T12/PORTFOLIO_EDITING.md` | target path preview/apply, 승인 전 무변경, record source link |
| M4-06 | complete | `coordination/evidence/T12/PORTFOLIO_EDITING.md` | auto lock, conflict-aware revert, pre-restore snapshot, deployment 불변 |
| M4-07 | complete | `coordination/evidence/M4_GATE.md` | fresh DB 실제 Worker 생성→quota→편집 lock→거부→restore E2E |
| M5-01 | complete | `coordination/evidence/T13/PUBLISHING.md` | 원자 slug, 증가 version, 불변 snapshot, 30일 redirect |
| M5-02 | complete | `coordination/evidence/T13/PUBLISHING.md` | current deployment 전용 공개 조회, rollback/unpublish, contact hidden |
| M5-03 | complete | `coordination/evidence/T13/PUBLISHING.md` | entitlement export job, HMAC asset 만료·교체 무효화 |
| M5-04 | complete | `coordination/evidence/T14/ANALYTICS.md` | strict/8KB/rate limit, UUID 멱등, session hash와 owner 제외 |
| M5-05 | complete | `coordination/evidence/T14/ANALYTICS.md` | raw 일 재집계 동일성, 0 분모 거부, view 최대 6개 |
| M5-06 | complete | `coordination/evidence/T14/ANALYTICS.md` | 최소 표본 5, 기간·metric 근거, 추측 validator |
| M5-07 | complete | `coordination/evidence/M5_GATE.md` | fresh DB HTTP publish→anonymous event→Redis aggregate→insight→rollback |
| M6-01 | complete | `coordination/evidence/T15/ENGAGEMENT.md` | 종류별 선호, KST daily dedupe, delivery backoff/retry |
| M6-02 | complete | `coordination/evidence/T15/ENGAGEMENT.md` | explicit empty home, user-scoped stable cursor unified search |
| M6-03 | complete | `coordination/evidence/T16/ENTITLEMENTS.md` | 중앙 매트릭스, KST quota reset, 다운그레이드 보존 |
| M6-04 | complete | `coordination/evidence/T19/ACCOUNT_LIFECYCLE.md` | JSON-safe export, 즉시 접근 차단, 취소 nonce 회전, 30일 ordered purge |
| M6-05 | complete | `coordination/evidence/T17/SCHEDULING.md` | 6종 locked slot, duplicate single effect, failure/lag/next-run 관측 |
| M7-01 | complete | `coordination/evidence/T18/HARDENING.md`, `docs/operations/SECURITY_AUDIT.md` | route/IDOR/input/file/signed URL/log audit, P0/P1 0 |
| M7-02 | complete | `docs/operations/PERFORMANCE_BUDGET.md` | p95 50.3/5.1/3.1/1.4ms, hot visitor 429 |
| M7-03 | complete | `docs/operations/RESILIENCE_AUDIT.md` | rollback/disconnect/timeout/Worker retry, loss·duplicate 0 |
| M7-04 | complete | `docs/operations/RECOVERY_REHEARSAL.md` | actual non-empty pg_dump/restore fingerprint 일치 |
| M7-05 | complete | `coordination/evidence/FINAL_AUDIT.md` | 동일 checkout 43 files, 110 tests + typecheck/build |
| M7-06 | complete | `coordination/evidence/FINAL_AUDIT.md`, `docs/operations/STAGED_ROLLOUT.md` | compiled API/Worker readiness·queue drain·artifact/snapshot rollback |

## 실행 요약

- 계획 task: 27개, 모두 coordinator가 직접 수행.
- 서브에이전트/reviewer session: 0개.
- 동시성: coordinator 1.
- worker dispatch, 외부 worktree, worker MCP profile: 사용하지 않음.

## 준비 검증

| 검사 | 결과 | 증거 |
|---|---|---|
| 계획/체크리스트/DAG/state 구조 | PASS | 직렬 DAG: checklist 50, tasks 27, mapping 50 |
| baseline tests | PASS | `coordination/evidence/BASELINE.md` |
| 서브에이전트/MCP 격리 | 해당 없음 | coordinator 직접 실행 |
| worker worktree 격리 | 해당 없음 | `coordination/worker-worktrees.json` |
| dashboard HTTP | PASS | `http://127.0.0.1:8765/coordination/dashboard/?lang=ko` |
| T01 계약 package | PASS | 6 focused tests, 전체 21 tests/typecheck/build |
| T02 platform | PASS | 실제 인프라 4 tests, 전체 32 tests/typecheck/build |
| T03 identity | PASS | 실제 PostgreSQL 포함 infra 5 tests, 전체 36 tests/typecheck/build |
| G00 M0 gate | PASS | `coordination/evidence/M0_GATE.md` |
| T16 entitlements | PASS | 실제 PostgreSQL 포함 infra 8 tests, 전체 43 tests/typecheck/build |
| T04 career | PASS | focused 5 tests, 실제 인프라 13 tests, 전체 51 tests/typecheck/build |
| G01 M1 gate | PASS | fresh DB migration + 실제 HTTP vertical slice, 전체 52 tests |
| T05 job market | PASS | focused 5 tests, 실제 인프라 16 tests, 전체 58 tests |
| T06 job analysis | PASS | 실제 PostgreSQL/Redis Worker 3 tests, 전체 64 tests |
| G02 M2 gate | PASS | fresh DB queued→running→done E2E, 전체 65 tests |
| T07 materials | PASS | ranking/실제 PostgreSQL 선택 2 tests, 전체 68 tests |
| T08 interview | PASS | 질문 golden/실제 PostgreSQL 4 tests, 전체 73 tests |
| T09 recipe | PASS | 실제 PostgreSQL 생성·8개 편집·복원·retention, 전체 75 tests |
| G03 M3 gate | PASS | fresh DB 실제 Worker brewing flow E2E, 전체 76 tests |
| T10 templates | PASS | 전체 template conformance/contrast 2 tests, 전체 78 tests |
| T11 generation | PASS | 100회 idempotency·근거/실패/portfolio 4 tests, 전체 82 tests |
| T12 portfolio editing | PASS | preview/apply·revert·restore 실제 DB 2 tests, 전체 84 tests |
| G04 M4 gate | PASS | fresh DB Redis Worker generation-edit-restore E2E, 전체 85 tests |
| T13 publishing | PASS | slug 20-way 경쟁·불변 snapshot·rollback·export/서명 asset, 전체 88 tests |
| T14 analytics | PASS | privacy event·raw replay·dashboard 경쟁·근거 insight, 전체 91 tests |
| G05 M5 gate | PASS | fresh DB publish→visitor→Redis aggregate→insight→rollback E2E, 전체 92 tests |
| T15 engagement | PASS | notification 50-way dedupe·retry, home/search scope·cursor, 전체 96 tests |
| T19 account lifecycle | PASS | export·request/cancel·day 30 ordered purge audit, 전체 99 tests |
| T17 scheduling | PASS | 20-way tick→6 slots, duplicate run single effect·retry observation, 전체 101 tests |
| T18 hardening | PASS | security/load/fault 7 tests + actual backup restore, 전체 108 tests |
| G06 release gate | PASS | fresh release smoke + staging rollout/rollback, 전체 110 tests, 50/50 |

## 최종 판정

모든 task와 체크리스트가 verified/complete이며 `validate_pipeline.py --require-complete` 통과를 출시 준비 완료의 최종 판정으로 사용한다. 실제 외부 운영 배포는 이 리포트의 staging runbook과 중단 임계값을 따른다.
