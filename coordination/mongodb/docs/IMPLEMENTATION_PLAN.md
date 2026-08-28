<!-- generated from coordination/execution-spec.json; schema=2 revision=4 sha256=da7142fa6ab4398046829fe9ab09214c746d72ff967a6e1ddcc9252d908a939b generator=1; do not edit -->
# Expresso MongoDB migration implementation plan

- Status: implementation
- Date: 2026-08-29
- Project path: `C:\code\expresso-mongodb`
- Execution spec revision: 4

## 1. Objective

기존 API를 유지하면서 모든 백엔드 영속 저장을 MongoDB로 전환하고 공고 자산 이관·복원까지 검증한다.

## 2. Completion definition

- T01–T18의 코드·테스트·운영 문서가 통합 검증을 통과한다.
- 런타임 SQL 의존성이 승인된 이관 도구 외에는 남지 않는다.
- T19 운영 전환은 별도 사용자 확인 전에는 실행하지 않는다.

## 3. Baseline and constraints

### Baseline

- 기준 리비전 58577bd526e14adfd146182620270ff3b49c2011
- pnpm typecheck 통과
- 깨끗한 워크트리 pnpm test는 웹이 contracts dist보다 먼저 시작해 1 suite가 실패하며 T18에서 해소한다.
- Docker Desktop 엔진은 준비 중이며 실제 MongoDB 인프라 증거가 없는 작업은 완료 처리하지 않는다.
- 계약·database 선행 빌드 뒤 기본 테스트는 기존 Windows Codex CLI fixture 4건만 실패한다: backend 220 pass/168 skip; web 124 pass.

### Constraints

- docs/architecture/mongodb-migration-plan.md의 공통 제약과 T01–T19를 그대로 적용한다.
- MongoDB 공식 Node.js 드라이버 7.5.0과 MongoDB 8.0 계열 단일 rs0를 사용한다.
- MySQL 이중 쓰기·런타임 폴백·운영 데이터 테스트를 만들지 않는다.
- 현재 bodyMd 계약을 유지하고 커리어 편집기는 별도 작업으로 남긴다.

## 4. Scope

### Included

- 백엔드 전체 MongoDB 전환
- 보존 공고 자산 선택 이관
- CI·성능·백업·복원 절차

### Non-goals

- 커리어 블록 편집기
- Yjs·외부 MCP/API
- 승인되지 않은 운영 전환

## 5. Architecture and contracts

packages/database가 문서·컬렉션·마이그레이션을 소유하고 API와 Worker가 같은 공식 드라이버 기반 도메인 구현을 사용한다.

### Data and control flow

- API/Worker → 도메인 공개 진입점 → MongoContext/transaction → MongoDB
- 도메인 변경 + outbox 원자 저장 → BullMQ 중복 가능 전달 → 멱등 소비
- 쓰기 중단 MySQL snapshot → 허용 4개 테이블 변환·검증 → MongoDB

## 6. Parallel task boundaries

| Task | Outcome | Owner | Dependencies | Checklist IDs | Impl min | Mutable paths |
|---|---|---|---|---|---:|---|
| B0 | 기준선과 실행 계약 동결 | coordinator | None | M0-01 | 15 | coordination/mongodb/** |
| T01 | 연결과 격리 테스트 환경 | mongodb-01 | B0 | M1-01 | 25 | services/backend/src/platform/mongodb.ts, services/backend/src/platform/mongodb.integration.test.ts, infra/compose.mongodb.yaml, infra/mongodb/**, scripts/test-infra.mjs, services/backend/package.json, packages/database/package.json, package.json, pnpm-lock.yaml, infra/.env.example, infra/README.md |
| T02 | 컬렉션·마이그레이션·초기 데이터 | mongodb-02 | T01 | M2-01 | 75 | packages/database/src/documents/**, packages/database/src/collections.ts, packages/database/src/collection-specs.ts, packages/database/src/mongo-*.ts, packages/database/src/migration-lease.ts, packages/database/src/mongodb-migrations/**, services/backend/test/support/mongodb.ts, packages/database/src/*test.ts, packages/database/src/index.ts, packages/database/package.json, packages/database/tsconfig.build.json |
| T03 | 트랜잭션·Outbox·모듈 공개 경계 | mongodb-03 | T02 | M3-01 | 40 | services/backend/src/platform/mongo-transaction.ts, services/backend/src/platform/mongo-outbox.ts, services/backend/src/platform/*outbox*.test.ts, services/backend/src/platform/queue.integration.test.ts, services/backend/src/modules/**, services/backend/src/api/build-app.ts, services/backend/src/worker/processors/** |
| T04 | 계정·권한·동의 | mongodb-04 | T03 | M4-01 | 45 | services/backend/src/modules/identity/**, services/backend/src/modules/entitlements/**, services/backend/src/modules/consent/** |
| T05 | 기록·카테고리·뷰·프로필 | mongodb-05 | T04 | M5-01 | 50 | services/backend/src/modules/career/mongo-service.ts, services/backend/src/modules/career/mongo-records.ts, services/backend/src/modules/career/mongo-categories.ts, services/backend/src/modules/career/*integration.test.ts |
| T06 | 기록 참조·삭제 제한·스킬 | mongodb-06 | T05 | M6-01 | 40 | services/backend/src/modules/career/mongo-record-guard.ts, services/backend/src/modules/career/mongo-links.ts, services/backend/src/modules/career/mongo-skills.ts, services/backend/src/modules/career/mongo-service.ts, services/backend/src/modules/career/*.test.ts, packages/database/src/schema.test.ts, services/backend/src/modules/career/index.ts |
| T07 | 공고 원본·수집·검색 | mongodb-07 | T04 | M7-01 | 55 | services/backend/src/modules/jobs/** |
| T08 | 사용자 분석·재료·Brew 작업 | mongodb-08 | T06, T07 | M8-01 | 60 | services/backend/src/modules/job-analysis/**, services/backend/src/modules/materials/**, services/backend/src/modules/company-research/**, services/backend/src/modules/brew-jobs/**, services/backend/src/modules/jobs/jobs.integration.test.ts |
| T09 | 인터뷰와 답변의 기록 반영 | mongodb-09 | T08 | M9-01 | 40 | services/backend/src/modules/interview/**, services/backend/src/worker/processors/record-cleanup.ts, services/backend/test/e2e/career-vertical-slice.test.ts, services/backend/test/e2e/brewing-flow.test.ts |
| T10 | Recipe와 템플릿 | mongodb-10 | T09 | M10-01 | 40 | services/backend/src/modules/recipe/**, services/backend/src/modules/templates/** |
| T11 | 생성 결과와 사용량 확정 | mongodb-11 | T10 | M11-01 | 50 | services/backend/src/modules/generation/**, services/backend/src/worker/processors/generation.ts, services/backend/test/e2e/generation-edit.test.ts, services/backend/test/resilience/fault-injection.test.ts |
| T12 | 포트폴리오 읽기·편집·레이아웃·지면 | mongodb-12 | T11 | M12-01 | 70 | services/backend/src/modules/portfolios/**, services/backend/src/modules/portfolio-editing/**, services/backend/src/modules/layout/**, services/backend/src/modules/page/**, services/backend/src/platform/snapshot-payload* |
| T13 | 배포·미디어·내보내기 | mongodb-13 | T12 | M13-01 | 50 | services/backend/src/modules/publishing/**, services/backend/src/modules/media/**, services/backend/src/worker/processors/export.ts, services/backend/test/e2e/publish-analytics.test.ts, services/backend/test/e2e/full-release.test.ts |
| T14 | 방문 분석·대시보드·알림 | mongodb-14 | T13 | M14-01 | 60 | services/backend/src/modules/analytics/**, services/backend/src/modules/engagement/**, services/backend/test/e2e/publish-analytics.test.ts, services/backend/test/e2e/full-release.test.ts |
| T15 | 계정 삭제와 예약 작업 | mongodb-15 | T14 | M15-01 | 55 | services/backend/src/modules/account-lifecycle/**, services/backend/src/modules/scheduling/**, services/backend/src/worker/processors/scheduled-jobs.ts, packages/database/src/collection-specs.ts |
| T16 | 공고 자산의 선택 이관 | mongodb-16 | T07 | M16-01 | 60 | scripts/operations/migrate-mysql-to-mongodb.mjs, scripts/operations/mongodb-import/**, packages/database/src/job-import.test.ts, docs/operations/*MIGRAT*.md, package.json, pnpm-lock.yaml |
| T17 | 전체 런타임 연결과 MySQL 제거 | mongodb-17 | T15, T16 | M17-01 | 60 | services/backend/src/api/**, services/backend/src/worker/**, services/backend/src/config/**, services/backend/src/platform/**, services/backend/src/modules/**, services/backend/.env.example, services/backend/package.json, packages/database/src/index.ts, packages/database/src/cli.ts, packages/database/package.json, package.json, scripts/test-infra.mjs, pnpm-lock.yaml |
| T18 | CI·성능·백업·복원 리허설 | mongodb-18 | T17 | M18-01 | 80 | .github/workflows/**, infra/**, scripts/operations/**, README.md, AGENTS.md, packages/database/README.md, services/backend/test/**, docs/operations/** |
| T19 | 운영 전환과 결과 기록 | coordinator | T18 | M19-01 | 25 | docs/operations/MONGODB_CUTOVER.md |

Target effective concurrency: 2. Review capacity: 1. Integration capacity: 1.

## 7. Milestones and vertical slices

- T01–T03 기반과 공개 경계
- T04–T16 도메인 전환과 선택 이관
- T17–T18 전체 연결과 복원 리허설
- T19 별도 승인 운영 전환

## 8. Verification strategy

- 작업별 기존 suite + 새 부정·경쟁 테스트
- pnpm typecheck, pnpm test, pnpm test:infra, load/e2e/security/resilience
- 원본/대상 전수 ID·필드 해시·참조·sourceSpan 비교와 별도 복원 인스턴스 리허설

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| 거대한 공유 스키마와 런타임 연결 변경이 병렬 결과를 무효화한다. | T01–T03 계약을 먼저 동결하고 경로가 겹치는 작업은 의존성으로 직렬화한다. |
| 개발 환경의 Docker 중단이 트랜잭션 검증을 가린다. | 실제 replica set 증거가 없으면 기반 작업을 완료하지 않는다. |
| 신규 쓰기 뒤 단순 MySQL 복귀가 데이터를 잃는다. | T19에서 쓰기를 먼저 중단하고 MongoDB 데이터를 보존한 뒤 복구 결정을 내린다. |

## 10. Rollout and rollback

### Rollout

- T18 리허설 뒤 T19에서 대상·중단·백업을 다시 확인한다.
- 새 큐 prefix expresso-mongo-v1로 전환하고 이전 Redis를 비우지 않는다.

### Rollback

- 새 사용자 쓰기 전에는 기존 구성으로 복원한다.
- 새 쓰기 뒤에는 MongoDB를 보존하고 전진 수정 또는 별도 역이관을 검토한다.
