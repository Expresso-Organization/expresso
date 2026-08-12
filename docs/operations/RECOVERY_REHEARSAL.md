# 백업·복구 리허설 기록

- 실행일: 2026-08-09
- 원본: Docker Compose `expresso` PostgreSQL 18.4
- 복구 대상: 임시 `expresso_restore_rehearsal` database
- 백업 형식: `pg_dump --format=custom --no-owner --no-acl`

비어 있지 않은 고정 fixture(사용자 1, 기록 1, deployment 1)를 원본에 넣고 백업한 뒤 격리 DB에 `pg_restore --exit-on-error`로 복원했다. 검증 후 fixture와 복구 DB만 제거했으며 원본 volume은 유지했다.

```text
source=20|1|1|1|8dbef496c255ae7bb149a3350d677a09
restored=20|1|1|1|8dbef496c255ae7bb149a3350d677a09
restore_rehearsal=PASS
```

fingerprint 순서는 migration 수, user 수, record 수, deployment 수, 정렬된 deployment snapshot MD5다. 백업 파일은 `/tmp/expresso-nonempty-restore.NrB17w/expresso.dump`에 남겨 두었다.

빈 환경 복구는 fresh DB E2E들이 migration 0001–0020을 매번 처음부터 적용해 검증한다. migration은 expand-only이므로 application rollback 시 DB down-migration 없이 이전 API/Worker를 재배포할 수 있다. 상세 절차는 `docs/operations/BACKUP_AND_RESTORE.md`에 있다.

