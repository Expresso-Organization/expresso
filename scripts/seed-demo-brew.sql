-- 데모 brew에 재료를 붙인다.
--
-- 데모 데이터는 화면을 그리려고 심은 것이라 `brew_source`가 비어 있었다.
-- 02 재료 고르기가 하는 일을 대신 해 둔다 — 레시피 · 추출 · 지면 계약은
-- 여기서부터 실제로 돌아간다.
--
-- 레시피 자체는 심지 않는다. §8.3 레시피 생성 계약이 만든다.
--
-- 실행: psql "$DATABASE_URL" -f scripts/seed-demo-brew.sql

begin;

with demo as (
  select u.id as user_id, b.id as brew_id
  from "user" u
  join brew b on b.user_id = u.id
  where u.email = 'demo@expresso.local'
  order by b.created_at
  limit 1
),
-- 순서가 곧 우선순위다. 수치와 기간이 있는 기록을 앞에 둔다.
ranked (record_title, rank, reason) as (
  values
    ('정산 스케줄러 재설계',                   0, '일 1,200만 건 — 처리 규모를 보여준다'),
    ('야간 배치 파이프라인 안정화',            1, '기간과 결과가 함께 있다'),
    ('데이터 품질 모니터링 자동화',            2, '자동화 범위가 드러난다'),
    ('로그 없는 시스템에서 원인을 좁혀간 3일', 3, '문제 해결 과정이 보인다'),
    ('적재 파이프라인 재설계',                 4, '직무와 바로 맞닿는다'),
    ('신입 두 명을 동시에 온보딩한 두 달',     5, '협업을 보여주는 유일한 기록')
)
insert into brew_source (
  user_id, brew_id, record_id, rank, selected_by, score, reason_text, is_selected
)
select demo.user_id, demo.brew_id, record.id, ranked.rank, 'auto',
       10 - ranked.rank, ranked.reason, true
from demo
join ranked on true
join record on record.user_id = demo.user_id and record.title = ranked.record_title
-- 정리되지 않은 기록은 재료가 될 수 없다(`validate_brew_source_candidate`).
-- 데모에는 초안 상태 기록이 섞여 있고, 05 화면이 그 상태를 보여주므로
-- 여기서 상태를 바꾸지 않고 **고를 수 있는 것만** 고른다.
  and record.status in ('organized', 'verified')
  and record.deleted_at is null
on conflict (user_id, brew_id, record_id) do update
  set rank = excluded.rank,
      reason_text = excluded.reason_text,
      is_selected = true;

commit;
