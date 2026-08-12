alter table interview_session
  add column input_idempotency_key text,
  add column current_order integer not null default 0 check (current_order >= 0),
  add column answered_count integer not null default 0 check (answered_count >= 0),
  add column paused_at timestamptz,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();

create unique index interview_session_idempotency_unique
  on interview_session(user_id, input_idempotency_key)
  where input_idempotency_key is not null;

alter table question
  drop constraint if exists question_user_id_interview_session_id_order_no_key,
  add column basis jsonb not null default '{"type":"legacy"}'::jsonb
    check (jsonb_typeof(basis) = 'object'),
  add column active boolean not null default true,
  add column variant integer not null default 0 check (variant >= 0),
  add column created_at timestamptz not null default now();

create unique index question_active_order_unique
  on question(user_id, interview_session_id, order_no)
  where active;

alter table answer
  add column input_idempotency_key text,
  add column request_hash text,
  add column version integer not null default 1 check (version > 0),
  add column updated_at timestamptz not null default now();

create unique index answer_idempotency_unique
  on answer(user_id, input_idempotency_key)
  where input_idempotency_key is not null;

create table answer_record_change (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  answer_id uuid not null,
  record_id uuid not null,
  change_type text not null check (change_type in ('created', 'strengthened')),
  changed_fields jsonb not null check (
    jsonb_typeof(changed_fields) = 'array'
    and jsonb_array_length(changed_fields) > 0
  ),
  source_quote text not null check (char_length(source_quote) > 0),
  created_at timestamptz not null default now(),
  foreign key (user_id, answer_id) references answer(user_id, id) on delete cascade,
  foreign key (user_id, record_id) references record(user_id, id) on delete cascade,
  unique (user_id, answer_id),
  unique (user_id, id)
);

create function validate_answer_record_change_source()
returns trigger
language plpgsql
as $$
declare
  transcript_text text;
begin
  select transcript into transcript_text
  from answer
  where id = new.answer_id and user_id = new.user_id;
  if transcript_text is null or position(new.source_quote in transcript_text) = 0 then
    raise exception 'record change source must be an exact answer transcript span'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger answer_record_change_exact_source
before insert or update of user_id, answer_id, source_quote on answer_record_change
for each row execute function validate_answer_record_change_source();
