# Career Migration 기술 인수인계

## 적용 범위

2026-10-13 B2 인수인계의 범위 결정과 후속 작업을 보존하며, 2026-10-30 최신 main 통합 후보의 migration 조건은 아래 운영 전 조건에 갱신했습니다. Career 업무 Writer 전환과 제목·native Yjs 저장을 통합하며 properties·bodyMd는 호환 데이터로 취급합니다. 이 문서는 운영 배포 승인이나 과거 검증 결과를 새로운 최종 SHA의 성공으로 대체하지 않습니다. 커밋 승인 전 작업 트리 검증은 최종 SHA의 독립검증과 구분합니다.

## Generic Agent Chat 범위 결정

Generic Agent Chat의 Career AI 연동은 이번 MVP·PR 개발 및 합격 기준에서 제외합니다. 기존 AI 계약 문제 4건은 이번에 해결하지 않습니다. 별도 Feature Flag, UI/API 차단 코드와 차단 회귀 테스트도 추가하지 않습니다. 따라서 기존 보고서의 Agent 차단 구현 선행 조건은 이번 후보에 적용하지 않습니다.

팀 내부에서 Generic Agent Chat의 Career 제안 생성·적용·승인·Undo를 사용하지 않는다는 전제로 진행합니다. Career Record를 문맥으로 연결한 범용 대화에서 기록 변경을 요청하거나, 기존 대화에 남은 Career 제안을 승인·Undo하는 경로도 사용 금지 범위입니다. 전용 Career AI Proposal 경로와 Generic Agent Chat 경로를 구분해야 합니다. 전용 경로의 PASS가 범용 경로의 정상 동작을 증명하지 않습니다.

이 결정은 기능 접근을 기술적으로 제한하지 않습니다. 기존 main에서 온 `/agent` 화면, Career 편집기의 Agent 패널, `/api/agent/*` BFF, `/v1/agent/*` Backend 경로는 최종 Preview에 남습니다. Backend `AGENT_CHAT_ENABLED=0`의 기본값은 모델 runtime을 끄지만 서비스와 대화·credential·context·approval API 등록까지 제거하지 않습니다. UI도 전송을 제한할 뿐 화면 및 대화 목록 요청을 제거하지 않습니다. 기존 제안에 대한 승인 경로가 남는다는 점을 운영자가 알아야 합니다.

운영 서버의 현재 Agent 설정·기존 대화 데이터·외부 사용자 접근을 이번 작업에서 확인하지 않았습니다. **내부 사용 금지는 외부 사용자 접근이나 설정 변경에 대한 방어 수단이 아닙니다.** 운영에 이 후보를 노출하기 전 담당자가 공개 접근과 기존 제안 상태를 확인해야 합니다. 운영 노출이 확인되면 이 위험을 release 판단에 반영해야 하며, 이번 PR에서 임의로 차단 구현이나 Agent 계약 수정을 추가하지 않습니다.

## 미해결 AI 계약

| 항목 | 영향 | 후속 작업 시점 |
| --- | --- | --- |
| Prepared 제안의 canonical context·validation·publication 연결 누락 | 범용 caller가 정밀 canonical 값과 private option을 정확히 소비·검증하거나 제안을 전달한다는 보장이 없습니다. | Generic Career AI 연동 재개 전 |
| Apply pending 202를 구형 facade가 503으로 변환 | 일부 owner가 이미 저장한 뒤에도 Agent는 실패로 보며 operation ID·polling·재전달을 추적하지 못합니다. 재승인을 안전한 사용 절차로 안내하면 안 됩니다. | Generic Career AI 연동 재개 전 |
| Generic Undo의 구형 호출과 product writer 연결 불일치 | production owner graph에서 기존 Undo 메서드가 409를 반환합니다. | Generic Career AI 연동 재개 전 |
| Undo 범위 표시 미정렬 | 본문만 되돌리고 업무 속성을 유지하는 경우도 전체 변경을 되돌린 것으로 오해할 수 있습니다. | Generic Career AI 연동 재개 전 |

후속 개발에서는 canonical reader·publisher와 operation API를 연결하고, body-only/business-only/mixed Undo 문구와 동작을 정렬해야 합니다. 기존 Agent integration test의 legacy service 조립 대신 실제 `createCareerWriterRuntime`을 사용하는 production composition에서 deterministic model 대역으로 검증해야 합니다. 실 모델 호출 성공만으로 이 계약을 검증할 수 없습니다.

## 저장 수정과 Writer 경계

제목·text·date draft는 같은 값의 새 객체가 전달됐다는 이유만으로 초기화하지 않습니다. Record가 바뀌면 제목 editor를 새로 구성합니다. 본문은 JSON만으로 Yjs를 다시 만드는 대신 snapshot의 실제 `stateUpdate`를 읽습니다. HTTP bootstrap, WebSocket ready, compaction, revision restore, prepared document writer와 기존 본문 projection이 같은 인과 상태를 이어야 합니다. 구형 JSON 전용 snapshot은 fallback reader로 읽습니다.

클라이언트는 인증된 ready 이후 pending update를 보내며, 같은 연결에서 ACK를 기다리는 update를 반복 전송하지 않습니다. ready 및 중복 ACK의 documentVersion은 이미 받은 update/version보다 낮아지지 않아야 합니다. 4401은 token 재발급 후 pending을 유지하고, 4403은 자동 재시도를 중지합니다. 폐기된 session/socket의 늦은 callback은 현재 기록을 변경하지 않아야 합니다. 저장 상태 표시는 실제 본문 session의 loading/saving/offline/conflict/saved를 반영하며 제목·Property 저장 상태로 확대 해석하면 안 됩니다.

Spring은 Record 생성·업무 patch·제목/상태/일반 속성·Relation·Trash/Restore·Move의 업무 Writer입니다. Fastify는 Web/BFF의 진입점과 Yjs 문서/WS 저장, metadata 및 schema job 조정, prepared operation 회복을 맡습니다. 모든 Writer가 Spring으로 이전됐다는 뜻은 아닙니다. Spring base URL·secret이 없거나 owner가 장애이면 업무 저장은 실패해야 하며 Fastify 업무 Writer로 fallback하면 안 됩니다.

## 미완성 제품 기능

| 후속 과제 | 현재 제한 | 우선순위·권장 시점 |
| --- | --- | --- |
| Record Trash 목록·Restore UI | Restore API와 사용자 복원 화면은 별개입니다. 현재 UI에서 Record를 복원할 수 없습니다. | P1, 복원을 제공할 제품 단계 전 |
| Portfolio V2 최종 생성 연결 | 현재 Portfolio 제작 과정의 최종 생성 UI가 미완성입니다. 기존 legacy 생성 API나 Record 연결 기능을 새 최종 생성 완료로 계산하지 않습니다. | P1, Portfolio 생성 MVP 승인 전 |
| Schema 삭제 속성 복원·문서 revision history/restore 화면 | API 중심이며 제품 UI caller가 부족합니다. Record Restore와 문서 revision restore는 다른 기능입니다. | P2, 편집 이력 UX 후속 단계 |
| 전체 Record pagination | 기존 50건 조회 제한의 UI 처리가 남습니다. 이번 저장 이식의 변경이 아닙니다. | P2, 데이터가 늘어나는 단계 전 |
| Move 대상 required 의미 확정 | draft에서 누락 속성을 허용하는지 계약 결정이 필요합니다. 기존 테스트 PASS로 required 누락 반례를 승인하지 않습니다. | P1, required 정책 확정 시 |
| 전용 Career AI 운영 활성화 | provider·credential·consent·서비스/owner 설정이 필요합니다. Generic Agent 제외 정책과 별개입니다. | 기능 활성화 전 |
| `dev:career` 로컬 편의 개선 | Preview의 launcher 변경은 원본에 보존하고 이번 저장 이식에서 제외했습니다. 기존 Local Test 환경을 공유하는 launcher는 독립검증 명령이 아닙니다. | P2, 별도 개발 환경 변경 |

## Merge 및 운영 전 조건

제목·Yjs 수정과 신규 Helper/테스트를 포함한 최종 커밋 SHA를 확정해야 합니다. 그 SHA의 별도 clean worktree에서 최소 독립검증을 수행해야 합니다. 커밋 전 후보의 frozen install·typecheck·회귀 결과를 최종 SHA 검증 완료로 표시하지 않습니다.

현재 `packages/database/src/mongo-migrations.ts`의 실행 registry는 0001~0013·0017·0020~0030의 총 25개입니다. 기존 main의 0011~0013을 보존하며, 옛 PR의 0014~0016·0018~0019 입력은 실행하지 않고 새 업무 준비를 0025부터 전진시켰습니다. 과거 B2의 16개 이력을 현재 통합 이력과 혼동하면 안 됩니다. Spring readiness는 0017·0025~0027을, 제품 writer 활성화 시 0028~0030도 요구합니다. 새 fixture의 migration PASS는 운영 DB의 기존 name/checksum·unknown migration·데이터 호환을 승인하는 증거가 아닙니다. 운영 DB 이력 inventory와 backup을 확인해야 합니다. unknown 또는 변경된 과거 이력은 자동 수정·재번호·체크섬 갱신하지 않습니다.

기존 main 자동 배포 경로는 Spring 선행 준비, 기존 업무 Writer 정지, migration과 Worker recovery 순서를 자동으로 보장하지 않습니다. 자동 배포가 활성화되어 있다면 **main Merge 이전에 배포 담당자가 maintenance/cutover 및 rollback 경로를 확정해야 합니다.** Merge 승인과 운영 배포 승인은 분리합니다. 이 문서는 배포 실행이나 안전성 확인을 대신하지 않습니다.

최종 SHA의 Backend `verify`, Web `verify`, Spring `unit`/`mongo` GitHub Actions 결과와 필수 Mongo suite 실행 여부가 필요합니다. 로컬 Spring 코드가 바뀌지 않았다면 이미 확보한 Spring Mongo 전체 PASS를 재사용하고 bootJar·실제 owner smoke와 최종 CI로 확인합니다.

## 최소 독립검증

기존 보고서 7장의 격리 Mongo 57917 replica set·Redis 57579 계획을 따릅니다. 기존 DB·volume·원본 Preview의 node_modules/dist/.next를 공유하지 않습니다. 실제 시작 전 포트·container/project·volume 충돌을 다시 확인합니다.

- Frozen install, 공유 패키지 build, typecheck, Backend/Web production build.
- 제목 입력·Property 수정·Record 전환·본문 저장 상태·same-version sync.
- Yjs HTTP reopen·refresh·snapshot/compaction·재연결·ready·ACK·중복 전송 회귀.
- Spring Writer 경로·canonical 정밀 값·Relation·Trash·Schema mutation·Worker recovery.
- Migration 16개 최초 적용·재실행·index·validator 검증.
- 실제 Chrome Web → BFF → Fastify → Spring → Mongo 저장 smoke. update/ACK/documentVersion 일치, 새로고침 보존, browser error 0, Spring 장애 시 no fallback.
- 최종 SHA GitHub Actions 확인.

**Generic Agent 계약 해결과 UI/API 차단 검증은 이 매트릭스의 선행 조건 및 합격 기준에서 제외합니다.** 미해결 위험은 이 문서에 유지하며, 새로운 사용 승인으로 해석하지 않습니다. 예상하지 못한 SKIP은 원인을 기록하고 필수 suite 누락을 합격 처리하지 않습니다.
