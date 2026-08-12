# G06 전체 회귀·단계 배포 출시 게이트

- 상태: verified
- 일자: 2026-08-09 (Asia/Seoul)
- 체크리스트: M7-05, M7-06
- 미해결 P0/P1: 0

## 동일 checkout 전체 회귀

| 계층 | 결과 |
|---|---|
| contracts | PASS — 1 file, 13 tests |
| database/migrations PGlite | PASS — 2 files, 11 tests |
| backend unit/integration/E2E/security/load/resilience | PASS — 40 files, 86 tests |
| 전체 | PASS — 43 files, 110 tests |
| typecheck | PASS — contracts/database/backend |
| build | PASS — contracts/database/backend |
| whitespace | `git diff --check` PASS |

fresh environment release smoke는 migration 0001–0020, system category 7, active template 3, schedule definition 6, PostgreSQL/Redis readiness, pristine dead-letter/failed/quota-ledger audit가 통과했다.

## staging rollout/rollback

격리 `expresso_staging_rehearsal` DB와 queue prefix에서 compiled artifact를 실행했다.

```text
migration_count=20
scheduled_succeeded=6
dead_letter=0
scheduled_failed=0
rollback_snapshot=version one
staged_rollout_rehearsal=PASS
```

API/Worker를 새 artifact로 시작해 readiness와 queue drain을 확인한 뒤 보존한 pre-deploy artifact로 재시작했다. portfolio current deployment pointer를 version 1로 되돌리자 public version 1 snapshot이 복구되고 version 2 주소는 404가 됐다.

## 최종 증거 감사

- 체크리스트 ID: 50/50 complete
- DAG mapping: 50/50 unique mapping
- task: 27/27 verified
- evidence 누락: 0
- pipeline complete validator: PASS
- 사용자 소유 dev-portal/web 변경: 보존, 백엔드 작업과 혼합 수정 없음

