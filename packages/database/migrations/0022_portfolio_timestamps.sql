-- 포트폴리오 목록은 "마지막 편집" 순서로 보여야 하는데(화면 정의서 00 · 08b)
-- portfolio에는 정렬에 쓸 시각이 없었다. record·category와 같은 방식으로 채운다.

alter table portfolio
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();

create index portfolio_user_updated_idx
  on portfolio(user_id, updated_at desc, id desc);

create function maintain_portfolio_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger portfolio_updated_at_on_update
before update on portfolio
for each row execute function maintain_portfolio_updated_at();

-- 블록·섹션을 고쳐도 포트폴리오가 "편집됨"으로 올라와야 한다.
create function touch_portfolio_from_section()
returns trigger
language plpgsql
as $$
declare
  target_portfolio uuid;
begin
  target_portfolio := coalesce(new.portfolio_id, old.portfolio_id);
  update portfolio set updated_at = now() where id = target_portfolio;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger portfolio_section_touches_portfolio
after insert or update or delete on portfolio_section
for each row execute function touch_portfolio_from_section();

create function touch_portfolio_from_block()
returns trigger
language plpgsql
as $$
declare
  target_section uuid;
begin
  target_section := coalesce(new.portfolio_section_id, old.portfolio_section_id);
  update portfolio
  set updated_at = now()
  where id = (
    select portfolio_id from portfolio_section where id = target_section
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger block_touches_portfolio
after insert or update or delete on block
for each row execute function touch_portfolio_from_block();
