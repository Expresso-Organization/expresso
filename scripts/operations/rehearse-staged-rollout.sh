#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
compose_file="$repo_root/infra/compose.yaml"
staging_database="expresso_staging_rehearsal"
staging_port="44123"
database_url="mysql://expresso:expresso@127.0.0.1:53306/$staging_database"
redis_url="redis://127.0.0.1:56379"
artifact_dir="$(mktemp -d "$repo_root/services/backend/.release-rehearsal.XXXXXX")"
api_pid=""
worker_pid=""

mysql_root() {
  docker compose -f "$compose_file" exec -T mysql \
    mysql --user=root --password="${EXPRESSO_MYSQL_PASSWORD:-expresso}" "$@"
}

mysql_staging() {
  docker compose -f "$compose_file" exec -T mysql \
    mysql --user=root --password="${EXPRESSO_MYSQL_PASSWORD:-expresso}" "$staging_database"
}

mysql_query() {
  docker compose -f "$compose_file" exec -T mysql \
    mysql --user=root --password="${EXPRESSO_MYSQL_PASSWORD:-expresso}" \
      --batch --skip-column-names "$staging_database" --execute="$1"
}

stop_processes() {
  if [[ -n "$api_pid" ]]; then kill "$api_pid" 2>/dev/null || true; wait "$api_pid" 2>/dev/null || true; api_pid=""; fi
  if [[ -n "$worker_pid" ]]; then kill "$worker_pid" 2>/dev/null || true; wait "$worker_pid" 2>/dev/null || true; worker_pid=""; fi
}

cleanup() {
  exit_code=$?
  stop_processes
  if [[ "$exit_code" -ne 0 ]]; then
    test ! -f "$artifact_dir/api.log" || { echo "api_log:" >&2; tail -50 "$artifact_dir/api.log" >&2; }
    test ! -f "$artifact_dir/worker.log" || { echo "worker_log:" >&2; tail -50 "$artifact_dir/worker.log" >&2; }
  fi
  mysql_root --execute="drop database if exists \`$staging_database\`;" >/dev/null
  if [[ "$artifact_dir" == "$repo_root/services/backend/.release-rehearsal."* ]]; then rm -rf "$artifact_dir"; fi
}
trap cleanup EXIT

mysql_root --execute="drop database if exists \`$staging_database\`;" >/dev/null
mysql_root --execute="create database \`$staging_database\` character set utf8mb4 collate utf8mb4_bin;" >/dev/null

cd "$repo_root"
pnpm build >/dev/null
cp -R services/backend/dist "$artifact_dir/dist"
DATABASE_URL="$database_url" pnpm --filter @expresso/database migrate >/dev/null

mysql_staging <<'SEED' >/dev/null
set @user_id = uuid();
set @company_id = uuid();
set @posting_id = uuid();
set @analysis_id = uuid();
set @brew_id = uuid();
set @portfolio_id = uuid();
set @deployment_one = uuid();
set @deployment_two = uuid();
insert into `user` (id, email, display_name, plan_id)
  select @user_id, 'staging@expresso.local', 'Staging', id from plan where code = 'pro';
insert into company (id, name, dedupe_key) values (@company_id, 'Staging', 'staging-rehearsal');
insert into job_posting (id, company_id, source, title, description_raw, requirements, dedupe_hash)
  values (@posting_id, @company_id, 'user_input', 'Staging', repeat('s', 250), '{}', 'staging-rehearsal');
insert into job_analysis (id, user_id, job_posting_id, input_type, status)
  values (@analysis_id, @user_id, @posting_id, 'paste', 'done');
insert into brew (id, user_id, job_analysis_id, length_preset, status)
  values (@brew_id, @user_id, @analysis_id, 'single', 'done');
insert into portfolio (id, user_id, brew_id, template_id, title)
  select @portfolio_id, @user_id, @brew_id, id, 'Staging portfolio' from template where code = 'clarity';
insert into deployment (id, user_id, portfolio_id, version, subdomain, published_at, snapshot)
  values (@deployment_one, @user_id, @portfolio_id, 1, 'staging-v1', now(6), '{"text":"version one"}');
insert into deployment (id, user_id, portfolio_id, version, subdomain, published_at, snapshot)
  values (@deployment_two, @user_id, @portfolio_id, 2, 'staging-v2', now(6), '{"text":"version two"}');
update portfolio set current_deployment_id = @deployment_two, status = 'published' where id = @portfolio_id;
SEED

start_pair() {
  local api_entry="$1"
  local worker_entry="$2"
  env NODE_ENV=production HOST=127.0.0.1 PORT="$staging_port" DATABASE_URL="$database_url" REDIS_URL="$redis_url" QUEUE_PREFIX=expresso-staging-rehearsal ASSET_SIGNING_SECRET=staging-rehearsal-signing-secret ANALYTICS_VISITOR_SALT=staging-rehearsal-visitor-salt node "$api_entry" >"$artifact_dir/api.log" 2>&1 & api_pid=$!
  env NODE_ENV=production DATABASE_URL="$database_url" REDIS_URL="$redis_url" QUEUE_PREFIX=expresso-staging-rehearsal ASSET_SIGNING_SECRET=staging-rehearsal-signing-secret ANALYTICS_VISITOR_SALT=staging-rehearsal-visitor-salt node "$worker_entry" >"$artifact_dir/worker.log" 2>&1 & worker_pid=$!
  for _ in $(seq 1 100); do
    if curl --fail --silent "http://127.0.0.1:$staging_port/health/ready" >/dev/null; then return; fi
    sleep 0.1
  done
  echo "staging readiness timeout" >&2
  exit 1
}

start_pair "$repo_root/services/backend/dist/api/main.js" "$repo_root/services/backend/dist/worker/main.js"
# 정기 작업이 몇 개인지는 스키마가 안다 — 여기에 다시 적으면 하나 늘 때마다
# 이 줄이 조용히 어긋난다.
expected="$(mysql_query "select count(*) from scheduled_job_definition;")"
for _ in $(seq 1 100); do
  completed="$(mysql_query "select count(*) from scheduled_job_run where status='succeeded';")"
  if [[ "$completed" -eq "$expected" ]]; then break; fi
  sleep 0.1
done
test "$completed" -eq "$expected"
dead_count="$(mysql_query "select count(*) from platform_outbox where state='dead_letter';")"
failed_count="$(mysql_query "select count(*) from scheduled_job_run where status='failed';")"
test "$dead_count" -eq 0
test "$failed_count" -eq 0
curl --fail --silent "http://127.0.0.1:$staging_port/v1/public/portfolios/staging-v2" | grep -q 'version two'

stop_processes
start_pair "$artifact_dir/dist/api/main.js" "$artifact_dir/dist/worker/main.js"
mysql_query "update portfolio set current_deployment_id = (select id from (select id from deployment where subdomain='staging-v1') as pick) where title='Staging portfolio';" >/dev/null
curl --fail --silent "http://127.0.0.1:$staging_port/v1/public/portfolios/staging-v1" | grep -q 'version one'
status_v2="$(curl --silent --output /dev/null --write-out '%{http_code}' "http://127.0.0.1:$staging_port/v1/public/portfolios/staging-v2")"
test "$status_v2" -eq 404

echo "migration_count=$(mysql_query 'select count(*) from schema_migration;')"
echo "scheduled_succeeded=$completed"
echo "dead_letter=$dead_count"
echo "scheduled_failed=$failed_count"
echo "rollback_snapshot=version one"
echo "staged_rollout_rehearsal=PASS"
