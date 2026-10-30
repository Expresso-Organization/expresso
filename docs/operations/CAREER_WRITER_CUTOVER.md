# Career Writer Cutover 운영 절차

## 승인 경계

이 문서는 팀장 검토용입니다. 운영 포트·경로·서비스명·Java 경로·인증키를 확정하지 않으며 실제 서버에 적용하지 않았습니다. 기존 Compose, nginx, CI, systemd 설치 방식은 [Spring 운영 준비](SPRING_RUNTIME.md)를 유지합니다. 아래 순서는 운영 DB 변경과 서버 재시작에 대한 별도 승인 후에만 실행합니다.

## 데이터 준비와 배포 순서

1. 이전 API의 Career business 요청과 AI/Interview/schema producer가 새 작업을 받지 않도록 승인된 유지보수 구간을 확보합니다. 이전 Worker의 기존 작업을 먼저 완료한 뒤 API/Worker를 중지합니다. Operation scope 없는 과거 record.cleanup 및 legacy property mutation 메시지는 이전 버전으로 배출하거나 원본 Answer-bound version으로 별도 검토합니다. 새 버전에서 해당 메시지는 409로 거부되며 직접 쓰기 fallback을 하지 않습니다. Canonical 준비 중 이전 writer가 properties를 바꾸면 최신 값이 누락될 수 있으므로 모든 business writer의 정지를 확인합니다.
   기존 DB backup과 migration history/checksum을 확인합니다. 과거 PR의 0014~0016·0018~0019 이력도 존재 여부를 조사하고 수정하거나 다시 기록하지 않습니다.
2. Runtime과 분리된 migration credential로 현재 registry의 미적용 migration을 순서대로 적용합니다. 최신 main 통합 후보는 0017에서 사용자별 Category 소유권을, 0025~0027에서 업무·mutation·producer 준비를, 0028에서 canonical 값과 개인 옵션을 준비합니다. 0029는 relation tombstone, 0030은 durable product ledger와 recovery index를 준비합니다. Canonical 준비의 충돌·손실 변환은 명시적으로 거부하며 Body/Yjs 데이터는 이 준비 과정에서 변환하지 않습니다.
3. Spring JAR를 검증하여 먼저 배포합니다. 기본 설정은 writer/integration/mutation 모두 false입니다. 활성화 전 현재 schema와 정확한 index를 확인합니다.
4. 검토한 설정에서 `CAREER_WRITER_ENABLED=true`, `CAREER_INTEGRATION_ENABLED=true`, `CAREER_PROPERTY_MUTATION_ENABLED=true`를 명시합니다. 해당 기능마다 최소 32 UTF-8 byte의 서로 다른 키를 주입합니다.
5. Readiness 200과 사용자 session command 및 scoped service actor 인증을 점검합니다. 활성화된 readiness는 0017·0025~0030 marker와 receipt/private option/relation tombstone/product recovery index의 key 순서·방향·unique·partial 옵션을 읽기만 합니다. 시작 시 migration을 실행하지 않습니다.
6. API와 Worker를 같은 Spring 주소 및 actor 키로 함께 배포합니다. Web은 기존 BFF 주소를 유지합니다. 주소·키 누락 또는 Spring 장애 시 Career business write는 명시적으로 실패하며 direct Mongo fallback을 하지 않습니다.
7. disposable rehearsal과 같은 create/edit/duplicate/trash/restore/relation/schema/AI/Interview·pending recovery·Yjs smoke를 운영 승인 범위에서 확인합니다.

2026-10-30 통합 후보의 실행 registry는 main의 0011~0013을 포함한 0001~0013·0017·0020~0030, 총 25개입니다. 0014~0016·0018~0019의 옛 PR 입력은 보존하지만 실행 registry에 등록하지 않습니다. 과거 B2/canary marker가 존재하는 DB는 name/checksum과 현재 registry의 호환성을 먼저 조사해야 합니다. 없는 migration을 만들어 applied로 표시하거나 marker를 지워 우회하지 않습니다. 실제 근거는 `packages/database/src/mongo-migrations.ts`와 `OperationsMongoReadiness.java`이며, 최종 SHA 확정 및 운영 history 검토는 Merge 승인 이전에 별도로 완료해야 합니다.

## 내부 설정

Spring 환경 파일과 API/Worker 설정은 root 또는 관리자의 제한된 저장소에 보관합니다. 명령 인수·브라우저 변수·Git·journal에 비밀키를 넣지 않습니다. 설정 도구는 키 이름만 오류에 표시합니다. BOM·잘못된 URI·서로 같은 actor 키는 검증 단계에서 거부합니다.

| 설정 | 적용 위치 |
| --- | --- |
| `SPRING_PORT`, `SPRING_BIND_ADDRESS`, Mongo runtime URI/DB/replicaSet | Spring operations profile. 기본 bind는 loopback입니다. |
| `CAREER_WRITER_MOVE_SECRET` | Spring 사용자 Move preview 검증 전용입니다. |
| `CAREER_SPRING_BASE_URL` | API/Worker 내부 HTTP origin입니다. 확인한 Spring 포트를 사용합니다. |
| `CAREER_PRODUCT_SERVICE_SECRET` | Spring + API/Worker product operation actor입니다. |
| `CAREER_INTEGRATION_AI_SECRET` | Spring + API/Worker AI actor입니다. |
| `CAREER_INTEGRATION_INTERVIEW_SECRET` | Spring + API/Worker Interview actor입니다. |
| `CAREER_PROPERTY_MUTATION_SECRET` | Spring + Worker mutation actor입니다. |
| `CAREER_SCHEMA_PREVIEW_SECRET` | API/Worker schema preview 검증입니다. |

사용자 session token은 background intent나 BullMQ payload에 저장하지 않습니다. Worker는 owned scope/fingerprint/lease로 짧은 내부 credential을 발급합니다. 사용자 ownership과 producer 권한을 별도로 검사합니다. Spring에는 Redis 연결이나 외부 AI 키가 필요하지 않습니다.

## 실패와 복구

Pending/retry 및 expired-running 작업은 API/Worker 재시작 뒤 자동 재전달합니다. 이미 저장한 owner receipt는 replay하며 business version·outbox·document update를 중복 생성하지 않습니다. Live lease가 있는 worker를 강제로 재획득하지 않습니다.

Schema failed job은 원인 해결 뒤 소유 사용자로 `GET /v1/career/property-mutations/:mutationId`를 조회하고 `POST /v1/career/property-mutations/:mutationId/resume`을 사용합니다. 원래 schema generation과 fingerprint가 일치해야 재개됩니다. 불일치하면 409로 남기며 schemaVersion·checkpoint·receipt를 수동 변경하지 않습니다. 자동 완료로 위장하지 않습니다.

Owner recovery-required는 무한 재시도하지 않습니다. 공개 상태와 운영 로그의 operation ID를 기준으로 담당자가 frozen intent, owner receipt, 현재 ownership/version/document state를 확인해야 합니다. 미완료 owner를 직접 Mongo business write로 대신 처리하거나 receipt를 삭제하지 않습니다. AI에서 아무 owner도 commit하지 않았다면 기존 Cancel/Reject로 종료할 수 있습니다. 이미 owner가 성공한 작업이나 Interview generic cancellation은 안전한 임의 취소를 지원하지 않습니다. 충돌을 자동으로 해결할 수 없는 작업은 복구 필요 상태를 유지하고 승인된 보정 작업을 별도로 검토합니다.

## Rollback

[Spring JAR rollback](SPRING_RUNTIME.md)의 SHA256·symlink 검증과 원자적 current 교체를 유지합니다. 손상된 current JAR도 검증된 이전 release로 교체할 수 있습니다. Runtime rollback 시에는 API/Worker/계약 버전과 canonical DB 준비의 양립성을 함께 확인합니다. 0017 및 0025~0030은 forward-only이며 DB를 legacy 값으로 되돌리지 않습니다. Legacy direct writer를 다시 활성화하는 것은 지원되는 실패 fallback이나 자동 rollback이 아닙니다. 안전한 버전을 확보할 때까지 business write를 명시적으로 중단하고 문서·읽기 경로를 보존합니다.
