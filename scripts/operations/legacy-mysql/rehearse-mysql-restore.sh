#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 BACKUP.dump" >&2
  exit 64
fi

repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
backup_path="$1"
# 서버에서 돌릴 때는 compose 파일을 넘긴다 — 통 이름이 다르다.
compose_file="${EXPRESSO_COMPOSE_FILE:-$repo_root/infra/compose.yaml}"
restore_database="expresso_restore_rehearsal"

test -s "$backup_path"

mysql_root() {
  docker compose -f "$compose_file" exec -T mysql \
    mysql --user=root --password="${EXPRESSO_MYSQL_PASSWORD:-expresso}" "$@"
}

cleanup() {
  mysql_root --execute="drop database if exists \`$restore_database\`;" >/dev/null
}
trap cleanup EXIT

cleanup
mysql_root --execute="create database \`$restore_database\` character set utf8mb4 collate utf8mb4_bin;" >/dev/null
mysql_root "$restore_database" < "$backup_path"

# 배포 스냅샷은 하나가 커서 group_concat 기본 한도(1KB)를 그대로 넘는다. 줄마다
# 먼저 md5 를 내고 그 값들을 잇는다 — 한도도 함께 올린다.
verification_sql="set session group_concat_max_len = 16777216;
select concat_ws('|',
  (select count(*) from schema_migration),
  (select count(*) from \`user\`),
  (select count(*) from record),
  (select count(*) from deployment),
  (select coalesce(md5(group_concat(row_hash order by row_id separator ',')), '')
     from (select id as row_id, md5(concat(id, ':', cast(snapshot as char))) as row_hash
             from deployment) as hashed));"

source_fingerprint="$(mysql_root expresso --batch --skip-column-names --execute="$verification_sql")"
restore_fingerprint="$(mysql_root "$restore_database" --batch --skip-column-names --execute="$verification_sql")"

if [[ "$source_fingerprint" != "$restore_fingerprint" ]]; then
  echo "restore fingerprint mismatch" >&2
  echo "source=$source_fingerprint" >&2
  echo "restored=$restore_fingerprint" >&2
  exit 1
fi

echo "source=$source_fingerprint"
echo "restored=$restore_fingerprint"
echo "restore_rehearsal=PASS"

