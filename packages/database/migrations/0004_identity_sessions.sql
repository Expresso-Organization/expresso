create table identity_session (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  unique (user_id, id)
);

create index identity_session_active_token_idx
  on identity_session(token_hash, expires_at)
  where revoked_at is null;

create index identity_session_user_active_idx
  on identity_session(user_id, created_at desc)
  where revoked_at is null;
