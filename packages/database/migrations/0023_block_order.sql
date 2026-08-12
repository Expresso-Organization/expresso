-- block에는 순서 열이 없어서 생성·배포·편집이 모두 `order by block.id`로 읽고
-- 있었다. id는 gen_random_uuid()라 생성기가 정한 문장 순서가 그대로 사라진다.
-- 섹션 안의 순서를 명시적으로 저장한다.

alter table block
  add column order_no integer not null default 0 check (order_no >= 0);

-- 기존 행은 지금까지 쓰던 순서(id)를 그대로 굳힌다.
with ordered as (
  select id, row_number() over (
    partition by user_id, portfolio_section_id order by id
  ) - 1 as position
  from block
)
update block
set order_no = ordered.position
from ordered
where block.id = ordered.id;

-- 유일 제약은 두지 않는다. 에디터에서 두 블록의 순서를 맞바꿀 때
-- 중간 상태가 잠깐 겹치는데, 지연 제약 없이는 그 교환이 막힌다.
create index block_section_order_idx
  on block(user_id, portfolio_section_id, order_no, id);
