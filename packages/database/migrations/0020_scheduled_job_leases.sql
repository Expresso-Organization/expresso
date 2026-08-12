create table scheduled_job_definition (
  job_key text primary key check (job_key in ('saved_searches', 'expire_postings', 'notification_batch', 'analytics_daily', 'deletion_grace', 'retention')),
  interval_seconds integer not null check (interval_seconds between 60 and 604800),
  next_run_at timestamptz not null,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_status text check (last_status is null or last_status in ('succeeded', 'failed')),
  failure_count integer not null default 0 check (failure_count >= 0)
);

create table scheduled_job_run (
  id uuid primary key default gen_random_uuid(),
  job_key text not null references scheduled_job_definition(job_key) on delete restrict,
  scheduled_for timestamptz not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  started_at timestamptz,
  finished_at timestamptz,
  last_error text,
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  unique (job_key, scheduled_for)
);

insert into scheduled_job_definition (job_key, interval_seconds, next_run_at) values
  ('saved_searches', 3600, now()),
  ('expire_postings', 3600, now()),
  ('notification_batch', 300, now()),
  ('analytics_daily', 86400, now()),
  ('deletion_grace', 3600, now()),
  ('retention', 86400, now());

create index scheduled_job_due_idx on scheduled_job_definition(next_run_at);
create index scheduled_job_run_status_idx on scheduled_job_run(status, scheduled_for);

