create extension if not exists citext;

-- A. 계정 · 요금제
create table plan (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('free', 'pro', 'team')),
  generation_quota integer not null check (generation_quota >= 0),
  features jsonb not null default '{}'::jsonb check (jsonb_typeof(features) = 'object'),
  is_public_listed boolean not null default true
);

create table "user" (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  display_name text not null,
  plan_id uuid not null references plan(id) on delete restrict,
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now()
);

create table usage_counter (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  period_start date not null,
  used integer not null default 0 check (used >= 0),
  resets_at timestamptz not null,
  unique (user_id, period_start),
  unique (user_id, id)
);

create table notification (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  kind text not null check (kind in ('deadline', 'saved_search', 'generation', 'traffic')),
  target_url text not null,
  dedupe_key text not null,
  read_at timestamptz,
  unique (user_id, id)
);

-- B. 커리어 기록
create table category (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references "user"(id) on delete cascade,
  key text not null,
  is_system boolean not null default false,
  property_schema jsonb not null default '{}'::jsonb check (jsonb_typeof(property_schema) = 'object'),
  sort_order integer not null default 0,
  check ((is_system and user_id is null) or (not is_system and user_id is not null))
);

create unique index category_system_key_unique
  on category(key)
  where user_id is null;

create unique index category_user_key_unique
  on category(user_id, key)
  where user_id is not null;

create table record (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  category_id uuid not null references category(id) on delete restrict,
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'organized', 'verified')),
  origin text not null check (origin in ('manual', 'ai', 'interview', 'import')),
  properties jsonb not null default '{}'::jsonb check (jsonb_typeof(properties) = 'object'),
  body_md text not null default '',
  period daterange,
  unique (user_id, id)
);

create table record_link (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  from_record_id uuid not null,
  to_record_id uuid not null,
  relation text not null check (relation in ('related', 'parent', 'duplicate_of')),
  created_by text not null check (created_by in ('user', 'ai')),
  foreign key (user_id, from_record_id) references record(user_id, id) on delete cascade,
  foreign key (user_id, to_record_id) references record(user_id, id) on delete cascade,
  check (from_record_id <> to_record_id),
  unique (user_id, from_record_id, to_record_id, relation),
  unique (user_id, id)
);

create table skill (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  name text not null,
  level integer not null check (level between 1 and 5),
  computed_at timestamptz not null default now(),
  demand_score numeric,
  unique (user_id, name),
  unique (user_id, id)
);

create table skill_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  skill_id uuid not null,
  record_id uuid not null,
  weight numeric not null,
  extracted_span jsonb not null check (jsonb_typeof(extracted_span) = 'object'),
  foreign key (user_id, skill_id) references skill(user_id, id) on delete cascade,
  foreign key (user_id, record_id) references record(user_id, id) on delete cascade,
  unique (user_id, skill_id, record_id),
  unique (user_id, id)
);

-- C. 채용 공고
create table company (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domain text,
  industry text,
  tone_summary text
);

create table job_posting (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id) on delete restrict,
  source text not null check (source in ('api', 'partner', 'user_input')),
  external_id text,
  title text not null,
  description_raw text not null,
  requirements jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  dedupe_hash text not null,
  unique (source, external_id)
);

create unique index job_posting_dedupe_hash_unique on job_posting(dedupe_hash);

create table saved_search (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  query_text text not null,
  filters jsonb not null default '{}'::jsonb check (jsonb_typeof(filters) = 'object'),
  notify boolean not null default false,
  last_run_at timestamptz,
  unique (user_id, id)
);

create table match_score (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  job_posting_id uuid not null references job_posting(id) on delete cascade,
  total numeric not null,
  axes jsonb not null check (jsonb_typeof(axes) = 'object'),
  reason_text text not null,
  computed_at timestamptz not null default now(),
  unique (user_id, job_posting_id),
  unique (user_id, id)
);

create table interest (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  job_posting_id uuid not null references job_posting(id) on delete cascade,
  stage text not null default 'saved' check (stage in ('saved', 'applied', 'closed')),
  deadline_at timestamptz,
  memo text,
  unique (user_id, job_posting_id),
  unique (user_id, id)
);

create table job_analysis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  job_posting_id uuid references job_posting(id) on delete set null,
  input_type text not null check (input_type in ('url', 'paste', 'file')),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  analyzed_at timestamptz,
  unique (user_id, id)
);

create table requirement (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  job_analysis_id uuid not null,
  label text not null,
  kind text not null check (kind in ('must', 'nice', 'tone')),
  source_span jsonb not null check (jsonb_typeof(source_span) = 'object'),
  coverage text not null check (coverage in ('covered', 'partial', 'missing')),
  covered_by uuid[] not null default '{}',
  foreign key (user_id, job_analysis_id) references job_analysis(user_id, id) on delete cascade,
  unique (user_id, id)
);

-- D. 제작 흐름
create table brew (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  job_analysis_id uuid not null,
  mode text not null default 'solo' check (mode in ('solo', 'collab')),
  length_preset text not null check (length_preset in ('single', 'double', 'triple')),
  status text not null default 'draft' check (status in ('draft', 'interviewing', 'recipe', 'generating', 'done')),
  deadline_at timestamptz,
  resumed_at timestamptz,
  foreign key (user_id, job_analysis_id) references job_analysis(user_id, id) on delete restrict,
  unique (user_id, id)
);

create table brew_source (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  brew_id uuid not null,
  record_id uuid not null,
  rank integer not null check (rank >= 0),
  selected_by text not null check (selected_by in ('auto', 'user')),
  excluded_reason text,
  foreign key (user_id, brew_id) references brew(user_id, id) on delete cascade,
  foreign key (user_id, record_id) references record(user_id, id) on delete restrict,
  unique (user_id, brew_id, record_id),
  unique (user_id, id)
);

create table interview_session (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  brew_id uuid not null,
  status text not null default 'open' check (status in ('open', 'paused', 'done')),
  question_count integer not null default 0 check (question_count >= 0),
  transcript_url text,
  foreign key (user_id, brew_id) references brew(user_id, id) on delete cascade,
  unique (user_id, brew_id),
  unique (user_id, id)
);

create table question (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  interview_session_id uuid not null,
  requirement_id uuid references requirement(id) on delete set null,
  replaced_from_id uuid references question(id) on delete set null,
  order_no integer not null check (order_no >= 0),
  text text not null,
  skipped boolean not null default false,
  foreign key (user_id, interview_session_id) references interview_session(user_id, id) on delete cascade,
  unique (user_id, interview_session_id, order_no),
  unique (user_id, id),
  check (replaced_from_id is null or replaced_from_id <> id)
);

create table answer (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  question_id uuid not null,
  input_type text not null check (input_type in ('text', 'voice')),
  transcript text not null,
  created_record_id uuid references record(id) on delete set null,
  foreign key (user_id, question_id) references question(user_id, id) on delete cascade,
  unique (user_id, question_id),
  unique (user_id, id)
);

create table recipe (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  brew_id uuid not null,
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  completeness numeric not null,
  generated_at timestamptz not null default now(),
  foreign key (user_id, brew_id) references brew(user_id, id) on delete cascade,
  unique (user_id, brew_id, version),
  unique (user_id, id)
);

create table recipe_section (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  recipe_id uuid not null,
  order_no integer not null check (order_no >= 0),
  title text not null,
  purpose text not null,
  target_length integer not null check (target_length > 0),
  foreign key (user_id, recipe_id) references recipe(user_id, id) on delete cascade,
  unique (user_id, recipe_id, order_no),
  unique (user_id, id)
);

create table recipe_item (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  recipe_section_id uuid not null,
  order_no integer not null check (order_no >= 0),
  point_text text not null,
  evidence jsonb not null,
  locked boolean not null default false,
  edited_by text not null check (edited_by in ('ai', 'user')),
  foreign key (user_id, recipe_section_id) references recipe_section(user_id, id) on delete cascade,
  check (jsonb_typeof(evidence) = 'array' and jsonb_array_length(evidence) > 0),
  unique (user_id, recipe_section_id, order_no),
  unique (user_id, id)
);

-- E. 산출물
create table template (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  tone_tags text[] not null default '{}',
  supported_sections text[] not null default '{}',
  plan_required text not null check (plan_required in ('free', 'pro'))
);

create table generation_job (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  brew_id uuid not null,
  recipe_id uuid not null,
  template_id uuid not null references template(id) on delete restrict,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  usage_charged boolean not null default false,
  error_code text,
  foreign key (user_id, brew_id) references brew(user_id, id) on delete restrict,
  foreign key (user_id, recipe_id) references recipe(user_id, id) on delete restrict,
  unique (user_id, id)
);

create table portfolio (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  brew_id uuid not null,
  template_id uuid not null references template(id) on delete restrict,
  current_deployment_id uuid,
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'unlisted')),
  foreign key (user_id, brew_id) references brew(user_id, id) on delete restrict,
  unique (user_id, id)
);

create table portfolio_section (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  portfolio_id uuid not null,
  recipe_section_id uuid references recipe_section(id) on delete set null,
  order_no integer not null check (order_no >= 0),
  visible boolean not null default true,
  foreign key (user_id, portfolio_id) references portfolio(user_id, id) on delete cascade,
  unique (recipe_section_id),
  unique (user_id, portfolio_id, order_no),
  unique (user_id, id)
);

create table block (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  portfolio_section_id uuid not null,
  kind text not null check (kind in ('heading', 'paragraph', 'list', 'metric', 'media')),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  style jsonb not null default '{}'::jsonb check (jsonb_typeof(style) = 'object'),
  source_record_id uuid references record(id) on delete set null,
  sync_state text not null default 'synced' check (sync_state in ('synced', 'stale', 'detached')),
  locked boolean not null default false,
  foreign key (user_id, portfolio_section_id) references portfolio_section(user_id, id) on delete cascade,
  check (kind <> 'metric' or source_record_id is not null or sync_state = 'detached'),
  unique (user_id, id)
);

create table record_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  record_id uuid not null,
  block_id uuid not null,
  quoted_text text not null,
  first_used_at timestamptz not null default now(),
  foreign key (user_id, record_id) references record(user_id, id) on delete restrict,
  foreign key (user_id, block_id) references block(user_id, id) on delete cascade,
  unique (user_id, record_id, block_id),
  unique (user_id, id)
);

create table revision (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  portfolio_id uuid not null,
  block_id uuid references block(id) on delete cascade,
  actor text not null check (actor in ('user', 'ai')),
  before jsonb,
  after jsonb,
  restore_label text,
  foreign key (user_id, portfolio_id) references portfolio(user_id, id) on delete cascade,
  check (before is not null or after is not null),
  unique (user_id, id)
);

create table deployment (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  portfolio_id uuid not null,
  version integer not null check (version > 0),
  subdomain text not null unique,
  custom_domain text unique,
  seo_indexable boolean not null default false,
  contact_visibility text not null default 'hidden' check (contact_visibility in ('public', 'on_request', 'hidden')),
  published_at timestamptz,
  has_unpublished_changes boolean not null default false,
  foreign key (user_id, portfolio_id) references portfolio(user_id, id) on delete cascade,
  unique (user_id, portfolio_id, version),
  unique (user_id, id)
);

alter table portfolio
  add constraint portfolio_current_deployment_fk
  foreign key (current_deployment_id) references deployment(id) on delete set null;

create table export_asset (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  portfolio_id uuid not null,
  kind text not null check (kind in ('pdf', 'deck', 'resume_file')),
  file_url text not null,
  page_format text check (page_format is null or page_format in ('letter', 'a4')),
  download_count integer not null default 0 check (download_count >= 0),
  foreign key (user_id, portfolio_id) references portfolio(user_id, id) on delete cascade,
  unique (user_id, id)
);

-- F. 통계 분석
create table visit_event (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  deployment_id uuid not null,
  session_id text not null,
  referrer text,
  org_domain text,
  is_owner boolean not null default false,
  started_at timestamptz not null default now(),
  foreign key (user_id, deployment_id) references deployment(user_id, id) on delete cascade,
  unique (user_id, id)
);

create table section_view (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  visit_event_id uuid not null,
  portfolio_section_id uuid not null,
  dwell_ms integer not null check (dwell_ms >= 0),
  scroll_depth numeric not null check (scroll_depth between 0 and 1),
  exited boolean not null default false,
  foreign key (user_id, visit_event_id) references visit_event(user_id, id) on delete cascade,
  foreign key (user_id, portfolio_section_id) references portfolio_section(user_id, id) on delete cascade,
  unique (user_id, id)
);

create table conversion_event (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  visit_event_id uuid not null,
  kind text not null check (kind in ('contact_click', 'file_download', 'link_click')),
  target text not null,
  foreign key (user_id, visit_event_id) references visit_event(user_id, id) on delete cascade,
  unique (user_id, id)
);

create table metric_daily (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  deployment_id uuid not null,
  date date not null,
  metric_key text not null,
  value numeric not null,
  sample_size integer not null check (sample_size >= 0),
  foreign key (user_id, deployment_id) references deployment(user_id, id) on delete cascade,
  unique (user_id, deployment_id, date, metric_key),
  unique (user_id, id)
);

create table dashboard_view (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  portfolio_id uuid not null,
  name text not null,
  period text not null check (period in ('7d', '30d', 'all')),
  is_default boolean not null default false,
  foreign key (user_id, portfolio_id) references portfolio(user_id, id) on delete cascade,
  unique (user_id, portfolio_id, name),
  unique (user_id, id)
);

create unique index dashboard_view_one_default_per_portfolio
  on dashboard_view(user_id, portfolio_id)
  where is_default;

create table derived_metric (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  name text not null,
  numerator_key text not null,
  denominator_key text not null,
  check (numerator_key <> denominator_key),
  unique (user_id, name),
  unique (user_id, id)
);

create table widget (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  dashboard_view_id uuid not null,
  metric_key text,
  derived_metric_id uuid references derived_metric(id) on delete set null,
  visualization text not null check (visualization in ('number', 'line', 'bar', 'funnel', 'table')),
  compare_to text check (compare_to is null or compare_to in ('prev_period', 'other_portfolio', 'industry')),
  position jsonb not null check (jsonb_typeof(position) = 'object'),
  foreign key (user_id, dashboard_view_id) references dashboard_view(user_id, id) on delete cascade,
  check ((metric_key is not null)::integer + (derived_metric_id is not null)::integer = 1),
  unique (user_id, id)
);

create table insight (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  deployment_id uuid not null,
  period daterange not null,
  narrative text not null,
  evidence_metrics text[] not null,
  suggestions jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now(),
  foreign key (user_id, deployment_id) references deployment(user_id, id) on delete cascade,
  check (jsonb_typeof(suggestions) = 'array' and jsonb_array_length(suggestions) <= 2),
  unique (user_id, id)
);

create table annotation (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  portfolio_id uuid not null,
  date date not null,
  label text not null,
  note text not null,
  foreign key (user_id, portfolio_id) references portfolio(user_id, id) on delete cascade,
  unique (user_id, id)
);

-- 소유자 우선 조회와 주요 작업 경로를 위한 인덱스
create index record_user_category_idx on record(user_id, category_id);
create index record_link_to_idx on record_link(user_id, to_record_id);
create index job_posting_expires_at_idx on job_posting(expires_at) where expires_at is not null;
create index job_analysis_user_status_idx on job_analysis(user_id, status);
create index brew_user_status_idx on brew(user_id, status);
create index generation_job_user_status_idx on generation_job(user_id, status);
create index portfolio_user_status_idx on portfolio(user_id, status);
create index block_source_record_idx on block(user_id, source_record_id) where source_record_id is not null;
create index deployment_portfolio_idx on deployment(user_id, portfolio_id, version desc);
create index visit_event_deployment_started_idx on visit_event(user_id, deployment_id, started_at desc);
create index metric_daily_lookup_idx on metric_daily(user_id, deployment_id, metric_key, date desc);

