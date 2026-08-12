-- nullable 참조도 다른 사용자의 행을 가리키지 못하게 한다.
create function ensure_owned_reference()
returns trigger
language plpgsql
as $$
declare
  reference_id uuid;
  reference_exists boolean;
begin
  reference_id := nullif(to_jsonb(new) ->> tg_argv[1], '')::uuid;
  if reference_id is null then
    return new;
  end if;

  execute format(
    'select exists(select 1 from %I where id = $1 and user_id = $2)',
    tg_argv[0]
  )
  into reference_exists
  using reference_id, new.user_id;

  if not reference_exists then
    raise exception '% must reference a % owned by the same user', tg_argv[1], tg_argv[0]
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger question_requirement_owner
before insert or update of requirement_id, user_id on question
for each row execute function ensure_owned_reference('requirement', 'requirement_id');

create trigger question_replacement_owner
before insert or update of replaced_from_id, user_id on question
for each row execute function ensure_owned_reference('question', 'replaced_from_id');

create trigger answer_record_owner
before insert or update of created_record_id, user_id on answer
for each row execute function ensure_owned_reference('record', 'created_record_id');

create trigger portfolio_section_recipe_owner
before insert or update of recipe_section_id, user_id on portfolio_section
for each row execute function ensure_owned_reference('recipe_section', 'recipe_section_id');

create trigger block_source_record_owner
before insert or update of source_record_id, user_id on block
for each row execute function ensure_owned_reference('record', 'source_record_id');

create trigger revision_block_owner
before insert or update of block_id, user_id on revision
for each row execute function ensure_owned_reference('block', 'block_id');

create trigger widget_derived_metric_owner
before insert or update of derived_metric_id, user_id on widget
for each row execute function ensure_owned_reference('derived_metric', 'derived_metric_id');

-- 시스템 카테고리는 공유하고 사용자 카테고리는 소유자만 사용할 수 있다.
create function ensure_record_category_scope()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from category
    where id = new.category_id
      and (user_id is null or user_id = new.user_id)
  ) then
    raise exception 'category must be a system category or belong to the record owner'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger record_category_scope
before insert or update of category_id, user_id on record
for each row execute function ensure_record_category_scope();

-- 공고 원문과 원문 식별자는 분석 근거가 가리키므로 변경하지 않는다.
create function prevent_job_posting_source_mutation()
returns trigger
language plpgsql
as $$
begin
  if new.source is distinct from old.source
    or new.external_id is distinct from old.external_id
    or new.description_raw is distinct from old.description_raw
    or new.dedupe_hash is distinct from old.dedupe_hash then
    raise exception 'job posting source fields are immutable'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger job_posting_source_immutable
before update on job_posting
for each row execute function prevent_job_posting_source_mutation();

-- 원본 기록 연결이 끊기면 블록을 삭제하지 않고 detached로 남긴다.
create function detach_blocks_before_record_delete()
returns trigger
language plpgsql
as $$
begin
  update block
  set source_record_id = null,
      sync_state = 'detached'
  where user_id = old.user_id
    and source_record_id = old.id;

  return old;
end;
$$;

create trigger record_delete_detaches_blocks
before delete on record
for each row execute function detach_blocks_before_record_delete();

-- current_deployment_id는 같은 포트폴리오의 배포만 가리킨다.
create function ensure_current_deployment_scope()
returns trigger
language plpgsql
as $$
begin
  if new.current_deployment_id is not null and not exists (
    select 1
    from deployment
    where id = new.current_deployment_id
      and user_id = new.user_id
      and portfolio_id = new.id
  ) then
    raise exception 'current deployment must belong to the same portfolio'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger portfolio_current_deployment_scope
before insert or update of current_deployment_id, user_id on portfolio
for each row execute function ensure_current_deployment_scope();

-- 포트폴리오별 대시보드 뷰는 최대 6개다. 부모 행 잠금으로 동시 생성을 직렬화한다.
create function enforce_dashboard_view_limit()
returns trigger
language plpgsql
as $$
declare
  existing_count integer;
begin
  perform 1
  from portfolio
  where id = new.portfolio_id and user_id = new.user_id
  for update;

  select count(*)
  into existing_count
  from dashboard_view
  where user_id = new.user_id
    and portfolio_id = new.portfolio_id
    and id <> new.id;

  if existing_count >= 6 then
    raise exception 'a portfolio can have at most 6 dashboard views'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger dashboard_view_limit
before insert or update of user_id, portfolio_id on dashboard_view
for each row execute function enforce_dashboard_view_limit();

