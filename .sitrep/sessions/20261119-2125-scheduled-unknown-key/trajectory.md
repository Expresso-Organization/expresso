# 작업 기록: 배포 중 새 예약 작업의 첫 실행 보존

## 2026-11-19

### 21:25 · T1 시작 · 원인 확인
- 워크트리 `.worktree/scheduled-unknown-key`, 브랜치 `fix/scheduled-unknown-job-key`(origin/main `2479678a`)
- `scripts/operations/deploy.sh` 92행 `pnpm db:migrate`, 94행 백엔드 빌드, 111행 웹 빌드, 126행 `expresso-worker` 재시작
- `worker/main.ts` 폴링 루프가 `outboxPollIntervalMs`마다 `scheduleDue()` 호출
- `scheduleDue`는 키와 관계없이 `nextRunAt <= 지금`인 정의를 모두 집고 같은 트랜잭션에서 `nextRunAt`을 옮김
- `#execute`는 모르는 키에서 `unsupported scheduled job key`를 던짐. 재시도는 `platform/mongo-outbox.ts`의 `maxAttempts` 기본값 5

### 21:35 · T2 결정 · 워커가 아는 키만 집기
- 고른 선택지: `scheduleDue` 조회를 `SCHEDULED_JOB_KEYS`로 제한(에이전트 결정, 작업 지시의 후보 a)
- 버린 선택지: 배포 스크립트가 마이그레이션 전에 워커를 멈추기. 빌드 동안 큐 소비자가 꺼지고, 빌드 실패 시 워커가 멈춘 채 끝나며, 코드 롤백을 막지 못함
- 커밋 `b09a03bb` intent · `e02c15cf` spec · `8b01b974` plan

### 21:45 · T3 완료 · 구현과 시험
- 수정 전 새 시험 실패 확인: 두 키를 뺀 서비스가 정의 11개를 모두 예약(기대 9)
- 수정 뒤 예약 모듈 통합 시험 7개 통과
- 발견: `createMongoFixture` 라벨이 16자를 넘으면 DB 이름이 63자를 넘어 실패. 라벨을 `schedunknown`으로 줄임

### 21:47 · T4 완료 · 문서
- `docs/operations/DEPLOYMENT.md` 「실행」에 배포 뒤 `scheduled_job_runs` 확인, 조회 예시, 적용 시점 추가

### 21:51 · T5 완료 · 검증
- `pnpm typecheck` 통과
- `pnpm test` 통과(계약 115 · 백엔드 660 · 웹 473 등)
- `pnpm test:infra` 60파일 363개 통과
- 발견: 예약 시험과 함께 돌린 한 번의 실행에서 `account-lifecycle/mongo.integration.test.ts`의 「exports owned documents」가 실패. 단독 재실행과 전체 실행에서는 통과. 이 변경과 무관한 시험

### 22:00 · 보고 · 완료됨 100%
- 전달: 워커가 모르는 예약 작업 키의 정의를 집지 않음. 새 워커가 원래 예정 시각으로 실행을 만듦
- 결정 요청: 없음. PR #243 머지는 사용자가 정함(머지하면 운영에 배포됨)
- 기타: 이 변경이 배포된 뒤의 워커부터 적용. 이 변경과 새 예약 작업이 같은 배포에 실리면 보호되지 않음
