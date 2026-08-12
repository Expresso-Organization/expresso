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

cleanup() {
  docker compose -f "$compose_file" exec -T postgres \
    psql --username=expresso --dbname=postgres --set=ON_ERROR_STOP=1 \
    --command="drop database if exists $restore_database with (force);" >/dev/null
}
trap cleanup EXIT

cleanup
docker compose -f "$compose_file" exec -T postgres \
  psql --username=expresso --dbname=postgres --set=ON_ERROR_STOP=1 \
  --command="create database $restore_database;" >/dev/null
docker compose -f "$compose_file" exec -T postgres \
  pg_restore --username=expresso --dbname="$restore_database" --no-owner --no-acl --exit-on-error \
  < "$backup_path"

verification_sql="select
  (select count(*) from schema_migration),
  (select count(*) from \"user\"),
  (select count(*) from record),
  (select count(*) from deployment),
  (select md5(coalesce(string_agg(id::text || ':' || snapshot::text, ',' order by id), '')) from deployment);"

source_fingerprint="$(docker compose -f "$compose_file" exec -T postgres psql --username=expresso --dbname=expresso --tuples-only --no-align --field-separator='|' --command="$verification_sql")"
restore_fingerprint="$(docker compose -f "$compose_file" exec -T postgres psql --username=expresso --dbname="$restore_database" --tuples-only --no-align --field-separator='|' --command="$verification_sql")"

if [[ "$source_fingerprint" != "$restore_fingerprint" ]]; then
  echo "restore fingerprint mismatch" >&2
  echo "source=$source_fingerprint" >&2
  echo "restored=$restore_fingerprint" >&2
  exit 1
fi

echo "source=$source_fingerprint"
echo "restored=$restore_fingerprint"
echo "restore_rehearsal=PASS"

