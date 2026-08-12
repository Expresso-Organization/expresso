-- 지면(LayoutSpec)에 자리를 준다.
--
-- 지금까지 포트폴리오가 어떻게 그려지는지는 `template.style`이 들고 있었다.
-- 고르는 목록이라 모든 사용자가 같은 지면 열두 개를 나눠 썼다. §8.3의 지면
-- 생성은 **매번 새로 짜는 것**이라 결과를 담을 곳이 따로 필요하다.
--
-- 후보 3안이 각각 한 행이다. 고른 하나에 `selected`가 선다.
-- 포트폴리오 쪽에서 되짚는 열은 두지 않는다 — 그러면 두 표가 서로를 가리켜
-- 사용자를 지울 때 `set null`과 `cascade`가 맞물린다(포트폴리오를 update하려는
-- 순간 이미 지워진 user를 다시 확인하러 간다).

create table layout_spec (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  portfolio_id uuid not null,
  -- 한 번에 나온 후보 3안이 같은 값을 갖는다. 03은 가장 최근 배치를 읽는다.
  -- 시각으로 묶지 않는다 — insert마다 now()가 달라 한 배치가 셋으로 갈린다.
  batch_id uuid not null,
  -- 어느 생성에서 나왔는지. 잡이 지워져도 지면은 남는다.
  generation_job_id uuid references generation_job(id) on delete set null,
  -- 출발점이 된 템플릿. 지금은 비어 있다(§14 Q4 — template은 목록이 아니라 seed).
  seed_template_id uuid references template(id) on delete set null,
  spec jsonb not null check (jsonb_typeof(spec) = 'object'),
  prompt_version integer not null check (prompt_version > 0),
  -- 'ai'는 생성·변형이 낸 것, 'user'는 사람이 직접 고친 것.
  edited_by text not null default 'ai' check (edited_by in ('ai', 'user')),
  -- 같은 배치 안에서의 후보 순서. 03이 이 순서로 나란히 놓는다.
  order_no integer not null default 0 check (order_no >= 0),
  -- 지금 이 포트폴리오가 쓰는 지면.
  selected boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (user_id, portfolio_id) references portfolio(user_id, id) on delete cascade,
  unique (user_id, id)
);

-- 한 포트폴리오가 쓰는 지면은 하나다.
create unique index layout_spec_selected_unique
  on layout_spec(user_id, portfolio_id) where selected;

-- 03은 항상 "가장 최근 배치"를 읽는다.
create index layout_spec_portfolio_recent_idx
  on layout_spec(user_id, portfolio_id, created_at desc, batch_id, order_no);
