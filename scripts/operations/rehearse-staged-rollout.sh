#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"
database_name="${MONGODB_REHEARSAL_DATABASE:-expresso_staging_rehearsal}"
database_url="${MONGODB_REHEARSAL_URL:-mongodb://admin:expresso-admin@127.0.0.1:57017/?authSource=admin&replicaSet=rs0}"
redis_url="${TEST_REDIS_URL:-redis://127.0.0.1:56379}"
queue_prefix="expresso-mongo-rehearsal-$$"
api_port="${EXPRESSO_REHEARSAL_PORT:-4401}"
artifact_dir="$(mktemp -d "${TMPDIR:-/tmp}/expresso-mongo-rollout.XXXXXX")"
api_pid=""
worker_pid=""

if [[ ! "$database_name" =~ (staging|rehearsal) ]]; then
  echo "격리 DB 이름에는 staging 또는 rehearsal이 필요합니다." >&2
  exit 2
fi
cleanup() {
  [[ -z "$api_pid" ]] || kill "$api_pid" >/dev/null 2>&1 || true
  [[ -z "$worker_pid" ]] || kill "$worker_pid" >/dev/null 2>&1 || true
  MONGODB_RESTORE_URL="$database_url" MONGODB_RESTORE_DATABASE="$database_name" \
    node --input-type=module -e 'import {MongoClient} from "mongodb"; const c=new MongoClient(process.env.MONGODB_RESTORE_URL); await c.connect(); await c.db(process.env.MONGODB_RESTORE_DATABASE).dropDatabase(); await c.close();' >/dev/null 2>&1 || true
}
trap cleanup EXIT

pnpm --filter @expresso/contracts build
pnpm --filter @expresso/database build
MONGODB_MIGRATE_URL="$database_url" MONGODB_DATABASE="$database_name" pnpm db:migrate
pnpm --filter @expresso/backend build

common_env=(NODE_ENV=production MONGODB_URL="$database_url" MONGODB_DATABASE="$database_name"
  REDIS_URL="$redis_url" QUEUE_PREFIX="$queue_prefix"
  ASSET_SIGNING_SECRET=staging-rehearsal-signing-secret
  ANALYTICS_VISITOR_SALT=staging-rehearsal-visitor-salt AI_PROVIDER=off)
env "${common_env[@]}" HOST=127.0.0.1 PORT="$api_port" \
  node services/backend/dist/api/main.js >"$artifact_dir/api.log" 2>&1 &
api_pid=$!
env "${common_env[@]}" node services/backend/dist/worker/main.js >"$artifact_dir/worker.log" 2>&1 &
worker_pid=$!

for attempt in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$api_port/health/ready" >/dev/null 2>&1; then break; fi
  if [[ "$attempt" == 30 ]]; then cat "$artifact_dir/api.log" >&2; exit 1; fi
  sleep 1
done
signup_code="$(curl -sS -o "$artifact_dir/signup.json" -w '%{http_code}' \
  -H 'content-type: application/json' \
  --data '{"email":"rehearsal@example.com","displayName":"Rehearsal","password":"correct-horse-battery"}' \
  "http://127.0.0.1:$api_port/v1/auth/signup")"
test "$signup_code" = "201"

MONGODB_RESTORE_URL="$database_url" MONGODB_RESTORE_DATABASE="$database_name" \
  node scripts/operations/verify-mongodb-restore.mjs "$artifact_dir/database-report.json"
echo "queue_prefix=$queue_prefix"
echo "artifacts=$artifact_dir"
echo "staged_rollout_rehearsal=PASS"
