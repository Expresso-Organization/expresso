-- 포트폴리오 생성 방법론 v1.
--
-- 원천 자료 -> PortfolioPlan -> StyleSpec + DesignPrinciples -> 지면의 경계를 DB에도
-- 남긴다. 옛 recipe/generated_page는 그대로 읽을 수 있고 새 생성부터 v1 산출물이 붙는다.

create table company_research_item (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  company_id uuid not null references company(id) on delete cascade,
  kind text not null check (kind in ('fact', 'signal')),
  topic text not null check (char_length(topic) between 1 and 100),
  statement text not null check (char_length(statement) between 1 and 2000),
  source_url text,
  published_at timestamptz,
  captured_at timestamptz not null default now(),
  confidence text not null check (confidence in ('low', 'medium', 'high')),
  -- signal이 어떤 fact에서 나왔는지. 배열의 참조 무결성은 같은 사용자·회사 범위에서
  -- 서비스가 검사한다. fact는 반드시 빈 배열이다.
  basis_fact_ids uuid[] not null default '{}',
  check ((kind = 'fact' and source_url is not null and cardinality(basis_fact_ids) = 0)
      or (kind = 'signal' and cardinality(basis_fact_ids) > 0)),
  unique (user_id, id)
);

create index company_research_lookup_idx
  on company_research_item(user_id, company_id, kind, captured_at desc);

alter table recipe
  add column portfolio_plan jsonb
    check (portfolio_plan is null or jsonb_typeof(portfolio_plan) = 'object'),
  add column planning_manifest jsonb
    check (planning_manifest is null or jsonb_typeof(planning_manifest) = 'object');

alter table generation_job
  add column style_overrides jsonb not null default '{}'::jsonb
    check (jsonb_typeof(style_overrides) = 'object');

alter table generated_page
  add column quality_status text not null default 'ready'
    check (quality_status in ('ready', 'failed_qa')),
  add column qa_report jsonb not null default '{"status":"ready","checks":[]}'::jsonb
    check (jsonb_typeof(qa_report) = 'object'),
  add column generation_manifest jsonb not null default '{}'::jsonb
    check (jsonb_typeof(generation_manifest) = 'object'),
  add column portfolio_plan_snapshot jsonb
    check (portfolio_plan_snapshot is null or jsonb_typeof(portfolio_plan_snapshot) = 'object'),
  add column style_spec_snapshot jsonb
    check (style_spec_snapshot is null or jsonb_typeof(style_spec_snapshot) = 'object'),
  add column design_principles_version integer not null default 1
    check (design_principles_version > 0);

comment on table company_research_item is
  '사용자별 회사 조사 결과. 출처가 있는 fact와 fact에서 유도한 signal을 분리한다.';
comment on column recipe.portfolio_plan is
  '공고·회사 조사·사용자 근거에서 확정한 PortfolioPlan v1 스냅샷.';
comment on column generated_page.generation_manifest is
  '모델·프롬프트·도구·토큰·비용을 재현하기 위한 호출 원장.';
