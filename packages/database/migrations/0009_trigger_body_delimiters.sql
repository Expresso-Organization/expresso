-- 문장 하나짜리 트리거 본문을 begin · end 로 감싼다.
--
-- MySQL 은 본문이 어디서 끝나는지 알 수 없을 때 뒤에 붙은 세미콜론까지 본문으로
-- 저장한다. 그렇게 저장된 트리거를 mysqldump 로 받으면 주석 닫는 자리가 어긋나
-- 복원이 그 줄에서 멈춘다 — 백업이 있어도 되돌릴 수 없다는 뜻이다. begin 과 end
-- 사이는 경계가 분명해서 그 일이 일어나지 않는다.
--
-- if · end if 로 끝나는 본문은 이미 경계가 있어 그대로 둔다.

drop trigger `block_touches_portfolio_insert`;
create trigger `block_touches_portfolio_insert` after insert on `block` for each row
begin
  update portfolio set updated_at = now(6)
  where id = (select portfolio_id from portfolio_section where id = new.portfolio_section_id);
end;

drop trigger `block_touches_portfolio_update`;
create trigger `block_touches_portfolio_update` after update on `block` for each row
begin
  update portfolio set updated_at = now(6)
  where id = (select portfolio_id from portfolio_section where id = new.portfolio_section_id);
end;

drop trigger `block_touches_portfolio_delete`;
create trigger `block_touches_portfolio_delete` after delete on `block` for each row
begin
  update portfolio set updated_at = now(6)
  where id = (select portfolio_id from portfolio_section where id = old.portfolio_section_id);
end;

drop trigger `portfolio_section_touches_portfolio_insert`;
create trigger `portfolio_section_touches_portfolio_insert` after insert on `portfolio_section` for each row
begin
  update portfolio set updated_at = now(6) where id = new.portfolio_id;
end;

drop trigger `portfolio_updated_at_on_update`;
create trigger `portfolio_updated_at_on_update` before update on `portfolio` for each row
begin
  set new.updated_at = now(6);
end;

drop trigger `category_version_on_update`;
create trigger `category_version_on_update` before update on `category` for each row
begin
  set new.version = old.version + 1, new.updated_at = now(6);
end;

drop trigger `record_version_on_update`;
create trigger `record_version_on_update` before update on `record` for each row
begin
  set new.version = old.version + 1, new.updated_at = now(6);
end;

drop trigger `record_delete_detaches_blocks`;
create trigger `record_delete_detaches_blocks` before delete on `record` for each row
begin
  update block set source_record_id = null, sync_state = 'detached'
  where user_id = old.user_id and source_record_id = old.id;
end;
