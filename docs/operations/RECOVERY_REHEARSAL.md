# 백업·복구 리허설 기록

## 2026-08-21 · MySQL

- 원본: Docker Compose `expresso` MySQL 8.4
- 복구 대상: 임시 `expresso_restore_rehearsal` database
- 백업 형식: `mysqldump --single-transaction --routines --triggers --set-gtid-purged=OFF`

```text
source=9|28|26|3|5dd6459c82f0d11a6a44ef006fcaef2f
restored=9|28|26|3|5dd6459c82f0d11a6a44ef006fcaef2f
restore_rehearsal=PASS
```

fingerprint 순서는 마이그레이션 수, user 수, record 수, deployment 수, 정렬된
deployment snapshot MD5다.

첫 시도는 복원이 멈췄다. 문장 하나짜리 트리거 본문에 세미콜론이 함께 저장되어
있었고, mysqldump 가 그것을 받으면 주석 닫는 자리가 어긋난다. 마이그레이션 0009
가 그 여덟 개를 `begin` · `end` 로 감쌌고, 스키마 테스트가 같은 일이 다시
생기는지 본다.

## 2026-08-09 · PostgreSQL (전환 전)

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

