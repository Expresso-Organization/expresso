-- 공고 수집.
--
-- 지금까지 `job_posting.source`는 'api'·'partner'를 담을 수 있는데 넣는 코드가
-- 없었고, 실제로 들어온 공고는 전부 `user_input`이거나 시드였다. 어디서 모아
-- 오는지를 적어 두는 자리가 이 표다.
--
-- **원문은 고칠 수 없다**(0002 `job_posting_source_immutable`). 요건의 근거
-- 구간이 원문의 문자 위치를 가리키므로, 원문이 바뀌면 이미 뽑아 둔 근거가
-- 딴 곳을 가리킨다. 그래서 재수집은 **새 공고만 넣고 이미 있는 것은 건드리지
-- 않는다**(만료 시각은 예외 — 그 칸은 근거가 아니다).

create table job_source (
  id uuid primary key default gen_random_uuid(),
  -- 어느 방식으로 읽는가. 어댑터 이름이다.
  provider text not null check (provider in ('greenhouse', 'lever', 'ashby', 'work24')),
  -- 그 방식 안에서 이 출처를 가리키는 값. Greenhouse면 board token이다.
  token text not null,
  -- 화면에 그리는 이름. `job_posting.source_board`로 그대로 간다.
  display_name text not null,
  is_active boolean not null default true,
  last_run_at timestamptz,
  last_status text check (last_status is null or last_status in ('succeeded', 'failed')),
  -- 실패한 이유를 한 줄로. 화면이 "왜 안 모였나"를 말할 수 있어야 한다.
  last_error text,
  -- 마지막 수집에서 본 공고 수와 그중 새로 들어온 수.
  last_seen_count integer not null default 0 check (last_seen_count >= 0),
  last_added_count integer not null default 0 check (last_added_count >= 0),
  created_at timestamptz not null default now(),
  unique (provider, token)
);

create index job_source_active_idx on job_source (provider, token) where is_active;

-- 매일 아침 한 번. 공고는 하루에 몇 번씩 바뀌는 것이 아니다.
alter table scheduled_job_definition drop constraint scheduled_job_definition_job_key_check;

alter table scheduled_job_definition add constraint scheduled_job_definition_job_key_check
  check (job_key in (
    'saved_searches', 'expire_postings', 'notification_batch',
    'analytics_daily', 'deletion_grace', 'retention', 'job_ingest'
  ));

insert into scheduled_job_definition (job_key, interval_seconds, next_run_at)
values ('job_ingest', 86400, now())
on conflict (job_key) do nothing;
