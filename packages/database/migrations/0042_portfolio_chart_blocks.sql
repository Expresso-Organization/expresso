-- 지면이 그릴 수 있는 것에 **그림**을 더한다.
--
-- 지금까지 블록은 글자뿐이었다. 큰 숫자 셋을 나란히 놓는 것과 그 셋을 막대로
-- 견주는 것은 다른 정보인데, 뒤엣것을 담을 자리가 없었다.
--
-- 그림은 이미지가 아니다 — 근거의 수치만으로 서고 렌더러가 SVG로 그린다.
-- 그래서 자산 업로드가 없어도 지면에 그림이 선다.
--
-- content는 `PortfolioChartSchema` 모양이다:
--   {"visualization":"bar","caption":"…","unit":"분","points":[{"label":"…","value":24}]}

alter table block drop constraint block_kind_check;

alter table block
  add constraint block_kind_check
  check (kind in ('heading', 'paragraph', 'list', 'metric', 'chart', 'media'));

-- 그림에 적힌 수도 기록에서 나와야 한다. metric에 이미 걸려 있던 것과 같은 규율이다.
alter table block drop constraint block_check;

alter table block
  add constraint block_check
  check (kind not in ('metric', 'chart') or source_record_id is not null or sync_state = 'detached');

comment on column block.content is
  '블록의 내용. heading·paragraph는 {"text"}, list는 {"items"}, metric은 {"value","label"}, chart는 그림 정의({"visualization","caption","points"}).';
