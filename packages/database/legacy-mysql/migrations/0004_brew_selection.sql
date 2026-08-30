-- 후보가 있는 제작 세션은 선택된 재료를 적어도 하나 남긴다.
--
-- PostgreSQL 에서는 트랜잭션 끝에 확인하는 지연 제약 트리거였다. MySQL 에는
-- 지연 검사가 없어 행마다 즉시 본다. 그래서 재료를 바꾸는 쪽은 「고를 것을 먼저
-- 켜고 나머지를 끈다」 순서로 적는다 — 중간에 선택이 0이 되지 않는다.
create trigger brew_source_keep_selection_update after update on brew_source for each row
  if not new.is_selected
     and exists (select 1 from brew_source where user_id = new.user_id and brew_id = new.brew_id)
     and not exists (
       select 1 from brew_source
       where user_id = new.user_id and brew_id = new.brew_id and is_selected
     )
  then signal sqlstate '45000'
    set message_text = 'a brew with material candidates must keep at least one selected source';
  end if;

create trigger brew_source_keep_selection_delete after delete on brew_source for each row
  if exists (select 1 from brew_source where user_id = old.user_id and brew_id = old.brew_id)
     and not exists (
       select 1 from brew_source
       where user_id = old.user_id and brew_id = old.brew_id and is_selected
     )
  then signal sqlstate '45000'
    set message_text = 'a brew with material candidates must keep at least one selected source';
  end if;
