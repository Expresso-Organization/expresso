alter table category
  add column name text,
  add column icon text,
  add column default_view text,
  add column version integer not null default 1 check (version > 0),
  add column updated_at timestamptz not null default now();

update category
set name = key,
    icon = 'folder',
    default_view = 'table'
where name is null;

alter table category
  alter column name set not null,
  alter column icon set not null,
  alter column default_view set not null,
  add constraint category_default_view_check
    check (default_view in ('table', 'gallery', 'timeline', 'board', 'list'));

alter table record
  add column version integer not null default 1 check (version > 0),
  add column updated_at timestamptz not null default now(),
  add column deleted_at timestamptz,
  add column purge_after timestamptz,
  add column create_idempotency_key text,
  add column create_request_hash text,
  add constraint record_deletion_window_check check (
    (deleted_at is null and purge_after is null)
    or (deleted_at is not null and purge_after = deleted_at + interval '30 days')
  );

create unique index record_create_idempotency_unique
  on record(user_id, create_idempotency_key)
  where create_idempotency_key is not null;

alter table skill
  add column evidence_count integer not null default 0 check (evidence_count >= 0),
  add column last_used_at timestamptz,
  add column strength text not null default 'weak'
    check (strength in ('weak', 'supported', 'strong'));

create table category_view (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  category_id uuid not null references category(id) on delete cascade,
  name text not null,
  view_type text not null check (view_type in ('table', 'gallery', 'timeline', 'board', 'list')),
  filters jsonb not null default '[]'::jsonb check (jsonb_typeof(filters) = 'array'),
  sorts jsonb not null default '[]'::jsonb check (jsonb_typeof(sorts) = 'array'),
  visible_properties text[] not null default '{}',
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, category_id, name),
  unique (user_id, id)
);

create index category_view_user_category_idx
  on category_view(user_id, category_id, sort_order);

insert into category
  (key, name, icon, default_view, is_system, property_schema, sort_order)
values
  (
    'experience', '경험', 'briefcase', 'table', true,
    '{
      "organization":{"label":"조직","type":"text","required":false,"system":false},
      "role":{"label":"역할","type":"text","required":false,"system":false},
      "achievements":{"label":"성과","type":"tags","required":false,"system":false}
    }'::jsonb, 0
  ),
  (
    'project', '프로젝트', 'folder-kanban', 'gallery', true,
    '{
      "role":{"label":"역할","type":"text","required":false,"system":false},
      "technologies":{"label":"기술","type":"tags","required":false,"system":false},
      "outcome":{"label":"성과","type":"text","required":false,"system":false}
    }'::jsonb, 1
  ),
  (
    'education_history', '학력·이력', 'graduation-cap', 'timeline', true,
    '{
      "institution":{"label":"기관","type":"text","required":false,"system":false},
      "program":{"label":"과정","type":"text","required":false,"system":false},
      "startMonth":{"label":"시작 월","type":"date","required":false,"system":false},
      "endMonth":{"label":"종료 월","type":"date","required":false,"system":false}
    }'::jsonb, 2
  ),
  (
    'certification_award', '자격증·수상', 'award', 'table', true,
    '{
      "issuer":{"label":"발급·수여 기관","type":"text","required":false,"system":false},
      "issuedMonth":{"label":"취득 월","type":"date","required":false,"system":false}
    }'::jsonb, 3
  ),
  (
    'academic_writing', '학술·집필', 'book-open', 'list', true,
    '{
      "publication":{"label":"게재처","type":"text","required":false,"system":false},
      "publishedMonth":{"label":"게재 월","type":"date","required":false,"system":false},
      "url":{"label":"원문 링크","type":"text","required":false,"system":false}
    }'::jsonb, 4
  ),
  (
    'activity_leadership', '활동·리더십', 'users', 'table', true,
    '{
      "organization":{"label":"조직","type":"text","required":false,"system":false},
      "role":{"label":"역할","type":"text","required":false,"system":false},
      "outcome":{"label":"성과","type":"text","required":false,"system":false}
    }'::jsonb, 5
  ),
  (
    'skill_tool', '스킬·도구', 'wrench', 'board', true,
    '{
      "group":{"label":"분류","type":"text","required":false,"system":false},
      "lastUsedMonth":{"label":"최근 사용 월","type":"date","required":false,"system":false}
    }'::jsonb, 6
  )
on conflict do nothing;

create function protect_system_category()
returns trigger
language plpgsql
as $$
begin
  if old.is_system then
    raise exception 'system category definitions are immutable';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger category_system_immutable
before update or delete on category
for each row execute function protect_system_category();

create function maintain_category_version()
returns trigger
language plpgsql
as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

create trigger category_version_on_update
before update on category
for each row execute function maintain_category_version();

create function prevent_valued_property_removal()
returns trigger
language plpgsql
as $$
declare
  removed_key text;
begin
  for removed_key in
    select key
    from jsonb_object_keys(old.property_schema) as key
    where not new.property_schema ? key
  loop
    if exists (
      select 1 from record
      where category_id = old.id
        and deleted_at is null
        and properties ? removed_key
    ) then
      raise exception 'property % still has record values', removed_key;
    end if;
  end loop;
  return new;
end;
$$;

create trigger category_property_removal_guard
before update of property_schema on category
for each row execute function prevent_valued_property_removal();

create function validate_record_properties()
returns trigger
language plpgsql
as $$
declare
  schema_value jsonb;
  property_key text;
  property_value jsonb;
  definition jsonb;
  expected_type text;
begin
  select property_schema into schema_value from category where id = new.category_id;
  if schema_value is null then
    raise exception 'record category does not exist';
  end if;

  for property_key, property_value in select * from jsonb_each(new.properties)
  loop
    definition := schema_value -> property_key;
    if definition is null then
      raise exception 'property % is not defined by the category', property_key;
    end if;
    expected_type := definition ->> 'type';
    if (expected_type in ('text', 'date') and jsonb_typeof(property_value) <> 'string')
      or (expected_type = 'number' and jsonb_typeof(property_value) <> 'number')
      or (expected_type = 'boolean' and jsonb_typeof(property_value) <> 'boolean')
      or (expected_type = 'tags' and (
        jsonb_typeof(property_value) <> 'array'
        or exists (
          select 1 from jsonb_array_elements(property_value) as item
          where jsonb_typeof(item) <> 'string'
        )
      ))
    then
      raise exception 'property % does not match type %', property_key, expected_type;
    end if;
  end loop;

  for property_key in
    select key
    from jsonb_each(schema_value)
    where coalesce((value ->> 'required')::boolean, false)
  loop
    if not new.properties ? property_key
      or new.properties -> property_key = 'null'::jsonb
    then
      raise exception 'required property % is missing', property_key;
    end if;
  end loop;
  return new;
end;
$$;

create trigger record_properties_match_category
before insert or update of category_id, properties on record
for each row execute function validate_record_properties();

create function maintain_record_version()
returns trigger
language plpgsql
as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

create trigger record_version_on_update
before update on record
for each row execute function maintain_record_version();

create trigger category_view_category_scope
before insert or update of category_id, user_id on category_view
for each row execute function ensure_record_category_scope();

create function enforce_category_view_limit()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from category_view
      where user_id = new.user_id and category_id = new.category_id) >= 8 then
    raise exception 'category view limit exceeded';
  end if;
  return new;
end;
$$;

create trigger category_view_limit
before insert on category_view
for each row execute function enforce_category_view_limit();
