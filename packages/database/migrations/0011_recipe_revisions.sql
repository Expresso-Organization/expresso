alter table recipe
  add column input_idempotency_key text,
  add column updated_at timestamptz not null default now();

create unique index recipe_idempotency_unique
  on recipe(user_id, input_idempotency_key)
  where input_idempotency_key is not null;

alter table recipe_section
  add column context jsonb not null default '{"goal":"","points":[],"metrics":[],"format":"narrative","tone":"professional","exclude":[]}'::jsonb
    check (jsonb_typeof(context) = 'object'),
  add column locked boolean not null default false,
  add column edited_by text not null default 'ai' check (edited_by in ('ai', 'user')),
  add column updated_at timestamptz not null default now();

alter table recipe_item
  add column updated_at timestamptz not null default now();

create table recipe_evidence_path (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  recipe_id uuid not null,
  recipe_item_id uuid not null,
  source_type text not null check (source_type in ('requirement', 'record', 'answer')),
  source_id uuid not null,
  source_label text not null,
  target_path text not null,
  created_at timestamptz not null default now(),
  foreign key (user_id, recipe_id) references recipe(user_id, id) on delete cascade,
  foreign key (user_id, recipe_item_id) references recipe_item(user_id, id) on delete cascade,
  unique (user_id, recipe_id, source_type, source_id, recipe_item_id),
  unique (user_id, id)
);

create table recipe_unused_source (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  recipe_id uuid not null,
  record_id uuid not null,
  reason text not null check (char_length(reason) > 0),
  created_at timestamptz not null default now(),
  foreign key (user_id, recipe_id) references recipe(user_id, id) on delete cascade,
  foreign key (user_id, record_id) references record(user_id, id) on delete cascade,
  unique (user_id, recipe_id, record_id),
  unique (user_id, id)
);

create table recipe_revision (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  recipe_id uuid not null,
  actor text not null check (actor in ('ai', 'user')),
  action text not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  diff jsonb not null check (jsonb_typeof(diff) = 'array'),
  created_at timestamptz not null default now(),
  foreign key (user_id, recipe_id) references recipe(user_id, id) on delete cascade,
  unique (user_id, id)
);

create index recipe_revision_recent_idx
  on recipe_revision(user_id, recipe_id, created_at desc, id desc);

create function retain_recent_recipe_revisions()
returns trigger
language plpgsql
as $$
begin
  delete from recipe_revision
  where id in (
    select id from recipe_revision
    where user_id = new.user_id and recipe_id = new.recipe_id
    order by created_at desc, id desc
    offset 50
  );
  return new;
end;
$$;

create trigger recipe_revision_retention
after insert on recipe_revision
for each row execute function retain_recent_recipe_revisions();
