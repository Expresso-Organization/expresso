alter table visit_event
  add column event_id uuid unique,
  add column completed boolean not null default false,
  add column duration_ms integer check (duration_ms is null or duration_ms >= 0);

alter table section_view
  add column event_id uuid unique,
  add column occurred_at timestamptz not null default now();

alter table conversion_event
  add column event_id uuid unique,
  add column occurred_at timestamptz not null default now();

create table analytics_event_receipt (
  event_id uuid primary key,
  user_id uuid not null references "user"(id) on delete cascade,
  deployment_id uuid not null,
  event_type text not null check (event_type in ('visit', 'complete', 'section_view', 'contact_click', 'file_download', 'link_click')),
  visitor_hash text not null check (length(visitor_hash) = 64),
  payload_hash text not null check (length(payload_hash) = 64),
  payload_bytes integer not null check (payload_bytes between 1 and 8192),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  foreign key (user_id, deployment_id) references deployment(user_id, id) on delete cascade,
  unique (user_id, event_id)
);

create index analytics_event_rate_idx
  on analytics_event_receipt(visitor_hash, received_at desc);
