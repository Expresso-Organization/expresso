-- 인용이 남아 있는 기록은 지우지 못한다.
--
-- PostgreSQL 에서는 record_usage → record 외래 키의 RESTRICT 가 하던 일이다.
-- MySQL 은 연쇄 삭제를 행마다 즉시 확인해서, 계정을 지울 때 이 RESTRICT 가
-- 걸린다. 그래서 외래 키는 cascade 로 두고 규칙은 여기서 본다 — 계정이 이미
-- 사라진 뒤(연쇄 삭제)라면 막지 않는다.
create trigger record_usage_blocks_delete before delete on record for each row
  if exists (select 1 from record_usage where record_id = old.id)
     and exists (select 1 from `user` where id = old.user_id)
  then signal sqlstate '45000'
    set message_text = 'record is still quoted by a portfolio block';
  end if;
