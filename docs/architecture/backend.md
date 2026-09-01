# 백엔드 아키텍처

이 문서는 현재 MySQL 기반 구현을 설명합니다. 승인된 변경 방향은 [MongoDB 기반 백엔드 마이그레이션 설계](mongodb-migration-design.md)에 기록합니다. MongoDB 구현과 운영 전환은 아직 진행하지 않았습니다.

## 출발점

Expresso 백엔드는 하나의 코드베이스 안에서 도메인 경계를 지키는 모듈러 모놀리스로 시작합니다. API와 비동기 Worker는 같은 도메인 코드를 사용하지만 별도 프로세스로 실행하고 배포할 수 있습니다.

```text
HTTP request
    │
    ▼
services/backend/src/api
    │
    ▼
services/backend/src/modules
    │
    ├── MySQL
    ├── Redis / BullMQ
    └── Object storage

Background job
    │
    ▼
services/backend/src/worker
    │
    └── 같은 modules와 platform 계층 사용
```

## 경계

- `api`: HTTP 서버 조립, 라우팅, 인증 컨텍스트, 오류 응답
- `worker`: 큐 소비자 조립과 장시간 작업 실행
- `modules`: 커리어 기록, 공고, 인터뷰, 생성, 편집, 배포, 분석 등 업무 규칙
- `platform`: MySQL, Redis, 큐, 객체 저장소처럼 외부 시스템과 맞닿는 어댑터
- `config`: 실행 환경 검증

도메인 모듈은 다른 모듈의 내부 파일을 직접 가져오지 않습니다. 공유해야 하는 공개 계약은 각 모듈의 진입점이나 `packages/contracts`를 통해 노출합니다.

## 배포 단위

초기 배포 단위는 다음 두 개입니다.

1. `backend-api`: Fastify HTTP 서버
2. `backend-worker`: BullMQ 기반 비동기 작업 프로세스

독립적인 확장, 장애 격리 또는 릴리스 주기가 실제로 필요해질 때만 별도 서비스로 분리합니다.

## 구현 순서

1. 런타임 골격과 상태 검사
2. 데이터베이스 스키마와 마이그레이션 기반
3. 인증·워크스페이스 경계
4. 커리어 기록과 증거 데이터
5. 공고 분석과 인터뷰 작업 큐
6. 포트폴리오 생성·편집·버전 관리
7. 배포 스냅샷과 방문 분석
8. 관측성, 보안, 백업·복구 검증

## 데이터베이스

물리 스키마와 마이그레이션은 `packages/database`가 소유합니다. 서비스 시작 시 자동으로 스키마를 바꾸지 않으며, 배포 단계에서 다음 명령을 별도로 실행합니다.

```bash
pnpm db:migrate
```

초기 스키마의 문서 간 차이와 해석은 `docs/architecture/data-model-decisions.md`에 기록합니다.
