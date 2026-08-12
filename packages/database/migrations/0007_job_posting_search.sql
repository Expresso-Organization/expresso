alter table company add column dedupe_key text;
update company
set dedupe_key = md5(lower(name) || ':' || coalesce(lower(domain), ''))
where dedupe_key is null;
create unique index company_dedupe_key_unique on company(dedupe_key);

alter table job_posting
  add column source_url text,
  add column created_at timestamptz not null default now(),
  add column normalized_at timestamptz;

create or replace function prevent_job_posting_source_mutation()
returns trigger
language plpgsql
as $$
begin
  if new.source is distinct from old.source
    or new.external_id is distinct from old.external_id
    or new.source_url is distinct from old.source_url
    or new.description_raw is distinct from old.description_raw
    or new.dedupe_hash is distinct from old.dedupe_hash then
    raise exception 'job posting source fields are immutable'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

alter table saved_search
  add column name text,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();

update saved_search set name = left(query_text, 120) where name is null;
alter table saved_search alter column name set not null;
create unique index saved_search_user_name_unique on saved_search(user_id, name);

create table recent_search (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  query_text text not null,
  conditions jsonb not null default '[]'::jsonb check (jsonb_typeof(conditions) = 'array'),
  result_count integer not null default 0 check (result_count >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, id)
);

create index recent_search_user_created_idx
  on recent_search(user_id, created_at desc);

alter table interest
  add column updated_at timestamptz not null default now();

alter table match_score
  add column next_action text;

update match_score set next_action = '기록 근거를 보강하세요.' where next_action is null;
alter table match_score alter column next_action set not null;

alter table job_analysis
  add column input_idempotency_key text,
  add column input_request_hash text;

create unique index job_analysis_input_idempotency_unique
  on job_analysis(user_id, input_idempotency_key)
  where input_idempotency_key is not null;
