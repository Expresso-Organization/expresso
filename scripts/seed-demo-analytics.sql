-- 데모 포트폴리오에 배포와 방문 기록을 심는다.
--
-- 07 분석 화면과 §8.3 분석 해설 계약은 실제 방문 집계가 있어야 돈다. 해설은
-- 표본 30건 미만이면 아예 나오지 않으므로(§8.3) 그 문턱을 넘길 만큼 심는다.
--
-- 시각은 **지금을 기준으로** 거슬러 잡는다. 고정 날짜로 심으면 며칠만 지나도
-- 7일 · 30일 화면이 비어 버린다.
--
-- 값은 그럴듯하게 흩뿌리되 규칙이 있다 — 뒤 섹션일수록 도달이 줄고, 체류는
-- 두 번째 섹션에 몰리고, 방문은 최근으로 올수록 잦아진다. 해설이 "무엇이
-- 갈렸는지"를 말할 거리가 있어야 한다.
--
-- 심은 뒤 집계가 필요하다. 07의 "지금 집계"를 누르거나 워커의 analytics_daily를
-- 기다린다 — 방문은 원본이고 타일의 수는 집계에서 온다.
--
-- 실행: psql "$DATABASE_URL" -f scripts/seed-demo-analytics.sql

begin;

-- 배포의 snapshot은 고쳐 쓸 수 없다(트리거가 막는다) — 배포는 그때의 사본이니까.
-- 다시 심을 때는 배포를 지우고 새로 만든다. 방문 기록도 함께 딸려 나간다.
delete from deployment where subdomain = 'demo-analytics';

with demo as (
  select p.user_id, p.id as portfolio_id
  from portfolio p join "user" u on u.id = p.user_id
  where u.email = 'demo@expresso.local'
  order by p.created_at desc limit 1
),
deployed as (
  insert into deployment (
    user_id, portfolio_id, version, subdomain, seo_indexable,
    contact_visibility, published_at, snapshot
  )
  select demo.user_id, demo.portfolio_id, 1, 'demo-analytics', true, 'on_request',
         now() - interval '30 days',
         jsonb_build_object('sections', coalesce((
           select jsonb_agg(jsonb_build_object('id', s.id) order by s.order_no)
           from portfolio_section s where s.portfolio_id = demo.portfolio_id
         ), '[]'::jsonb))
  from demo
  returning id, user_id, portfolio_id
)
-- 공개된 포트폴리오만 방문을 받는다. 배포를 심었으면 여기도 맞춰 둔다.
update portfolio set current_deployment_id = deployed.id, status = 'published'
from deployed where portfolio.id = deployed.portfolio_id;

-- 48번의 방문. 최근으로 올수록 잦아지고(제곱으로 당긴다), 링크드인이 절반을
-- 넘고, 여덟 번에 한 번은 기업 도메인에서 온다.
with deployed as (
  select id, user_id from deployment where subdomain = 'demo-analytics'
),
visits as (
  insert into visit_event (
    user_id, deployment_id, session_id, referrer, org_domain, is_owner,
    started_at, completed, duration_ms
  )
  select deployed.user_id, deployed.id, 'demo-session-' || n,
         case n % 5 when 0 then null
                    when 1 then 'https://github.com'
                    else 'https://www.linkedin.com' end,
         case when n % 8 = 0 then 'toss.im'
              when n % 11 = 0 then 'daangn.com' else null end,
         false,
         -- (48-n)^2 / 80 일 전 — n=1이면 27일 전, n=48이면 오늘.
         now() - (((48 - n) * (48 - n) / 80) || ' days')::interval
               - ((n % 20) || ' hours')::interval,
         -- 넷 중 하나만 끝까지 읽는다.
         n % 4 = 0,
         30000 + (n % 7) * 12000
  from deployed, generate_series(1, 48) as n
  -- 두 번 심어도 방문이 두 배가 되지 않게. 세션 이름이 곧 열쇠다.
  where not exists (
    select 1 from visit_event
    where visit_event.deployment_id = deployed.id
      and visit_event.session_id = 'demo-session-' || n
  )
  returning id, user_id, session_id, started_at
),
numbered as (
  -- RETURNING에는 윈도 함수를 쓸 수 없다. 세션 이름에 심어 둔 번호를 되꺼낸다.
  select id, user_id, started_at,
         split_part(session_id, '-', 3)::integer as seq
  from visits
),
sections as (
  select s.id, row_number() over (order by s.order_no) as position
  from portfolio_section s
  join deployment d on d.portfolio_id = s.portfolio_id
  where d.subdomain = 'demo-analytics'
)
-- 뒤 섹션일수록 도달이 줄고, 두 번째 섹션에 체류가 몰린다.
insert into section_view (
  user_id, visit_event_id, portfolio_section_id, dwell_ms, scroll_depth, exited, occurred_at
)
select visits.user_id, visits.id, sections.id,
       -- 두 번째 섹션은 1~2분, 나머지는 20~40초. 사람이 글 한 덩이를 읽는 시간.
       case when sections.position = 2 then 62000 + (visits.seq % 5) * 14000
            else 21000 + (visits.seq % 4) * 6000 end,
       0.6 + (visits.seq % 4) * 0.1,
       sections.position = (select max(position) from sections),
       visits.started_at + '30 seconds'::interval
from numbered as visits join sections on true
where visits.seq % (sections.position + 1) <> 0;

-- 여섯 번은 연락처를 눌렀다. 07의 전환 타일이 셀 것이 있어야 한다.
insert into conversion_event (user_id, visit_event_id, kind, target, occurred_at)
select visit_event.user_id, visit_event.id, 'contact_click', 'mailto:demo@expresso.local',
       visit_event.started_at + '4 minutes'::interval
from visit_event
where visit_event.session_id like 'demo-session-%'
  and split_part(visit_event.session_id, '-', 3)::integer % 8 = 3
  and not exists (
    select 1 from conversion_event
    where conversion_event.visit_event_id = visit_event.id
      and conversion_event.kind = 'contact_click'
  );

commit;
