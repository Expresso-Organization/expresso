-- MySQL 은 insert 와 update 를 한 트리거에 묶지 못한다. 0003 에서 넣을 때만 보던
-- 규칙에 고칠 때도 보는 짝을 세운다.
create trigger answer_record_change_exact_source_update before update on answer_record_change for each row
  if not exists (select 1 from answer where id = new.answer_id and user_id = new.user_id
                   and instr(transcript, new.source_quote) > 0)
  then signal sqlstate '45000' set message_text = 'record change source must be an exact answer transcript span';
  end if;

create trigger brew_source_candidate_guard_update before update on brew_source for each row
  if not exists (select 1 from brew where id = new.brew_id and user_id = new.user_id)
     or not exists (select 1 from record where id = new.record_id and user_id = new.user_id
                      and deleted_at is null and status in ('organized', 'verified'))
  then signal sqlstate '45000' set message_text = 'brew source must be an active organized record owned by the brew owner';
  end if;

create trigger brew_source_selected_limit_update before update on brew_source for each row
  if new.is_selected and not old.is_selected
     and (select count(*) from brew_source
          where user_id = new.user_id and brew_id = new.brew_id and is_selected and id <> new.id) >= 10
  then signal sqlstate '45000' set message_text = 'a brew can select at most 10 sources';
  end if;

create trigger question_replacement_owner_update before update on question for each row
  if new.replaced_from_id is not null
     and not exists (select 1 from question where id = new.replaced_from_id and user_id = new.user_id)
  then signal sqlstate '45000' set message_text = 'replaced_from_id must reference a question owned by the same user';
  end if;

create trigger revision_block_owner_update before update on revision for each row
  if new.block_id is not null
     and not exists (select 1 from block where id = new.block_id and user_id = new.user_id)
  then signal sqlstate '45000' set message_text = 'block_id must reference a block owned by the same user';
  end if;

create trigger widget_derived_metric_owner_update before update on widget for each row
  if new.derived_metric_id is not null
     and not exists (select 1 from derived_metric where id = new.derived_metric_id and user_id = new.user_id)
  then signal sqlstate '45000' set message_text = 'derived_metric_id must reference a derived_metric owned by the same user';
  end if;

create trigger category_view_category_scope_update before update on category_view for each row
  if not exists (select 1 from category where id = new.category_id and (user_id is null or user_id = new.user_id))
  then signal sqlstate '45000' set message_text = 'category must be a system category or belong to the view owner';
  end if;

create trigger widget_metric_choice_update before update on widget for each row
  if (new.metric_key is not null) + (new.derived_metric_id is not null) <> 1
  then signal sqlstate '45000' set message_text = 'a widget needs exactly one of metric_key or derived_metric_id';
  end if;

create trigger block_metric_source_update before update on block for each row
  if new.kind in ('metric', 'chart') and new.source_record_id is null and new.sync_state <> 'detached'
  then signal sqlstate '45000' set message_text = 'metric and chart blocks need a source record';
  end if;

-- 블록과 문서 섹션이 바뀌면 포트폴리오의 고친 시각도 함께 움직인다.
create trigger block_touches_portfolio_insert after insert on block for each row
  update portfolio set updated_at = now(6)
  where id = (select portfolio_id from portfolio_section where id = new.portfolio_section_id);

create trigger block_touches_portfolio_update after update on block for each row
  update portfolio set updated_at = now(6)
  where id = (select portfolio_id from portfolio_section where id = new.portfolio_section_id);

create trigger block_touches_portfolio_delete after delete on block for each row
  update portfolio set updated_at = now(6)
  where id = (select portfolio_id from portfolio_section where id = old.portfolio_section_id);

create trigger portfolio_section_touches_portfolio_insert after insert on portfolio_section for each row
  update portfolio set updated_at = now(6) where id = new.portfolio_id;

create trigger portfolio_section_touches_portfolio_update after update on portfolio_section for each row
  update portfolio set updated_at = now(6) where id = new.portfolio_id;
