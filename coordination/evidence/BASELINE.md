# Expresso 백엔드 구현 기준선

- 캡처일: 2026-08-09 (Asia/Seoul)
- 브랜치: `main`
- HEAD: `706fb6db1c56507b76910af095d11ec98449ba4d`
- 원격 저장소: 설정되지 않음
- 작업 트리: 미커밋 변경 있음
- 실행 판정: 직렬 실행 가능 — 현재 미커밋 상태를 보존하며 coordinator가 직접 작업

## 문서 기준

- 기능 명세: D1–D12, 총 151개 태스크.
- 데이터 모델: 제품 테이블 42개.
- 개발 로드맵: 16주, 77pt, 제품 마일스톤 3개.
- 전역 규칙: AI 근거 필수, 사용자 편집 잠금, 미제공 사실/수치 생성 금지, 자동 저장/복원, 장기 작업 백그라운드 실행.

## 소스 기준

- `services/backend`: Fastify API와 BullMQ Worker 골격, PostgreSQL/Redis readiness.
- `packages/database`: `0001_initial_schema.sql`, `0002_domain_invariants.sql`, 체크섬 migration runner.
- `packages/contracts`: 경계만 있고 실행 계약은 아직 없음.
- 실제 도메인 API와 Worker processor는 아직 없음.

## 검증 결과

| 명령 | 결과 | 요약 |
|---|---|---|
| `pnpm test` | PASS | backend 4 + database 11 = 15 tests |
| `pnpm typecheck` | PASS | backend와 database TypeScript 검사 성공 |
| `pnpm build` | PASS | backend와 database build 성공 |
| `pg_isready -h 127.0.0.1 -p 5432` | PASS | PostgreSQL 연결 수락 |
| DB public table count | PASS | 43개(`schema_migration` 포함) |
| DB migration count | PASS | 2개 적용 |
| `docker version` | PASS | Docker Engine 29.6.2 |
| `docker compose version` | PASS | Docker Compose 5.3.1 |
| Redis runtime | NOT READY | 실행 중인 Docker 컨테이너가 없으며 별도 Redis 연결 증거 없음 |

## 작업 트리 보호

기준 HEAD 이후에 개발 포털의 사용자 편집과 모노레포/백엔드/데이터베이스 추가 파일이 함께 존재한다. 서브에이전트와 외부 worktree를 사용하지 않으므로 현재 checkout의 실제 상태를 기준으로 직렬 구현한다. 각 파일을 수정하기 전에 현재 내용을 확인하고 사용자 변경을 보존한다.

금지된 우회:

- 사용자 변경을 stash/reset/checkout으로 숨기거나 버리기.
- 사용자 변경을 구현 편의를 위해 임의 커밋하거나 다른 변경과 섞기.
- dirty 상태를 clean으로 보이게 만들기 위해 기존 파일을 제거하기.
