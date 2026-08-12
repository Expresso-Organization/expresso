alter table brew
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();

alter table brew_source
  add column score integer not null default 0 check (score >= 0),
  add column reason_text text not null default 'eligible organized record',
  add column is_selected boolean not null default true,
  add column updated_at timestamptz not null default now(),
  add constraint brew_source_selection_reason_check check (
    (is_selected and excluded_reason is null)
    or (not is_selected and excluded_reason is not null)
  );

create unique index brew_source_selected_rank_unique
  on brew_source(user_id, brew_id, rank)
  where is_selected;

create function validate_brew_source_candidate()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from brew
    where id = new.brew_id and user_id = new.user_id
  ) then
    raise exception 'brew source must belong to the brew owner'
      using errcode = '23514';
  end if;
  if not exists (
    select 1
    from record
    where id = new.record_id
      and user_id = new.user_id
      and deleted_at is null
      and status in ('organized', 'verified')
  ) then
    raise exception 'brew source must be an active organized record owned by the user'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger brew_source_candidate_guard
before insert or update of user_id, brew_id, record_id on brew_source
for each row execute function validate_brew_source_candidate();

create function enforce_brew_source_selected_limit()
returns trigger
language plpgsql
as $$
declare
  selected_count integer;
begin
  if not new.is_selected then
    return new;
  end if;
  perform 1 from brew
  where id = new.brew_id and user_id = new.user_id
  for update;
  select count(*) into selected_count
  from brew_source
  where user_id = new.user_id
    and brew_id = new.brew_id
    and is_selected
    and id <> new.id;
  if selected_count >= 10 then
    raise exception 'a brew can select at most 10 sources'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger brew_source_selected_limit
before insert or update of is_selected, rank, brew_id, user_id on brew_source
for each row execute function enforce_brew_source_selected_limit();

create function require_selected_brew_source_after_change()
returns trigger
language plpgsql
as $$
declare
  checked_user_id uuid;
  checked_brew_id uuid;
begin
  checked_user_id := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  checked_brew_id := case when tg_op = 'DELETE' then old.brew_id else new.brew_id end;
  if exists (
    select 1 from brew where id = checked_brew_id and user_id = checked_user_id
  ) and not exists (
    select 1 from brew_source
    where user_id = checked_user_id
      and brew_id = checked_brew_id
      and is_selected
  ) then
    raise exception 'a brew with material candidates must keep at least one selected source'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger brew_source_nonempty_selection
after insert or update or delete on brew_source
deferrable initially deferred
for each row execute function require_selected_brew_source_after_change();
