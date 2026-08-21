-- 대시보드 뷰 여섯 개 제한을 다시 건다.
--
-- PostgreSQL 은 세기 전에 포트폴리오 한 줄을 잠가 차례를 만들었지만, MySQL
-- 트리거는 바깥 문장이 이미 쓰고 있는 표를 잠그지 못한다(기본 뷰는 portfolio 를
-- 읽어 넣는다). 그래서 세기만 한다 — 동시에 들어온 두 요청 중 하나는 유니크
-- 키에서 걸린다.
drop trigger dashboard_view_limit_insert;

create trigger dashboard_view_limit_insert before insert on dashboard_view for each row
  if (select count(*) from dashboard_view
      where user_id = new.user_id and portfolio_id = new.portfolio_id) >= 6
  then signal sqlstate '45000' set message_text = 'a portfolio can have at most 6 dashboard views';
  end if;
