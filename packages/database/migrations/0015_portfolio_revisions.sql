alter table portfolio_section
  add column hidden_reason text;

alter table revision
  add column proposal_id uuid,
  add column reverted_revision_id uuid references revision(id) on delete set null,
  add column change_kind text not null default 'edit'
    check (change_kind in ('edit', 'revert', 'restore')),
  add column summary text not null default 'portfolio changed',
  add column created_at timestamptz not null default now();

create table portfolio_edit_proposal (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  portfolio_id uuid not null,
  target_path text not null,
  block_id uuid not null,
  operation text not null check (operation in ('update_text', 'set_style', 'insert_record')),
  before_state jsonb not null check (jsonb_typeof(before_state) = 'object'),
  after_state jsonb not null check (jsonb_typeof(after_state) = 'object'),
  source_record_id uuid,
  status text not null default 'pending' check (status in ('pending', 'applied', 'rejected', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '1 hour',
  applied_at timestamptz,
  foreign key (user_id, portfolio_id) references portfolio(user_id, id) on delete cascade,
  foreign key (user_id, block_id) references block(user_id, id) on delete cascade,
  foreign key (user_id, source_record_id) references record(user_id, id) on delete restrict,
  unique (user_id, id)
);

alter table revision
  add constraint revision_proposal_fk
    foreign key (proposal_id) references portfolio_edit_proposal(id) on delete set null;

create index portfolio_edit_proposal_pending_idx
  on portfolio_edit_proposal(user_id, portfolio_id, status, expires_at);
