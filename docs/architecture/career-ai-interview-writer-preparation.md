# AI Proposal / Interview Career writer 준비

PR-D 기준은 PR-C 5557448fc905827af383dc51929621b6c85bf8cd다. 준비용 producer와 내부 Spring endpoint는 기존 제품 bootstrap에 연결하지 않는다. Spring 설정은 career.writer.enabled와 career.integration.enabled가 모두 명시적으로 true일 때만 만들어진다.

## 기존 제품 writer

| 호출 경로 | 현재 저장 동작 | B2에서 교체할 곳 |
| --- | --- | --- |
| Career AI Proposal panel → Web API proxy → career-editor routes/socket → AiProposalService.apply | Yjs snapshot/update/revision/documentVersion과 Career properties/updatedAt/version을 같은 Mongo transaction에서 변경한다. body-only도 business version을 증가시킨다. | 기존 apply의 직접 Career business write와 canonical 전체 재생성 |
| AiProposalService.create/cancel/reject | Proposal 생성·상태 변경. create는 document bootstrap을 호출한다. | 준비 intent가 있는 Proposal의 상태는 prepared producer로 연결 |
| AiProposalService.undo → CareerDocumentService.restoreRevision | 정확한 적용 documentVersion에서 document만 되돌린다. property 변경은 되돌리지 않는다. | 문서 전용 undo 범위 유지 |
| Brew 답변 action → Web API proxy → Interview routes → InterviewService.saveAnswer → MongoInterviewAnswers.save | Career create/title/bodyMd/version/referenceVersion, Answer/change/progress/record.cleanup outbox를 한 transaction에 저장한다. | business는 Spring, 본문은 document owner로 교체 |
| Worker record.cleanup → InterviewRecordCleaner → MongoInterviewAnswers.recordCleanup | 직접 title/properties/status/updatedAt/version/referenceVersion 및 Answer change를 저장한다. | frozen canonical cleanup command producer로 교체 |
| CareerDocumentService.appendUpdate/restoreRevision 및 compaction | Yjs update/snapshot/revision/documentVersion 소유 | Fastify/Yjs 소유 유지 |

origin/main의 AI/Interview 흐름은 이 base와 같다. #25의 선택 delta 취지는 참고했지만 direct writer는 가져오지 않았다. #35의 canonical 전체 rematerialization, rich body, UI 삭제·redirect·404는 가져오지 않았다. AiRecordInterview 화면의 일부 흐름은 Interview API 대신 일반 Career create/AI Proposal을 호출하므로 그 caller도 보존했다.

## 준비된 owner 경로

AI는 선택한 property ID의 canonical delta와 선택한 document command를 고정한다. business-only는 document를 쓰지 않고, document-only는 canonical property storage를 요구하거나 business version을 쓰지 않는다. mixed는 document를 예약한 뒤 Spring, document owner 순서로 호출한다.

Proposal의 writerIntegration은 operation scope, immutable payload fingerprint, lease, owner 결과, retry 상태를 저장한다. 문서만 되돌리는 undo가 새 intent를 만들 때 이전 completed intent는 writerIntegrationHistory에 남긴다. 0016은 legacy Proposal TTL을 유지하고 준비 intent의 receipt만 만료 대상에서 제외한다.

Interview는 interview_career_operations에 input key와 immutable 결과를 보존한다. pending Answer 원문을 저장해도 owner 완료 전에는 progress/change/cleanup outbox를 완료로 기록하지 않는다. Spring 성공 후 응답이 유실되면 business receipt를 읽고 document 및 finalize를 이어간다. 오래된 input key는 이후 답변 revision과 섞이지 않고 자신의 결과를 replay한다. cleanup은 Answer version, record ID/version, category version, canonical patches를 고정한다.

Owner마다 자신의 write와 source 결과를 같은 transaction에 저장한다. 서비스 간 호출을 하나의 transaction으로 취급하지 않는다. Coordinator는 source metadata만 쓰고 lease를 갱신한다. 만료된 running은 같은 operation으로 재획득할 수 있으며 이전 lease token은 새 write를 할 수 없다. 부분 성공을 rollback했다고 표시하거나 direct Mongo business fallback을 호출하지 않는다.

Document 예약은 문서 owner만 설정·해제한다. 기존 append/restore/bootstrap initialization/body patch와 Proposal 직접 apply는 예약을 존중한다. 기존 Proposal apply/cancel/reject는 준비 intent를 변경하지 않는다. bodyMd와 legacy properties는 준비 경로에서 다시 materialize하지 않는다.

## service actor

사용자 exps session과 별도의 expi credential을 사용한다. producer마다 서로 다른 32 byte 이상 key를 주입하고 user/source/operation/fingerprint/audience/짧은 expiresAt에 서명한다. Session token이나 credential은 job/Proposal/Answer에 저장하지 않는다. Spring은 active user, source ownership, immutable payload, lease, Answer/question/session binding을 transaction에서 확인한다. 운영 key 설정과 배포는 E에서 수행한다.

Node와 Java의 fingerprint는 타입 태그를 붙인 canonical tree를 사용한다. object key는 UTF-16 순서, array는 입력 순서, number는 negative zero를 zero로 맞춘 IEEE754 binary64의 big-endian hex다. decimal business 값은 문자열 그대로 보존한다. 서로 다른 JSON 숫자 formatter에 의존하지 않는다.

## B2 / E에 남은 연결

- AI/Interview 제품 route와 worker를 prepared producer에 연결하고 기존 direct business writer를 제거한다.
- pending Answer를 기존 getSession/answer 조회에서 완료 답변으로 표시하지 않도록 읽기 경로를 연결한다.
- 새 version-bound cleanup outbox를 prepared cleanup consumer로 연결하고 기존 최신 Answer 재조회 기반 record.cleanup 처리와 함께 활성화하지 않는다.
- pending/retry/expired-running intent를 재전달하는 운영 trigger를 연결한다. 현재 execute/retry는 durable 상태를 회복하지만 scheduler/runtime 등록은 하지 않는다.
- service credential 발급·회전·배포 설정 및 내부 endpoint 네트워크 제한을 E에서 구성한다.
- 기존 canonical storage 준비와 authoritative writer 전환 조건을 B2에서 만족시킨다. prepared producer가 legacy properties를 canonical 전체 값으로 재구성하지 않는다.
- record/account purge 이후 source가 사라진 operation은 receipt를 근거로 새 기록을 만들지 않는다. 새 ledger는 account purge 대상이다.

기존 0014/0015, 제품 HTTP path, Web routing, UI, Worker main, dependency/lockfile, CI/deploy는 PR-D에서 변경하지 않는다.