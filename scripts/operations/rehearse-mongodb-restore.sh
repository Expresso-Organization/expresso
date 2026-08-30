#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: MONGODB_TOOLS_CONFIG=/secure/restore-tools.yml MONGODB_RESTORE_URL=... $0 /backup-dir" >&2
  exit 2
fi
backup_dir="$(realpath "$1")"
config_path="${MONGODB_TOOLS_CONFIG:?set restore-only MONGODB_TOOLS_CONFIG}"
source_database="${MONGODB_SOURCE_DATABASE:-expresso}"
target_database="${MONGODB_RESTORE_DATABASE:-expresso_restore_rehearsal}"
source_host="${MONGODB_SOURCE_HOST:-127.0.0.1}"
source_port="${MONGODB_SOURCE_PORT:-57017}"
target_host="${MONGODB_RESTORE_HOST:?set MONGODB_RESTORE_HOST}"
target_port="${MONGODB_RESTORE_PORT:?set MONGODB_RESTORE_PORT}"
restore_url="${MONGODB_RESTORE_URL:?set MONGODB_RESTORE_URL for post-restore verification}"

test -s "$backup_dir/mongodb.archive"
test -s "$backup_dir/SHA256SUMS"
test -f "$config_path"
(cd "$backup_dir" && sha256sum --check SHA256SUMS)
if [[ "$source_host:$source_port" == "$target_host:$target_port" ]]; then
  echo "복원 대상은 원본과 다른 hostname 또는 port의 별도 인스턴스여야 합니다." >&2
  exit 2
fi
if [[ "$target_database" == "$source_database" || ! "$target_database" =~ (restore|rehearsal) ]]; then
  echo "복원 DB 이름은 원본과 달라야 하며 restore 또는 rehearsal을 포함해야 합니다." >&2
  exit 2
fi

tools_image="mongo:8.0@sha256:02a0cc7939f5ed38f30f9bc714ef5f682d49baf9350c54acf302ce833087fe8a"
docker run --rm --network host \
  --mount "type=bind,src=$(realpath "$config_path"),dst=/run/mongodb-tools.yml,readonly" \
  --mount "type=bind,src=$backup_dir/mongodb.archive,dst=/run/mongodb.archive,readonly" \
  "$tools_image" mongorestore --config=/run/mongodb-tools.yml --archive=/run/mongodb.archive \
  --nsInclude="$source_database.*" --nsFrom="$source_database.*" --nsTo="$target_database.*" --drop

MONGODB_RESTORE_URL="$restore_url" MONGODB_RESTORE_DATABASE="$target_database" \
  node scripts/operations/verify-mongodb-restore.mjs "$backup_dir/restore-report.json"
echo "restore_target=$target_host:$target_port/$target_database"
echo "restore_rehearsal=PASS"
