# 커리어 편집기 v2 출시 후보 체크리스트

검증 기준 브랜치는 `codex/career-record-editor`다. 이 문서는 병합 승인 자료이며
운영 기능 플래그를 켜는 승인 자료와 분리한다. 검증일은 2026-09-01(KST)이다.

## 출시 상태

| 항목 | 값 |
| --- | --- |
| `CAREER_EDITOR_V2_ENABLED` 기본값 | `false` |
| `CAREER_AI_DETERMINISTIC_TEST` 기본값 | `false` |
| production deterministic AI | runtime config가 기동을 거절 |
| 기존 화면·API | 플래그 `false` E2E 통과 |
| 새 화면·REST·WebSocket | 플래그 `true` E2E 통과 |
| `main` 병합 | 승인 전, 실행 금지 |
| 운영 플래그 활성화 | 배포 health 확인 뒤 별도 승인 전, 실행 금지 |

## 전체 게이트

| 순서 | 명령 | 결과 | 실제 시간 |
| ---: | --- | --- | ---: |
| 1 | `pnpm install --frozen-lockfile` | 통과, lockfile 변경 없음 | 0.52초 |
| 2 | `pnpm typecheck` | 5개 workspace 통과 | 2.75초 |
| 3 | `pnpm test` | editor 55, contracts 60, database 6, web 170, backend 304 통과 | 13.71초 |
| 4 | `pnpm infra:up` | MongoDB rs0·Redis healthy | 2.52초 |
| 5a | `MONGODB_MIGRATE_URL=... MONGODB_DATABASE=expresso_career_gate_20260901 pnpm db:migrate` | 빈 DB에 0001–0008 통과 | 3.17초 |
| 5b | `MONGODB_MIGRATE_URL=... MONGODB_DATABASE=expresso_career_migration_clone_20260901 pnpm db:migrate` | 개발 데이터 복제본에 0001–0008 통과. 실행 잠금 행은 복제 대상에서 제외 | 6.53초 |
| 6 | `pnpm test:infra` | 실제 MongoDB/Redis 39 files, 199 tests 통과 | 54.80초 |
| 7 | `pnpm --filter @expresso/web exec playwright test` | Chromium 4개 시나리오 통과 | 30.74초 |
| 8 | `pnpm build` | editor/contracts/database/backend와 Next production build 통과 | 6.51초 |
| 9 | `node scripts/operations/backfill-career-documents.mjs --dry-run` | 아래 결과와 동일, 쓰기 0 | 0.20초 |
| 10 | 같은 dry-run 재실행 | 결과 동일, 쓰기 0 | 0.18초 |
| 11 | `node scripts/operations/verify-career-editor-restore.mjs /tmp/career-editor-restore-report.json --restore-copy` | 별도 rs0 DB 복원·projection 재구축·체크섬 통과 | 0.36초 |
| 12 | `EXPRESSO_LOAD_TEST=1 ... vitest run src/modules/career-editor/performance.test.ts --maxWorkers=1` | 7개 예산 통과 | 6.83초 |

로컬 `services/backend/.env`는 저장소에 두지 않는다. 위 migration·backfill·restore
명령의 `...`에는 로컬 compose의 admin 또는 migration URL을 환경 변수로 전달했다.
개발 DB에는 통합 전 브랜치가 커리어 migration을 `0005`로 실행한 이력이 있어 최신
`main`의 공고 출처 `0005`와 충돌한다. 그 이력을 수정하지 않았다. 통합 뒤 커리어
원장은 `0006`, 저장 뷰는 `0008`로 확정했고 빈 DB와 개발 데이터 복제본에서 최종
migration을 검증한다.

### backfill dry-run

두 실행 모두 다음 JSON과 일치했다.

```json
{"mode":"dry-run","scanned":47,"eligible":17,"migrated":17,"skipped":30,"mismatches":[],"writes":0}
```

운영 실행 전에는 운영 백업 복제본에서 같은 명령을 두 번 실행하고 `mismatches=[]`,
두 보고서 동일, `writes=0`을 다시 확인한다. 실제 `--apply`는 운영 활성화 승인에
포함하지 않으며 별도 데이터 변경 승인을 받는다.

## 복원 리허설

원본은 Playwright가 만든 격리 DB `expresso_career_editor_e2e_89999`, 대상은
`expresso_career_editor_restore_20260901`이었다. 원본에는 문서 편집, AI revision,
관계, 다섯 저장 뷰, 수식과 롤업 결과가 들어 있다. 검사기는 대상 DB 이름에
`restore`가 포함되고 `MONGODB_RESTORE_ALLOW_REPLACE=1`일 때만 복사한다.

| 컬렉션 | 건수 | SHA-256 |
| --- | ---: | --- |
| `career_categories` | 8 | `a212ec988144d4e9aae05a77fb2247d6d479150adf46caf0b3642bc36218a8a5` |
| `career_records` | 4 | `6d0ec92cd76e0669687ebabb3ab3cc7b342f5d5cef585ad525d976772fe93f77` |
| `career_document_snapshots` | 6 | `57df80f9df5eaca3dc09178fa8301cf430f2f39ac818cceccc524efc5a41c2ef` |
| `career_document_updates` | 19 | `af9531b5a711422b57e964d9cfba364f4ca3b4c7d039d4d01d00180a0977a3d7` |
| `career_record_revisions` | 2 | `a2c16995dad714606097d4bd1f23d0bd66a733bf9a446c87898372ec71040f8a` |
| `career_record_relations` | 1 | `4b62dea88a7e0fb20e3342b7d799fdbdc53f564e7f1013f36c8f9cd96709e6df` |
| `career_views` | 5 | `4f46edd7a7898ac9f4417abe819a0717e51afd5cdf78094236e7cc5d9a645b53` |
| `career_ai_proposals` | 1 | `d12bc1dd916cd78d8f75e472e7235ec453512378df5b201cd6d6733f8e28ccb1` |

소유자·카테고리별 기록 집계는 3행,
`0e3fdf942de54ed412d2ec8a86a60cb33a43fba428e414559fe200786d4acd14`였다.
계산 projection 4행의 체크섬은
`d56049b7766f131b86977c97b087e526742eabf2a229d032adbd491c6afc5a6e`였고,
수식·롤업이 있는 기록 2건을 비운 뒤 재계산해 불일치 0건을 확인했다.

## 성능

고정 fixture를 한 번 예열하고 30회 측정했다. 단위는 ms다.

| 항목 | p50 | p75 | p95 | 판정 기준 |
| --- | ---: | ---: | ---: | --- |
| 200KB bootstrap | 9.77 | 11.06 | 14.78 | p95 ≤ 300 |
| 키 입력 계산 | 0.03 | 0.03 | 0.04 | p95 ≤ 50 |
| side peek 첫 편집 가능 | 9.49 | 10.84 | 15.31 | p75 ≤ 1,500 |
| 100개 기록 뷰 | 2.96 | 3.20 | 3.55 | p95 ≤ 300 |
| 관계 롤업 100건 | 6.01 | 6.37 | 7.80 | p95 ≤ 1,000 |
| 1MB snapshot 복원 | 0.52 | 0.62 | 0.97 | p95 ≤ 2,000 |
| autosave ack | 50.45 | 66.15 | 76.33 | p95 ≤ 500 |

## 브라우저·화면 정의서

- 기록 생성, 모든 블록, 제목·본문 저장, reload, offline 입력과 reconnect를 확인했다.
- 16개 property family, 수식 값 3, 관계 롤업 값 2, 관계 대상 hydration을 확인했다.
- table/list/gallery/board/timeline 저장 뷰 5개를 확인했다.
- AI preview, 선택 적용, undo 확인, side peek와 full-page를 확인했다.
- slash menu를 키보드로 열고 닫은 뒤 편집기 focus가 복원되는지 확인했다.
- 기본 카테고리 이동 preview와 commit, 본문·관계 보존 안내를 확인했다.
- 375/768/1280/1440px에서 편집기가 로드된 뒤 스크린샷을 비교하고 가로 overflow 0을 확인했다.
- `CAREER_EDITOR_V2_ENABLED=false`에서 기존 목록이 열리고 v2 문서 API가 404인지 확인했다.

기준 이미지는 `services/web/e2e/career-editor.visual.spec.ts-snapshots/`에 있다.

## 보안·출처 검사

- 브라우저에는 `httpOnly` `ex_session`만 있으며 editor session token은 메모리와 첫
  WebSocket sync frame에만 존재한다. `localStorage`·`sessionStorage` 사용은 0건이다.
- cross-user 문서, WebSocket, AI proposal, 관계 조회·쓰기는 실제 MongoDB 테스트에서
  `404` 또는 인증 오류로 끝났다.
- REST update와 WebSocket update는 base64 계약과 decode 뒤 1MB 제한을 모두 적용한다.
- 문서 update 10,000건, relation 대상 1,000건, rollup fanout 10,000건, category 100개,
  저장 뷰 20개, property preview scan 10,000건으로 Mongo 조회 상한을 고정했다.
- `packages/editor/src/formula`에서 `eval`, `Function`, 동적 module 실행 경로는 0건이다.
- SynapseNote 참고 구현의 모든 목적지는
  `docs/architecture/career-editor-source-provenance.md`에 기록되어 있으며 원본 코드와
  fixture를 복사하지 않고 Expresso 계약으로 다시 작성했다.

## 배포 관찰

배포 직후 아래를 5분 간격으로 확인한다. 값이 증가하면 플래그 활성화를 중단한다.

```javascript
db.outbox_events.countDocuments({topic: "career.computation", state: {$in: ["pending", "dead_letter"]}})
db.career_document_updates.countDocuments({compactedAt: null})
db.career_ai_proposals.aggregate([{$group:{_id:"$status",count:{$sum:1}}}])
db.career_records.countDocuments({documentVersion: {$ne: null}, latestSnapshotId: null})
```

함께 확인할 HTTP 항목은 `/health/live=200`, `/health/ready=200`, v2 bootstrap 오류율,
WebSocket `VERSION_CONFLICT`·`SIZE`·재연결 횟수, autosave ack p95, Worker 지연이다.

## rollback

1. 전체 사용자 활성화 전 오류가 발생하면 `CAREER_EDITOR_V2_ENABLED=false`로 배포한다.
2. 새 편집이 발생한 뒤에는 컬렉션과 update를 삭제하지 않는다. 기존 record API가 최신
   JSON 문서를 Markdown으로 projection하는지 확인한 뒤 기존 화면으로 전환한다.
3. `career_document_*`, `career_record_relations`, `career_views`, AI proposal 컬렉션은
   additive 상태로 보존한다. migration을 되돌리거나 `bodyMd`를 덮어쓰지 않는다.
4. outbox와 Worker를 멈춰야 하면 pending 이벤트를 보존하고 lease 종료를 확인한 뒤
   재기동한다. migration lock은 운영자가 실행 프로세스 종료를 확인한 뒤에만 복구한다.
5. 복구 뒤 backfill dry-run과 restore verifier를 다시 실행해 불일치 0건을 확인한다.

## 승인선

- 승인 1: 이 브랜치와 체크리스트를 검토한 뒤 `main` 병합을 명시적으로 승인한다.
- 승인 2: 배포 health와 운영 백업 rehearsal을 확인한 뒤 내부 검증 계정 활성화를
  명시적으로 승인한다.
- 승인 3: 내부 계정 관찰 기간이 끝난 뒤 전체 사용자 활성화를 명시적으로 승인한다.

이번 출시 후보 작업은 브랜치 push에서 멈춘다. 병합, 배포, backfill `--apply`, 운영
플래그 변경을 함께 실행하지 않는다.
