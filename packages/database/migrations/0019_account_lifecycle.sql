create table account_deletion_request (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references "user"(id) on delete set null,
  subject_id uuid not null,
  status text not null check (status in ('pending', 'cancelled', 'purged')),
  requested_at timestamptz not null,
  purge_after timestamptz not null,
  cancelled_at timestamptz,
  purged_at timestamptz,
  cancellation_token_hash text not null check (length(cancellation_token_hash) = 64),
  restoration jsonb not null check (jsonb_typeof(restoration) = 'object'),
  phase text not null default 'grace_period',
  check (purge_after = requested_at + interval '30 days')
);

create unique index account_deletion_one_pending_idx
  on account_deletion_request(user_id) where status = 'pending';

create table account_deletion_event (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references account_deletion_request(id) on delete cascade,
  phase text not null,
  affected_rows integer not null default 0 check (affected_rows >= 0),
  occurred_at timestamptz not null default now(),
  unique (request_id, phase)
);

