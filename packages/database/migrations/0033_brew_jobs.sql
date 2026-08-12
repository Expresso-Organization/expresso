-- 질문 생성과 레시피 생성을 큐로 옮긴다.
--
-- 둘 다 §8.3 계약을 부르고 실측 1분씩 걸리는데 HTTP 요청 안에서 돌고 있었다.
-- 요청 하나가 커넥션과 워커 스레드를 1분 붙들고, 클라이언트가 끊으면 결과가
-- 통째로 사라지고, 01b·02b가 진행 상태를 보여줄 방법도 없었다.
--
-- `generation_job`이 이미 증명한 모양을 따른다 — 잡 행을 먼저 만들고 결과를
-- 나중에 가리킨다. 도메인 행(`interview_session` · `recipe`)은 **완성된 상태로만**
-- 태어난다. 질문 3개 미만인 세션이나 섹션 없는 레시피는 계약상 존재할 수 없고,
-- 그 불변식을 지키려면 반쯤 만들어진 행을 두면 안 된다.
--
-- 표를 종류별로 나누지 않는다. 잡의 모양이 같고(`JobTypeSchema`가 이미
-- interview · recipe를 알고 있다) 클라이언트가 폴링하는 방식도 같다.

create table brew_job (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  type text not null check (type in ('interview', 'recipe')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed')),
  stage text not null default 'queued',
  attempts integer not null default 0 check (attempts >= 0),
  -- 무엇을 대상으로 도는가. 지금은 `{"brewId": "..."}` 하나뿐이다.
  input jsonb not null check (jsonb_typeof(input) = 'object'),
  -- 끝났을 때 만들어진 것. interview면 세션, recipe면 레시피.
  result_id uuid,
  error_code text,
  failure_retryable boolean,
  input_idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 끝난 잡은 결과를 가리켜야 한다.
  check (status <> 'succeeded' or result_id is not null),
  check (status <> 'failed' or error_code is not null),
  unique (user_id, id)
);

-- 같은 키로 두 번 눌러도 잡은 하나다.
create unique index brew_job_idempotency_unique
  on brew_job(user_id, input_idempotency_key)
  where input_idempotency_key is not null;

create index brew_job_recent_idx on brew_job(user_id, type, created_at desc);
