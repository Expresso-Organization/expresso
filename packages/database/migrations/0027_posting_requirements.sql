-- 요건을 공고 단위로 올린다.
--
-- 공고가 뭘 요구하는지는 **누가 읽든 같다**. 사람마다 다른 건 그 요건에 내
-- 기록이 닿는지(커버리지)뿐이다. 그런데 `requirement`가 `user_id`로 묶여 있어
-- 같은 공고를 열 사람이 보면 추출이 열 번 돌았다. 목록 화면이 공고 10건에
-- 점수를 매기려면 그것만으로 추출 10회가 필요했다.
--
-- `requirement` → `job_posting_requirement`(전역) + `requirement_coverage`(사용자별).

-- ── 공고의 요건 ───────────────────────────────────────────────────────

create table job_posting_requirement (
  id uuid primary key default gen_random_uuid(),
  job_posting_id uuid not null references job_posting(id) on delete cascade,
  order_no integer not null check (order_no >= 0),
  label text not null,
  kind text not null check (kind in ('must', 'nice', 'tone')),
  source_span jsonb not null check (jsonb_typeof(source_span) = 'object'),
  -- 추출기를 갈아 끼우면 이 값이 오르고, 그때만 다시 뽑는다.
  extractor_version integer not null default 1 check (extractor_version > 0),
  extracted_at timestamptz not null default now()
);

-- 순서에 unique를 걸지 않는다. 재추출은 지우고 다시 넣는데, 중간 상태에서
-- 걸리면 교체가 막힌다.
create index job_posting_requirement_posting_idx
  on job_posting_requirement(job_posting_id, order_no);

-- ── 그 요건에 내 기록이 닿는가 ────────────────────────────────────────

create table requirement_coverage (
  user_id uuid not null references "user"(id) on delete cascade,
  requirement_id uuid not null
    references job_posting_requirement(id) on delete cascade,
  coverage text not null check (coverage in ('covered', 'partial', 'missing')),
  covered_by uuid[] not null default '{}',
  computed_at timestamptz not null default now(),
  primary key (user_id, requirement_id)
);

create index requirement_coverage_user_idx on requirement_coverage(user_id);

-- ── 옮기기 ────────────────────────────────────────────────────────────
-- 같은 공고를 여러 사람이 해석했으면 (라벨, 종류)가 같은 것을 한 줄로 모은다.

with deduped as (
  select distinct on (job_analysis.job_posting_id, requirement.label, requirement.kind)
    job_analysis.job_posting_id,
    requirement.label,
    requirement.kind,
    requirement.source_span
  from requirement
  join job_analysis on job_analysis.id = requirement.job_analysis_id
  where job_analysis.job_posting_id is not null
  order by
    job_analysis.job_posting_id, requirement.label, requirement.kind, requirement.id
),
numbered as (
  select
    deduped.*,
    row_number() over (
      partition by job_posting_id
      order by (source_span ->> 'start')::integer, label
    ) - 1 as order_no
  from deduped
)
insert into job_posting_requirement (job_posting_id, order_no, label, kind, source_span)
select job_posting_id, order_no, label, kind, source_span from numbered;

insert into requirement_coverage (user_id, requirement_id, coverage, covered_by)
select distinct on (requirement.user_id, job_posting_requirement.id)
  requirement.user_id,
  job_posting_requirement.id,
  requirement.coverage,
  requirement.covered_by
from requirement
join job_analysis on job_analysis.id = requirement.job_analysis_id
join job_posting_requirement
  on job_posting_requirement.job_posting_id = job_analysis.job_posting_id
  and job_posting_requirement.label = requirement.label
  and job_posting_requirement.kind = requirement.kind
order by requirement.user_id, job_posting_requirement.id, requirement.id;

-- ── 질문이 가리키던 요건을 새 행으로 옮긴다 ───────────────────────────
-- 요건에 주인이 없어졌으므로 "같은 사용자 소유" 검사도 함께 걷어낸다.

drop trigger question_requirement_owner on question;
alter table question drop constraint question_requirement_id_fkey;

update question
set requirement_id = mapped.new_id
from (
  select
    requirement.id as legacy_id,
    job_posting_requirement.id as new_id
  from requirement
  join job_analysis on job_analysis.id = requirement.job_analysis_id
  join job_posting_requirement
    on job_posting_requirement.job_posting_id = job_analysis.job_posting_id
    and job_posting_requirement.label = requirement.label
    and job_posting_requirement.kind = requirement.kind
) as mapped
where question.requirement_id = mapped.legacy_id;

-- 옮길 자리를 못 찾은 질문은 근거를 끊는다. 없는 요건을 가리키게 두지 않는다.
update question
set requirement_id = null
where requirement_id is not null
  and not exists (
    select 1 from job_posting_requirement where id = question.requirement_id
  );

alter table question
  add constraint question_requirement_id_fkey
  foreign key (requirement_id)
  references job_posting_requirement(id) on delete set null;

-- ── 근거 구간 검사 ────────────────────────────────────────────────────
-- 공고 원문은 불변이다. 요건이 가리키는 구간이 원문과 글자까지 같은지
-- DB가 직접 본다. 사용자를 거치지 않으므로 예전보다 조인이 하나 줄었다.

drop trigger requirement_source_span_exact on requirement;
drop function validate_requirement_source_span();

create function validate_posting_requirement_span()
returns trigger
language plpgsql
as $$
declare
  source_text text;
  span_start integer;
  span_end integer;
  span_quote text;
begin
  select description_raw into source_text
  from job_posting where id = new.job_posting_id;

  if source_text is null then
    raise exception 'requirement source is unavailable';
  end if;
  span_start := (new.source_span ->> 'start')::integer;
  span_end := (new.source_span ->> 'end')::integer;
  span_quote := new.source_span ->> 'quote';
  if span_start < 0
    or span_end <= span_start
    or span_end - span_start <> char_length(span_quote)
    or substring(source_text from span_start + 1 for span_end - span_start) <> span_quote
  then
    raise exception 'requirement source span does not match immutable posting source';
  end if;
  return new;
end;
$$;

create trigger posting_requirement_span_exact
before insert or update of source_span, job_posting_id on job_posting_requirement
for each row execute function validate_posting_requirement_span();

drop table requirement;
