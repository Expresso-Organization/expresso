-- 경력을 숫자로도 갖는다.
--
-- `experience_note`는 사람이 읽는 말이다 — `10년 이상` · `3~8년` · `신입~2년`.
-- 화면에 그대로 보여주기에는 좋은데 **거를 수가 없다.** 06 필터에서 "내 경력으로
-- 지원할 수 있는 공고"를 고르려면 `요구 최소 연차 <= 내 연차`를 물어야 하고,
-- 그건 숫자여야 한다.
--
-- ## 왜 생성 열인가
--
-- 값을 따로 채우면 언젠가 갈린다 — 본문 읽기가 `experience_note`를 고쳤는데
-- 숫자를 안 고치는 경로가 하나만 생겨도 화면이 다른 말을 하기 시작한다.
-- 생성 열은 **갈릴 수가 없다.** 원본이 바뀌면 Postgres가 같이 고친다.
--
-- ## 무엇을 읽나
--
-- 적힌 첫 숫자가 곧 요구하는 **최소** 연차다. `10년 이상`도 `10~12년`도 10이다.
-- `신입`이 들어 있으면 0이다 — `신입~2년`에서 첫 숫자만 보면 2가 되는데, 그건
-- 신입이 지원할 수 있는 자리를 신입에게 안 보여주는 셈이 된다.
--
-- 숫자가 없으면 null이다. 모아 둔 158건 중 139건에 경력이 적혀 있고 135건이
-- 숫자로 읽힌다. 못 읽는 4건은 ATS가 `경력`이라고만 적어 둔 것들로, 실제로
-- 연차를 말하지 않는다 — 짐작해 채우지 않는다.

alter table job_posting
  add column experience_min_years integer
    generated always as (
      case
        when coalesce(experience_note, experience_label) is null then null
        when coalesce(experience_note, experience_label) like '%신입%' then 0
        else nullif(substring(coalesce(experience_note, experience_label) from '\d+'), '')::integer
      end
    ) stored;

comment on column job_posting.experience_min_years is
  '요구하는 최소 연차. experience_note에서 읽은 값이며 없으면 null. 신입이 들어 있으면 0.';

-- 06 필터가 `experience_min_years <= N`으로 훑는다.
create index job_posting_experience_years_idx on job_posting (experience_min_years)
  where experience_min_years is not null;
