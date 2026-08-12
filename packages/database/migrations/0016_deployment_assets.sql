alter table deployment
  add column snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(snapshot) = 'object'),
  add column seo jsonb not null default '{}'::jsonb
    check (jsonb_typeof(seo) = 'object');

create table deployment_slug_redirect (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  portfolio_id uuid not null,
  old_slug text not null unique,
  new_slug text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  foreign key (user_id, portfolio_id) references portfolio(user_id, id) on delete cascade,
  check (old_slug <> new_slug),
  check (expires_at > created_at)
);

create function protect_deployment_snapshot()
returns trigger language plpgsql as $$
begin
  if new.user_id is distinct from old.user_id
    or new.portfolio_id is distinct from old.portfolio_id
    or new.version is distinct from old.version
    or new.subdomain is distinct from old.subdomain
    or new.snapshot is distinct from old.snapshot
    or new.seo is distinct from old.seo
    or new.contact_visibility is distinct from old.contact_visibility
    or new.published_at is distinct from old.published_at then
    raise exception 'deployment snapshot is immutable';
  end if;
  return new;
end;
$$;

create trigger deployment_snapshot_immutable
before update on deployment
for each row execute function protect_deployment_snapshot();

create table export_job (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  portfolio_id uuid not null,
  deployment_id uuid,
  kind text not null check (kind in ('pdf', 'deck')),
  page_format text check (page_format is null or page_format in ('letter', 'a4')),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  idempotency_key text not null,
  request_hash text not null,
  asset_id uuid,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, portfolio_id) references portfolio(user_id, id) on delete cascade,
  foreign key (user_id, deployment_id) references deployment(user_id, id) on delete set null,
  unique (user_id, idempotency_key),
  unique (user_id, id)
);

alter table export_asset
  add column version integer not null default 1 check (version > 0),
  add column access_nonce uuid not null default gen_random_uuid(),
  add column revoked_at timestamptz,
  add column created_at timestamptz not null default now();

alter table export_job
  add constraint export_job_asset_fk
  foreign key (user_id, asset_id) references export_asset(user_id, id) on delete set null;

create unique index export_asset_active_resume_idx
  on export_asset(user_id, portfolio_id)
  where kind = 'resume_file' and revoked_at is null;

create index deployment_slug_redirect_lookup_idx
  on deployment_slug_redirect(old_slug, expires_at);
