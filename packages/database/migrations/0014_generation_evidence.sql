alter table generation_job
  add column input_idempotency_key text,
  add column request_hash text,
  add column stage text not null default 'queued'
    check (stage in ('queued', 'validating', 'materializing', 'charging', 'done', 'failed')),
  add column attempts integer not null default 0 check (attempts >= 0),
  add column failure_retryable boolean,
  add column portfolio_id uuid,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now(),
  add constraint generation_job_portfolio_fk
    foreign key (user_id, portfolio_id) references portfolio(user_id, id) on delete set null;

create unique index generation_job_idempotency_unique
  on generation_job(user_id, input_idempotency_key)
  where input_idempotency_key is not null;

create table generation_usage_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  generation_job_id uuid not null,
  usage_counter_id uuid,
  amount integer not null check (amount in (-1, 1)),
  reason text not null,
  created_at timestamptz not null default now(),
  foreign key (user_id, generation_job_id) references generation_job(user_id, id) on delete cascade,
  foreign key (user_id, usage_counter_id) references usage_counter(user_id, id) on delete restrict,
  unique (user_id, generation_job_id, reason),
  unique (user_id, id)
);

create table generation_sentence_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  generation_job_id uuid not null,
  block_id uuid not null,
  recipe_evidence_path_id uuid not null references recipe_evidence_path(id) on delete restrict,
  source_quote text not null,
  created_at timestamptz not null default now(),
  foreign key (user_id, generation_job_id) references generation_job(user_id, id) on delete cascade,
  foreign key (user_id, block_id) references block(user_id, id) on delete cascade,
  unique (user_id, generation_job_id, block_id, recipe_evidence_path_id),
  unique (user_id, id)
);

create table portfolio_snapshot (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  portfolio_id uuid not null,
  kind text not null check (kind in ('initial_generation', 'edit', 'manual')),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (user_id, portfolio_id) references portfolio(user_id, id) on delete cascade,
  unique (user_id, id)
);

create index portfolio_snapshot_recent_idx
  on portfolio_snapshot(user_id, portfolio_id, created_at desc, id desc);

create function retain_portfolio_snapshots()
returns trigger language plpgsql as $$
begin
  delete from portfolio_snapshot where id in (
    select id from portfolio_snapshot
    where user_id = new.user_id and portfolio_id = new.portfolio_id
    order by created_at desc, id desc offset 50
  );
  return new;
end;
$$;

create trigger portfolio_snapshot_retention
after insert on portfolio_snapshot
for each row execute function retain_portfolio_snapshots();
