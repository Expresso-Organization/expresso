#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 OUTPUT.sql" >&2
  exit 64
fi

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
output_path="$1"
compose_file="$repo_root/infra/compose.yaml"

mkdir -p "$(dirname "$output_path")"
docker compose -f "$compose_file" exec -T mysql \
  mysqldump --user=expresso --password="${EXPRESSO_MYSQL_PASSWORD:-expresso}" \
  --single-transaction --routines --triggers --set-gtid-purged=OFF expresso \
  > "$output_path"
test -s "$output_path"
echo "backup_path=$output_path"

