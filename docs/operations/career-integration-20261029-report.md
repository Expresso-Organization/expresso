# Career Migration 최신 main 통합 검증

작성일: 2026-10-29 (Asia/Seoul). 로컬 검토용 미커밋 결과입니다. commit, push, GitHub PR 수정, 운영 배포는 하지 않았습니다.

## 1. 최신 main의 기능과 구조

- fetch 확인: 2026-10-29 15:22 KST. 기준 `origin/main`: `b600715d6c9ee4969bcdbcca804ce3c0c32f6567`.
- 기존 비교 환경: `C:\Users\dhtlr\projects\expresso-integration-20261014`, 브랜치 `codex/local-career-integration-20261014`, HEAD `73d1b58256c43886a41701be368ebb4c9ac3dde0`. 시작/종료 확인에서 `services/web/next-env.d.ts`만 수정 상태입니다. 이 체크아웃에 쓰기 작업을 하지 않았습니다.
- 기존 integration과 main의 커밋 트리 차이: 2,201개 파일, +218,167/-42,846줄. 문서·자료도 포함한 수치이며 제품 변경량과 같지 않습니다.
- [#105](https://github.com/Expresso-Organization/expresso/pull/105): 기본 7개 Category도 가입 트랜잭션에서 사용자마다 생성합니다. `userId` 소유권과 `propertySchemaV2`가 필수이며 `isSystem`/v1 `propertySchema`는 폐기되었습니다. 옵션 이름을 읽는 매칭·자료·면접 텍스트 경로도 보존했습니다.
- [#101](https://github.com/Expresso-Organization/expresso/pull/101): 편집기 v2 기본 활성화와 옛 화면 제거.
- [#137](https://github.com/Expresso-Organization/expresso/pull/137), [#145](https://github.com/Expresso-Organization/expresso/pull/145): BlockNote/native Yjs schema 2, `bodyMd` projection Worker, 기록 이력/복원과 Category 추가.
- [#144](https://github.com/Expresso-Organization/expresso/pull/144): 수식 이름 토큰, 계산값 갱신, 시각 속성 관리. [#130](https://github.com/Expresso-Organization/expresso/pull/130)의 AI 사용량 계측, [#136](https://github.com/Expresso-Organization/expresso/pull/136)의 관리자/더미 계정, [#138](https://github.com/Expresso-Organization/expresso/pull/138)의 지면 편집 기능도 유지했습니다.
- 위 PR들의 merge SHA가 기준 main의 조상임을 Git으로 확인했습니다. 문서 중 아직 MySQL/과거 화면을 설명하는 부분은 현재 코드 사실로 사용하지 않았습니다.

근거: `services/backend/src/modules/identity/service.ts`, `packages/database/src/career-category-templates.ts`, `services/backend/src/modules/career/mongo-categories.ts`, `packages/editor/src/blocknote.ts`, `services/backend/src/modules/career-editor/service.ts`, `services/backend/src/worker/processors/career-document-projection.ts`.

## 2. PR별 상태와 적용 범위

GitHub 조회 시 여섯 PR 모두 open, merged=false입니다. 아래 base SHA는 GitHub가 응답한 PR metadata이며, 최신 main SHA와 혼동하지 않습니다.

| PR | base SHA | head SHA | 실제 단계 범위 |
|---|---|---|---|
| [#71 A](https://github.com/Expresso-Organization/expresso/pull/71) | d7753704 | a4fd284d | Spring scaffold, 업무 aggregate/DTO, Canonical 값 계약 |
| [#72 B1](https://github.com/Expresso-Organization/expresso/pull/72) | a4fd284d | c5e31122 | 인증, ETag/CAS, 멱등 receipt, transaction/outbox, core writer |
| [#73 C](https://github.com/Expresso-Organization/expresso/pull/73) | c5e31122 | 84f08228 | Property mutation 소유권·복구·값 보존 (2 commits) |
| [#74 D](https://github.com/Expresso-Organization/expresso/pull/74) | 84f08228 | 184f4dfc | AI/Interview prepared coordination |
| [#75 E](https://github.com/Expresso-Organization/expresso/pull/75) | 184f4dfc | 46827cf5 | Spring 운영 profile, readiness, 배포/rollback 준비 파일 |
| [#76 B2](https://github.com/Expresso-Organization/expresso/pull/76) | 46827cf5 | b23894e2 | 제품 facade/BFF/Worker 연결, Canonical 읽기, 제목/재연결 보정 (3 commits) |

`merge-base(main, B2)=d7753704`. A~E head 모두 B2의 조상입니다. main 대비 스택의 9개 커밋은 `git cherry`에서 모두 `+`였으며 동일 커밋/patch로 반영되지 않았습니다. 소유화·본문 projection·복원처럼 main의 다른 구현이 대체한 의미상 중복은 별도로 정리했습니다.

최신 main에서 `git merge --no-commit --no-ff pr/76`을 한 번 사용했습니다. 6개 PR을 차례로 cherry-pick하지 않았습니다. 충돌 해결 후 `git merge --quit`으로 병합 작업 metadata만 종료했고, 결과 파일과 index는 미커밋 상태로 보존했습니다. HEAD는 계속 기준 main입니다.

## 3. 충돌과 코드 보정

- 텍스트 충돌 38개를 기능별로 해결했습니다. main의 serial dist build/test 순서, 이메일/세션/사용량/관리자/포트폴리오 기능을 유지했습니다.
- Spring의 공용/null Category 조회, `isSystem:false` fence, v1 fallback을 소유자+V2 조건으로 바꿨습니다. 현재 세션의 sliding/absolute expiry와 관리자 대신 로그인도 확인했습니다.
- Fastify는 document/Yjs와 schema metadata, Spring은 업무 값/Record command를 소유합니다. business 실패를 직접 Mongo 쓰기로 우회하지 않습니다. 관리자 더미 생성도 별도의 내부 service adapter를 통해 기존 prepared service credential 경로를 사용합니다.
- main에서 삭제한 v1 `/views`와 일괄 `property-schema` API를 되살리지 않았습니다. 사용자 소유 기본 Category의 속성 변경, 옵션 추가/이름 변경, 기존 옵션 ID 삭제 차단, 시각 속성의 metadata 변경/값 보호를 유지했습니다.
- `propertyValues`가 Canonical 정본이고 `properties`는 typed 호환 projection입니다. 정확한 decimal/date 값은 Canonical 계약을 따릅니다. 매칭·자료·면접 텍스트에서는 타입 봉투와 파일 ID가 검색어에 섞이지 않게 읽기 계약을 맞췄습니다.
- 새 prepared 문서도 schema 2로 생성합니다. 적용/Undo, compaction/late client/replay는 native Yjs 상태를 사용합니다. 독립 검토에서 발견한 리치 서식·미디어·콜아웃 손실에 대해 회귀 테스트와 native 원본 보존 보정을 추가했습니다.
- 실제 기본 Category와 레코드 fixture를 소유자/V2/Canonical 상태로 맞췄습니다. Mongo test DB 이름은 63바이트 제한을 지키도록 수정했습니다.
- Fastify readiness는 URI에 지정된 replica set을 검증합니다. 기본 `rs0` 동작은 유지하며 이번 별도 `careerTest` 인스턴스도 정상 판정합니다.
- main과 동일한 AI CLI 테스트가 Windows에서 shebang fixture를 실행하지 못해 13건 실패했습니다. 테스트용 가짜 CLI만 Node로 실행하도록 하네스를 보정해 33/33을 확인했습니다. 제품 AI 코드와 검증은 바꾸지 않았고 실제 유료 호출은 하지 않았습니다.
- Canonical View가 각 Record마다 동일한 schema/option/mutation 상태를 읽던 경로는 한 요청의 전체 read state를 공유하도록 바꿨습니다. 소유자·Category 경계를 검사하며 관계 및 문서 snapshot 읽기는 유지합니다. 100 Record View p95가 311/352ms로 기존 300ms 예산을 초과한 것을 먼저 확인했고, 보정 후 158ms를 측정했습니다.

주요 근거: `services/backend-spring/src/main/java/com/expresso/backend/career/infrastructure/mongo/`, `services/backend/src/modules/career/product-facade.ts`, `services/backend/src/platform/career-writer-runtime.ts`, `services/backend/src/modules/career/canonical-property-schema.ts`, `services/backend/src/modules/career/canonical-reads.ts`, `services/backend/src/modules/career-editor/prepared-document-writer.ts`.

### Migration 안전성

main의 19개 기존 migration 번호·내용·체크섬을 보존했습니다. PR 원본 입력 파일도 보존하고, 로컬 후보 실행은 main 이후로 옮겼습니다.

| 로컬 후보 | PR의 원본 역할 |
|---|---|
| 0025 | 0014 business writer 준비 |
| 0026 | 0015 property mutation 준비 |
| 0027 | 0016 producer 준비 |
| 0028 | PR 0017 Canonical 준비 (main 0017 소유화와 분리) |
| 0029 | 0018 relation mutation 준비 |
| 0030 | 0019 product owner 준비 |

기존 PR 번호 체계나 알 수 없는 checksum이 ledger에 있으면 lease/checkpoint/DDL 이전에 `MIGRATION_HISTORY_CONFLICT`로 중단합니다. 운영에서 PR migration이 적용되지 않았다고 가정하지 않습니다. Windows LF 바이트와 staged Git blob, source/dist checksum의 일치도 확인했습니다.

신규 DB와 기존 main fixture 업그레이드를 별도로 검증했습니다. 최종 `_lf` fixture에서 원래 존재한 87개 비-lock collection의 문서 해시, 기존 19개 ledger row, 사용자 소유 Category 15개와 대표 기록 1개를 대조했습니다. 허용된 변화는 누락된 Canonical 필드 추가이며, 반복 실행은 applied=[]였습니다. 부분 실패/checkpoint/명시적 lease 복구 테스트도 실행했습니다.

근거: `packages/database/src/mongo-migrate.ts`, `packages/database/src/migrations.test.ts`, `packages/database/src/main-upgrade.integration.test.ts`, `packages/database/scripts/verify-main-upgrade.mjs`. 원본 증거는 작업 폴더의 `main-upgrade-verification-final-lf.json`에 있습니다.

## 4. 실제 검증 결과

| 검증 | 결과 |
|---|---|
| 통합 전 main 공유 package build / root typecheck | PASS |
| 통합 전 main Career/editor/computation/identity | 144 PASS, 11 조건부 SKIP |
| 통합 전 main DB | 23 PASS |
| 통합 전 main 단독 성능 | 1 PASS |
| 통합 후 root typecheck | PASS |
| 통합 후 root pnpm test | 1,496 PASS, 0 FAIL, 775 조건부 SKIP |
| root 세부 | editor 64 / contracts 186 / database 56 / renderer 66 / backend 613 / web 511 |
| 실제 DB suite | 105 PASS, 최종 LF/checksum/업그레이드 후속 검사 PASS |
| Spring | 263개 고유 테스트 통과 증거 확보: 전체 실행 261 PASS·2 FAIL·0 SKIP 후 두 실제 HTTP probe를 보정해 각각 PASS, assemble PASS |
| Canonical facade / view / owned options / admin | 별도 Mongo 회귀 실행 PASS; 자세한 수치는 부모 폴더 로그 |
| native 문서 | 최종 5 files / 44 PASS; 표·inline 서식·media·callout·Undo·재접속 회귀 포함 |
| 실제 HTTP/BFF | 최종 13/13 PASS, readiness 200; Spring/Fastify/Worker/Web 실제 실행 |
| 실제 WebSocket 두 편집기 | 동일 prepared 변경이 재접속 없이 양쪽 도달 PASS |
| 실제 Chrome | 패널·제목 저장·Yjs 자동 저장·reload·offline 재연결 PASS, pageerror 0 |
| 최종 페이지 읽기 회귀 | Canonical read / View / pending mutation 3 files / 26 PASS |
| 최종 backend build / typecheck | PASS |
| 통합 후 단독 성능 | 2/2 PASS, 기존 7개 예산 모두 통과; 아래 측정값 참조 |

조건부 skip을 통과로 계산하지 않았습니다. 전체 root test는 인프라 환경변수를 비운 실행이며, 필요한 관련 인프라 suite와 실제 서비스를 별도로 실행했습니다. 외부 AI 공급자·실제 메일·OAuth 공급자·운영 배포는 검증하지 않았습니다.

실패 분류:

- main/PR 결합: 소유권·v1/schema2 차이, options configure 차단, 리치 native roundtrip, 새 관리자 caller의 bearer 부재, materials `categoryKey` 누락 등을 코드·회귀 테스트로 해결했습니다.
- PR fixture: Canonical 준비 뒤 legacy-only Record 삽입을 `CANONICAL_VALUES_NOT_PREPARED` 409로 재현했습니다. migration과 같은 준비 함수를 fixture에 적용하고 native client 저장을 실제로 검증하도록 바꿨습니다. Canonical 검증/성능 예산을 제거하거나 테스트를 skip하지 않았습니다.
- 성능: fixture 준비 성공 후 실제 View 예산 초과도 별도로 재현했습니다. 요청 단위 읽기 중복을 줄이고 재측정했습니다. 모든 지표를 수집하도록 soft assertion을 쓰지만 예산 초과 시 테스트는 여전히 실패합니다. autosave 최종 검증에는 현재 sequence보다 한 번 앞선 문자열을 만들던 하네스 오류도 수정했습니다.
- 로컬 환경: Windows 가짜 CLI 실행, 별도 replica set readiness, test DB 이름 길이, 실행 플래그 형식을 구분해 처리했습니다.
- 최종 성능 예산 결과는 fixture 예외와 구분하여 아래에 기록합니다.

## 5. 남은 확인과 정책 결정

- 운영 DB·기존 개발 DB는 접근하거나 migration하지 않았습니다. 실제 배포 ledger/checksum, 운영 데이터 분포, canary 이력은 **미확인**입니다. 기존 PR ledger를 발견한 환경의 이력 조정과 배포/rollback 순서는 운영 담당자가 확정해야 합니다.
- `0025–0030`은 검토 가능한 로컬 통합 후보입니다. 이 작업의 통과 결과로 운영 적용을 승인한 것은 아닙니다.
- 기존 공유 Category/v1/Tiptap을 되살리는 제품 정책 선택은 하지 않았습니다. 현재 main의 사용자 소유/V2/BlockNote 방향을 유지했습니다.
- native 리치 구조의 모호한 span 재구성은 서식을 추측해서 쓰지 않고 409로 중단합니다. 이런 변경을 AI 편집에서 지원할 제품 범위와 UI 안내는 추가 결정 대상입니다.
- View의 query compile과 page map은 별도 시점의 read state를 읽습니다. 요청 내부 중복은 줄였지만 동시 schema 변경 전체를 단일 snapshot으로 묶는 보장은 이번 범위에 추가하지 않았습니다.
- 모든 backend 인프라/부하 suite, 전체 브라우저 E2E/모바일 시각 비교, Next production build, 범용 AgentChat→Career 제안 전체 흐름, 외부 AI/메일/OAuth와 운영 네트워크는 실행하지 않았습니다. 검증 범위를 넘어선 통과 주장은 하지 않습니다.

## 6. 위치와 재검증

- worktree: `C:\Users\dhtlr\projects\expresso-main-career-test\integration`
- branch: `codex/career-latest-main-20261029`
- HEAD/base: `b600715d6c9ee4969bcdbcca804ce3c0c32f6567`
- 별도 Git 메타데이터: 부모 폴더 `.source.git`. 기존 저장소의 refs/worktree/환경을 바꾸지 않기 위해 이 작업 폴더에 준비했습니다.
- runtime: Node 24.22.1, pnpm 11.16.0, Java 21.0.4.
- Mongo: 127.0.0.1:57027, replica set `careerTest`, 별도 container `expresso-career-test-20261029-mongo`.
- Redis: 127.0.0.1:56389, 별도 container `expresso-career-test-20261029-redis`.
- 검증 서비스: Spring 8319 / Fastify 4219 / Web 3219 / Worker. AI=off, Career AI deterministic, 예약 작업 비활성.
- 최종 고정 DB: `expresso_test_career_main_upgrade_20261029_lf`, `expresso_test_career_http_20261029`.
- 최초 `_20261029` 업그레이드 fixture는 LF 보정 전 후보의 forensic 증거로 보존했습니다. 그 ledger를 새 checksum으로 덮지 않았으며 최종 서비스는 연결하지 않습니다.
- 테스트별 UUID DB는 테스트 fixture의 정리 경로를 사용했습니다. 기존 local Mongo 57017 / Redis 56379는 변경하지 않았습니다.

worktree에서 PowerShell로 실행합니다. 부모 runner는 테스트 전용 주소만 사용하며 비밀값을 출력하지 않도록 되어 있습니다.

```powershell
& ..\run-pnpm.ps1 recheck-types.log typecheck
$env:CAREER_UNIT_ONLY='1'
& ..\run-pnpm.ps1 recheck-unit.log test --pool=threads --maxWorkers=2
Remove-Item Env:CAREER_UNIT_ONLY
& ..\run-pnpm.ps1 recheck-db.log --filter @expresso/database exec vitest run --pool=threads --maxWorkers=1
# 다른 DB/CPU 테스트가 끝난 뒤 성능만 단독으로 실행합니다.
$env:EXPRESSO_LOAD_TEST='1'
& ..\run-pnpm.ps1 recheck-performance.log --filter @expresso/backend exec vitest run src/modules/career-editor/performance.test.ts --pool=threads --maxWorkers=1
Remove-Item Env:EXPRESSO_LOAD_TEST
```

부모 폴더 `start-local.ps1`, `http-validation.mjs`, `ws-validation.mjs`, `browser-validation.mjs`와 JSON 보고서에 실제 실행 주소·검증 절차가 있습니다. `start-local.ps1`은 포트가 비어 있고 테스트 container가 시작된 상태에서 사용합니다. 이미 실행 중이면 중복 시작하지 않습니다. 테스트용 자격 증명과 메일 로그 원문을 콘솔에 출력하지 않습니다.

Spring 재검증 시 `B1_TEST_MONGO_URL`을 위의 57027/careerTest 주소에, `B1_TEST_NODE`를 Node 24 실행 파일에 설정한 뒤 `services/backend-spring`에서 `./gradlew.bat test assemble`을 실행합니다. 테스트는 자체 UUID DB를 사용합니다. Node 기본 PATH가 옛 버전이면 실제 HTTP probe가 잘못 실패하므로 반드시 지정합니다.

## 검증 종료 기록

최종 성능 실행: 2026-10-29 16:46:59 KST, warmup + 각 30 samples, 다른 테스트와 동시 실행하지 않았습니다. 아래는 한 로컬 PC에서 측정한 값이며 운영 성능 보장은 아닙니다.

| 지표 | 적용 분위수 | 측정 ms | 기존 예산 ms |
|---|---|---:|---:|
| bootstrap 200KB | p95 | 36.14 | 300 |
| keystroke | p95 | 0.21 | 50 |
| side peek first editable | p75 | 33.78 | 1,500 |
| View 100 records | p95 | 158.32 | 300 |
| relation/rollup 100 | p95 | 25.07 | 1,000 |
| snapshot restore 1MB | p95 | 1.40 | 2,000 |
| autosave ack | p95 | 74.87 | 500 |

원본 수치: 부모 폴더 `performance-optimized.json`. 보정 전 실패는 `performance-final.json`과 `performance-all-budgets.json`에 남겼습니다. 최종 HTTP는 `http-validation.json`의 13 PASS / 0 FAIL, 실제 Chrome은 `browser-validation.json`과 `browser-career.png`, WebSocket은 `ws-validation.json`에 기록했습니다. root 검증 이후 추가한 최종 읽기 보정은 26개 관련 인프라 회귀, build/typecheck 및 단독 성능으로 검증했고 root 전체를 다시 실행하지 않았습니다.

검토 편의를 위해 이번 격리 서비스는 실행 상태로 남겼습니다. 최종 확인: Web 3219(PID 51408), Fastify 4219(PID 43128), Spring 8319(PID 47240), Worker PID 49836. Mongo 57027/Redis 56389는 위 별도 container입니다. API/Worker는 이번에 시작한 프로세스만 교체했으며 기존 프로세스는 종료하지 않았습니다. CPU 부하 테스트 프로세스는 종료되었습니다. 테스트 DB와 볼륨을 삭제하지 않았습니다.

기존 비교 환경은 마지막 확인에서도 HEAD `73d1b582`와 수정 파일 1개가 같았습니다. 그 `services/web/next-env.d.ts`의 SHA256은 `463F6368C4C86ED93DA4A040E818C400169086EB97B77586316FDBAADA3714FE`로 일치합니다. 새 worktree HEAD는 기준 main이며 통합 결과 전체를 미커밋 상태로 남깁니다.

검토 위치: `canonical-reads.ts:128`(요청 단위 읽기), `prepared-document-writer.ts:44`(native 내용 보존), `mongo-migrate.ts:38`(ledger 사전 차단), `performance.test.ts:24`(기존 예산), `platform/mongodb.ts:33`(설정된 replica set).
