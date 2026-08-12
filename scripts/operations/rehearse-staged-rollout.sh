#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
compose_file="$repo_root/infra/compose.yaml"
staging_database="expresso_staging_rehearsal"
staging_port="44123"
database_url="postgres://expresso:expresso@127.0.0.1:55432/$staging_database"
redis_url="redis://127.0.0.1:56379"
artifact_dir="$(mktemp -d "$repo_root/services/backend/.release-rehearsal.XXXXXX")"
api_pid=""
worker_pid=""

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
  docker compose -f "$compose_file" exec -T postgres psql --username=expresso --dbname=postgres --set=ON_ERROR_STOP=1 --command="drop database if exists $staging_database with (force);" >/dev/null
  if [[ "$artifact_dir" == "$repo_root/services/backend/.release-rehearsal."* ]]; then rm -rf "$artifact_dir"; fi
}
trap cleanup EXIT

docker compose -f "$compose_file" exec -T postgres psql --username=expresso --dbname=postgres --set=ON_ERROR_STOP=1 --command="drop database if exists $staging_database with (force);" >/dev/null
docker compose -f "$compose_file" exec -T postgres psql --username=expresso --dbname=postgres --set=ON_ERROR_STOP=1 --command="create database $staging_database;" >/dev/null

cd "$repo_root"
pnpm build >/dev/null
cp -R services/backend/dist "$artifact_dir/dist"
DATABASE_URL="$database_url" pnpm --filter @expresso/database migrate >/dev/null

docker compose -f "$compose_file" exec -T postgres psql --username=expresso --dbname="$staging_database" --set=ON_ERROR_STOP=1 --command="with u as (insert into \"user\" (email, display_name, plan_id) select 'staging@expresso.local', 'Staging', id from plan where code='pro' returning id), c as (insert into company (name, dedupe_key) values ('Staging', 'staging-rehearsal') returning id), j as (insert into job_posting (company_id, source, title, description_raw, requirements, dedupe_hash) select c.id, 'user_input', 'Staging', repeat('s',250), '{}'::jsonb, 'staging-rehearsal' from c returning id), a as (insert into job_analysis (user_id, job_posting_id, input_type, status) select u.id,j.id,'paste','done' from u,j returning id,user_id), b as (insert into brew (user_id, job_analysis_id, length_preset, status) select a.user_id,a.id,'single','done' from a returning id,user_id), p as (insert into portfolio (user_id, brew_id, template_id, title) select b.user_id,b.id,t.id,'Staging portfolio' from b join template t on t.code='clarity' returning id,user_id), d1 as (insert into deployment (user_id, portfolio_id, version, subdomain, published_at, snapshot) select p.user_id,p.id,1,'staging-v1',now(),'{\"text\":\"version one\"}'::jsonb from p returning portfolio_id,user_id), d2 as (insert into deployment (user_id, portfolio_id, version, subdomain, published_at, snapshot) select d1.user_id,d1.portfolio_id,2,'staging-v2',now(),'{\"text\":\"version two\"}'::jsonb from d1 returning id,portfolio_id) select id from d2; update portfolio set current_deployment_id=(select id from deployment where subdomain='staging-v2'), status='published' where title='Staging portfolio';" >/dev/null

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
for _ in $(seq 1 100); do
  completed="$(docker compose -f "$compose_file" exec -T postgres psql --username=expresso --dbname="$staging_database" --tuples-only --no-align --command="select count(*) from scheduled_job_run where status='succeeded';")"
  if [[ "$completed" -eq 6 ]]; then break; fi
  sleep 0.1
done
dead_count="$(docker compose -f "$compose_file" exec -T postgres psql --username=expresso --dbname="$staging_database" --tuples-only --no-align --command="select count(*) from platform_outbox where state='dead_letter';")"
failed_count="$(docker compose -f "$compose_file" exec -T postgres psql --username=expresso --dbname="$staging_database" --tuples-only --no-align --command="select count(*) from scheduled_job_run where status='failed';")"
test "$dead_count" -eq 0
test "$failed_count" -eq 0
curl --fail --silent "http://127.0.0.1:$staging_port/v1/public/portfolios/staging-v2" | grep -q 'version two'

stop_processes
start_pair "$artifact_dir/dist/api/main.js" "$artifact_dir/dist/worker/main.js"
docker compose -f "$compose_file" exec -T postgres psql --username=expresso --dbname="$staging_database" --set=ON_ERROR_STOP=1 --command="update portfolio set current_deployment_id=(select id from deployment where subdomain='staging-v1') where title='Staging portfolio';" >/dev/null
curl --fail --silent "http://127.0.0.1:$staging_port/v1/public/portfolios/staging-v1" | grep -q 'version one'
status_v2="$(curl --silent --output /dev/null --write-out '%{http_code}' "http://127.0.0.1:$staging_port/v1/public/portfolios/staging-v2")"
test "$status_v2" -eq 404

echo "migration_count=$(docker compose -f "$compose_file" exec -T postgres psql --username=expresso --dbname="$staging_database" --tuples-only --no-align --command='select count(*) from schema_migration;')"
echo "scheduled_succeeded=$completed"
echo "dead_letter=$dead_count"
echo "scheduled_failed=$failed_count"
echo "rollback_snapshot=version one"
echo "staged_rollout_rehearsal=PASS"
