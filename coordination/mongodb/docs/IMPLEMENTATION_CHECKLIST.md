<!-- generated from coordination/execution-spec.json; schema=2 revision=3 sha256=7444e95e55cfb83655368c1ff643c81a67d41fe36fdb5768b2e9f66a23aa8f82 generator=1; do not edit -->
# Expresso MongoDB migration implementation checklist

- Related plan: [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)
- Canonical source: [`coordination/execution-spec.json`](../coordination/execution-spec.json)
- Execution spec revision: 3

## Closure rule

The task contract is generated from the execution spec. Checkbox state is runtime evidence: close an item only after integrated verification passes.

- [x] **M0-01. 재현 가능한 기준선과 실행 계약 기록.**
  - Task: B0.
  - Completion criteria: 리비전·기존 실패·인프라 상태·격리 정책이 실행 명세와 증거에 일치한다.
  - Evidence: baseline-typecheck.log, baseline-test.log, MCP proof와 worktree manifest.
  - Dependencies: None.

- [x] **M1-01. 연결과 격리 테스트 환경.**
  - Task: T01.
  - Completion criteria: briefs/T01.md의 테스트와 완료 기준이 통과하고 검토가 승인된다
  - Evidence: coordination/mongodb/briefs/T01.md에 명시된 focused test log, 변경 파일과 독립 검토 verdict.
  - Dependencies: M0-01.

- [ ] **M2-01. 컬렉션·마이그레이션·초기 데이터.**
  - Task: T02.
  - Completion criteria: briefs/T02.md의 테스트와 완료 기준이 통과하고 검토가 승인된다
  - Evidence: coordination/mongodb/briefs/T02.md에 명시된 focused test log, 변경 파일과 독립 검토 verdict.
  - Dependencies: M1-01.

- [ ] **M3-01. 트랜잭션·Outbox·모듈 공개 경계.**
  - Task: T03.
  - Completion criteria: briefs/T03.md의 테스트와 완료 기준이 통과하고 검토가 승인된다
  - Evidence: coordination/mongodb/briefs/T03.md에 명시된 focused test log, 변경 파일과 독립 검토 verdict.
  - Dependencies: M2-01.

- [ ] **M4-01. 계정·권한·동의.**
  - Task: T04.
  - Completion criteria: briefs/T04.md의 테스트와 완료 기준이 통과하고 검토가 승인된다
  - Evidence: coordination/mongodb/briefs/T04.md에 명시된 focused test log, 변경 파일과 독립 검토 verdict.
  - Dependencies: M3-01.

- [ ] **M5-01. 기록·카테고리·뷰·프로필.**
  - Task: T05.
  - Completion criteria: briefs/T05.md의 테스트와 완료 기준이 통과하고 검토가 승인된다
  - Evidence: coordination/mongodb/briefs/T05.md에 명시된 focused test log, 변경 파일과 독립 검토 verdict.
  - Dependencies: M4-01.

- [ ] **M6-01. 기록 참조·삭제 제한·스킬.**
  - Task: T06.
  - Completion criteria: briefs/T06.md의 테스트와 완료 기준이 통과하고 검토가 승인된다
  - Evidence: coordination/mongodb/briefs/T06.md에 명시된 focused test log, 변경 파일과 독립 검토 verdict.
  - Dependencies: M5-01.

- [ ] **M7-01. 공고 원본·수집·검색.**
  - Task: T07.
  - Completion criteria: briefs/T07.md의 테스트와 완료 기준이 통과하고 검토가 승인된다
  - Evidence: coordination/mongodb/briefs/T07.md에 명시된 focused test log, 변경 파일과 독립 검토 verdict.
  - Dependencies: M4-01.

- [ ] **M8-01. 사용자 분석·재료·Brew 작업.**
  - Task: T08.
  - Completion criteria: briefs/T08.md의 테스트와 완료 기준이 통과하고 검토가 승인된다
  - Evidence: coordination/mongodb/briefs/T08.md에 명시된 focused test log, 변경 파일과 독립 검토 verdict.
  - Dependencies: M6-01, M7-01.

- [ ] **M9-01. 인터뷰와 답변의 기록 반영.**
  - Task: T09.
  - Completion criteria: briefs/T09.md의 테스트와 완료 기준이 통과하고 검토가 승인된다
  - Evidence: coordination/mongodb/briefs/T09.md에 명시된 focused test log, 변경 파일과 독립 검토 verdict.
  - Dependencies: M8-01.

- [ ] **M10-01. Recipe와 템플릿.**
  - Task: T10.
  - Completion criteria: briefs/T10.md의 테스트와 완료 기준이 통과하고 검토가 승인된다
  - Evidence: coordination/mongodb/briefs/T10.md에 명시된 focused test log, 변경 파일과 독립 검토 verdict.
  - Dependencies: M9-01.

- [ ] **M11-01. 생성 결과와 사용량 확정.**
  - Task: T11.
  - Completion criteria: briefs/T11.md의 테스트와 완료 기준이 통과하고 검토가 승인된다
  - Evidence: coordination/mongodb/briefs/T11.md에 명시된 focused test log, 변경 파일과 독립 검토 verdict.
  - Dependencies: M10-01.

- [ ] **M12-01. 포트폴리오 읽기·편집·레이아웃·지면.**
  - Task: T12.
  - Completion criteria: briefs/T12.md의 테스트와 완료 기준이 통과하고 검토가 승인된다
  - Evidence: coordination/mongodb/briefs/T12.md에 명시된 focused test log, 변경 파일과 독립 검토 verdict.
  - Dependencies: M11-01.

- [ ] **M13-01. 배포·미디어·내보내기.**
  - Task: T13.
  - Completion criteria: briefs/T13.md의 테스트와 완료 기준이 통과하고 검토가 승인된다
  - Evidence: coordination/mongodb/briefs/T13.md에 명시된 focused test log, 변경 파일과 독립 검토 verdict.
  - Dependencies: M12-01.

- [ ] **M14-01. 방문 분석·대시보드·알림.**
  - Task: T14.
  - Completion criteria: briefs/T14.md의 테스트와 완료 기준이 통과하고 검토가 승인된다
  - Evidence: coordination/mongodb/briefs/T14.md에 명시된 focused test log, 변경 파일과 독립 검토 verdict.
  - Dependencies: M13-01.

- [ ] **M15-01. 계정 삭제와 예약 작업.**
  - Task: T15.
  - Completion criteria: briefs/T15.md의 테스트와 완료 기준이 통과하고 검토가 승인된다
  - Evidence: coordination/mongodb/briefs/T15.md에 명시된 focused test log, 변경 파일과 독립 검토 verdict.
  - Dependencies: M14-01.

- [ ] **M16-01. 공고 자산의 선택 이관.**
  - Task: T16.
  - Completion criteria: briefs/T16.md의 테스트와 완료 기준이 통과하고 검토가 승인된다
  - Evidence: coordination/mongodb/briefs/T16.md에 명시된 focused test log, 변경 파일과 독립 검토 verdict.
  - Dependencies: M7-01.

- [ ] **M17-01. 전체 런타임 연결과 MySQL 제거.**
  - Task: T17.
  - Completion criteria: briefs/T17.md의 테스트와 완료 기준이 통과하고 검토가 승인된다
  - Evidence: coordination/mongodb/briefs/T17.md에 명시된 focused test log, 변경 파일과 독립 검토 verdict.
  - Dependencies: M15-01, M16-01.

- [ ] **M18-01. CI·성능·백업·복원 리허설.**
  - Task: T18.
  - Completion criteria: briefs/T18.md의 테스트와 완료 기준이 통과하고 검토가 승인된다
  - Evidence: coordination/mongodb/briefs/T18.md에 명시된 focused test log, 변경 파일과 독립 검토 verdict.
  - Dependencies: M17-01.

- [ ] **M19-01. 운영 전환과 결과 기록.**
  - Task: T19.
  - Completion criteria: 운영 전환은 사용자 확인 뒤 실행 기록으로 검증된다
  - Evidence: docs/operations/MONGODB_CUTOVER.md 실행 기록, 사용자의 운영 전환 확인.
  - Dependencies: M18-01.
