#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 OUTPUT.dump" >&2
  exit 64
fi

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
output_path="$1"
compose_file="$repo_root/infra/compose.yaml"

mkdir -p "$(dirname "$output_path")"
docker compose -f "$compose_file" exec -T postgres \
  pg_dump --username=expresso --dbname=expresso --format=custom --no-owner --no-acl \
  > "$output_path"
test -s "$output_path"
echo "backup_path=$output_path"

