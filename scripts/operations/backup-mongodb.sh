#!/usr/bin/env bash
set -euo pipefail

if [[ "${EXPRESSO_WRITES_STOPPED:-}" != "1" ]]; then
  echo "EXPRESSO_WRITES_STOPPED=1로 API·Worker·수집·예약 쓰기 중단을 확인해야 합니다." >&2
  exit 2
fi
if [[ $# -ne 1 ]]; then
  echo "usage: MONGODB_TOOLS_CONFIG=/secure/mongodb-tools.yml $0 /approved/off-host/backup-dir" >&2
  exit 2
fi

output_dir="$(realpath -m "$1")"
config_path="${MONGODB_TOOLS_CONFIG:?set MONGODB_TOOLS_CONFIG to a chmod 600 MongoDB Database Tools config}"
compose_file="${EXPRESSO_COMPOSE_FILE:-infra/compose.server.yaml}"
database_name="${MONGODB_DATABASE:-expresso}"
media_dir="${EXPRESSO_MEDIA_DIR:-var/media}"
queue_prefix="${QUEUE_PREFIX:-unknown}"
config_version="${EXPRESSO_CONFIG_VERSION:-unknown}"

test -f "$config_path"
config_mode="$(stat -c '%a' "$config_path")"
if (( (8#$config_mode & 8#077) != 0 )); then
  echo "MONGODB_TOOLS_CONFIG는 다른 사용자가 읽거나 쓸 수 없어야 합니다(chmod 600)." >&2
  exit 2
fi
if [[ -e "$output_dir" ]]; then
  echo "새 백업 디렉터리를 지정해야 합니다: $output_dir" >&2
  exit 2
fi
mkdir -m 700 -p "$output_dir"
temporary_name="/tmp/expresso-mongodump-$$.yml"
cleanup() {
  docker compose -f "$compose_file" exec -T mongodb rm -f "$temporary_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose -f "$compose_file" cp "$config_path" "mongodb:$temporary_name" >/dev/null
docker compose -f "$compose_file" exec -T mongodb chmod 600 "$temporary_name"
docker compose -f "$compose_file" exec -T mongodb \
  mongodump --config="$temporary_name" --db="$database_name" --archive >"$output_dir/mongodb.archive"
test -s "$output_dir/mongodb.archive"

docker compose -f "$compose_file" exec -T redis redis-cli BGSAVE >/dev/null
for attempt in $(seq 1 60); do
  in_progress="$(docker compose -f "$compose_file" exec -T redis redis-cli --raw INFO persistence | tr -d '\r' | sed -n 's/^rdb_bgsave_in_progress://p')"
  [[ "$in_progress" == "0" ]] && break
  if [[ "$attempt" == "60" ]]; then echo "Redis BGSAVE가 60초 안에 끝나지 않았습니다." >&2; exit 1; fi
  sleep 1
done
docker compose -f "$compose_file" cp redis:/data/dump.rdb "$output_dir/redis.rdb" >/dev/null
if [[ -d "$media_dir" ]]; then
  tar -C "$media_dir" -czf "$output_dir/media.tar.gz" .
fi

git_commit="$(git rev-parse HEAD)"
mongo_image="$(docker compose -f "$compose_file" images --format json mongodb | tr -d '\n')"
cat >"$output_dir/metadata.json" <<EOF
{"createdAt":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","gitCommit":"$git_commit","database":"$database_name","queuePrefix":"$queue_prefix","configVersion":"$config_version","mongoImage":$mongo_image,"writesStopped":true}
EOF
(cd "$output_dir" && find . -maxdepth 1 -type f ! -name SHA256SUMS -printf '%f\n' | sort | xargs sha256sum >SHA256SUMS)
chmod -R go-rwx "$output_dir"
echo "backup=$output_dir"
echo "backup_status=PASS"
