create table platform_outbox (
  id uuid primary key default gen_random_uuid(),
  topic text not null check (topic ~ '^[a-z][a-z0-9._-]{1,99}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  idempotency_key text not null unique check (length(idempotency_key) between 16 and 128),
  state text not null default 'pending' check (state in ('pending', 'publishing', 'published', 'dead_letter')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  published_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((state = 'publishing') = (locked_at is not null)),
  check ((state = 'published') = (published_at is not null))
);

create index platform_outbox_dispatch_idx
  on platform_outbox (available_at, created_at)
  where state in ('pending', 'publishing');
