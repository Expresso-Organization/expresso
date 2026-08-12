create table notification_preference (
  user_id uuid not null references "user"(id) on delete cascade,
  kind text not null check (kind in ('deadline', 'saved_search', 'generation', 'traffic')),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);

alter table notification
  add column dedupe_date date not null default current_date,
  add column delivery_status text not null default 'queued'
    check (delivery_status in ('queued', 'sending', 'sent', 'failed', 'suppressed')),
  add column attempts integer not null default 0 check (attempts >= 0),
  add column next_attempt_at timestamptz not null default now(),
  add column last_error text,
  add column created_at timestamptz not null default now(),
  add column delivered_at timestamptz;

create unique index notification_daily_dedupe_idx
  on notification(user_id, dedupe_key, dedupe_date);

create index notification_delivery_ready_idx
  on notification(delivery_status, next_attempt_at)
  where delivery_status in ('queued', 'failed');

