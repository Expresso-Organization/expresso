# Expresso 백엔드 직렬 구현 실행 계획

- 상태: 실행 중
- 실행자: coordinator 직접 수행
- 서브에이전트: 사용하지 않음
- 작업 상태: `coordination/task-state.json`
- 실행 순서: `coordination/task-dag.json`

파일명은 기존 파이프라인 도구와 대시보드 호환성을 위해 유지하지만, 실행 방식은 병렬이 아니라 완전한 직렬 실행이다.

## 1. 실행 원칙

1. 현재 checkout에서 제가 한 작업씩 직접 구현한다.
2. 각 작업의 dependency가 `verified`일 때만 다음 작업을 시작한다.
3. 구현과 공통 wiring을 같은 작업 안에서 처리해 별도 통합 브랜치나 worker worktree를 만들지 않는다.
4. 서브에이전트, custom worker role, MCP 격리 probe, worker branch를 사용하지 않는다.
5. 기존 사용자 변경을 보존하고 수정 전 파일 내용을 확인한다.
6. 체크리스트는 focused test, 영향 회귀, 전체 검증과 증거 감사 후에만 닫는다.

## 2. 직렬 실행 순서

```text
B00 기준선/결정
→ T01 API·이벤트 계약
→ T02 인프라·CI·관측
→ T03 인증/격리
→ G00 기반 게이트
→ T16 entitlement/quota
→ T04 D1 커리어
→ G01 커리어 E2E
→ T05 D2 공고
→ T06 D3 분석
→ G02 공고·분석 E2E
→ T07 D4 재료
→ T08 D5 인터뷰
→ T09 D6 레시피
→ G03 제작 준비 E2E
→ T10 템플릿
→ T11 생성
→ T12 편집/복원
→ G04 생성·편집 E2E
→ T13 배포/export
→ T14 분석
→ G05 배포·분석 E2E
→ T15 알림/읽기 모델
→ T19 계정 수명주기
→ T17 정기 작업
→ T18 하드닝
→ G06 출시 게이트
```

## 3. 작업 단위 절차

각 task마다 다음 순서를 반복한다.

1. 현재 state, checklist ID, 완료 기준과 owned path를 확인한다.
2. 관련 명세와 기존 코드를 읽고 task를 `running`으로 전환한다.
3. 공개 계약과 데이터 불변식을 먼저 테스트로 고정한다.
4. 최소 구현과 API/Worker wiring을 적용한다.
5. focused test와 실제 PostgreSQL/Redis 통합 테스트를 실행한다.
6. 전체 diff를 완료 기준별로 자체 리뷰하고 필요한 수정을 한 번에 반영한다.
7. `pnpm typecheck`, `pnpm test`, `pnpm build`로 영향 회귀를 확인한다.
8. 증거 경로와 명령 결과를 기록하고 task를 `verified`로 전환한다.
9. 해당 task에 매핑된 체크리스트만 닫고 다음 ready task로 이동한다.

## 4. 공유 파일 처리

- `packages/contracts/**`: T01에서 기본 계약을 만들고 후속 변경은 사용하는 도메인 task 시작 전에 먼저 계약 테스트로 고정한다.
- `services/backend/src/api/build-app.ts`: 도메인 route가 추가될 때 그 task에서 wiring하고 기존 route 회귀를 실행한다.
- `services/backend/src/worker/main.ts`: processor가 추가될 때 그 task에서 wiring하고 종료/재시도 테스트를 실행한다.
- `services/backend/package.json`, 루트 `package.json`, `pnpm-lock.yaml`: 필요한 dependency와 script를 사용하는 task에서 함께 갱신한다.
- `packages/database/migrations/**`: 기존 migration을 수정하지 않고 순번이 있는 새 파일만 추가한다.
- `coordination/**`, 체크리스트, 구현 리포트: task 전환과 증거 확인 직후 동기화한다.

## 5. 자체 리뷰와 완료 판정

독립 reviewer 대신 coordinator가 구현 직후 별도의 증거 감사 단계를 수행한다.

- diff가 task의 owned path와 완료 기준에 한정되는지 확인한다.
- 정상 경로뿐 아니라 권한, 멱등성, 동시성, 실패/재시도, 경계값 테스트를 확인한다.
- 사용자 A/B 격리, 근거 없는 AI 출력, quota 중복 차감 같은 P0/P1 회귀를 우선 검사한다.
- 테스트 통과만으로 체크리스트를 닫지 않고 실제 schema, 응답 fixture, 상태 전이와 로그 증거를 함께 확인한다.
- 새 요구사항은 현재 task 완료 기준에 몰래 추가하지 않고 계획·체크리스트·DAG를 먼저 갱신한다.

## 6. 상태와 측정

- 모든 task owner는 `coordinator`다.
- 예상 측정 세션은 coordinator 1개이며 implementer/reviewer 세션은 0개다.
- 병렬 절감 시간과 speedup은 측정하지 않는다. 실제 직렬 wall time, 사용자 pause, blocker wait만 구분한다.
- dashboard는 실행 순서와 완료 증거를 보여주는 정적 진행판으로 계속 사용한다.
- task가 실패하면 다음 작업으로 건너뛰지 않고 원인과 복구 가능 경로를 state에 기록한다.

## 7. Git과 기존 변경 보호

- worker worktree와 worker branch는 사용하지 않는다.
- 현재 미커밋 상태 자체를 baseline으로 기록하고 작업별 변경 파일을 구분한다.
- 사용자 소유 개발 포털 변경을 stash/reset/checkout하지 않는다.
- 커밋은 사용자가 명시적으로 요청하거나 기존 승인 흐름에서 필요한 시점에만 의미별로 만든다.
- 직렬 구현이므로 clean worktree는 dispatch gate가 아니지만, 테스트 실패 원인 분석 시 기존 변경과 이번 변경을 명확히 구분한다.

## 8. 중단 조건

- 제품 결정이 데이터 모델이나 공개 계약을 실질적으로 바꾸는 경우.
- 현재 사용자 변경과 같은 줄을 수정해야 하는데 의도를 안전하게 판별할 수 없는 경우.
- 외부 자격증명, 결제/메일/AI provider 선택처럼 새 권한 또는 사용자 선택이 필요한 경우.
- 마이그레이션이 기존 데이터를 파괴하거나 복구 불가능한 변경을 요구하는 경우.

이 경우에는 안전한 read-only 진단과 대안을 먼저 기록하고 사용자에게 필요한 선택만 요청한다.
