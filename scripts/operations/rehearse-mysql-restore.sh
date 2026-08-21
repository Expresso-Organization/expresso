#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 BACKUP.dump" >&2
  exit 64
fi

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
backup_path="$1"
compose_file="$repo_root/infra/compose.yaml"
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

verification_sql="select
  (select count(*) from schema_migration),
  (select count(*) from \"user\"),
  (select count(*) from record),
  (select count(*) from deployment),
  (select md5(coalesce(string_agg(id::text || ':' || snapshot::text, ',' order by id), '')) from deployment);"

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

