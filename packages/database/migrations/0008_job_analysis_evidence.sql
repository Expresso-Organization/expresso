alter table job_analysis
  add column progress_stage text not null default 'queued'
    check (progress_stage in ('queued', 'extracting', 'validating', 'covering', 'done', 'failed')),
  add column attempts integer not null default 0 check (attempts >= 0),
  add column result_version integer not null default 0 check (result_version >= 0),
  add column target_version integer not null default 1 check (target_version > 0),
  add column failure_code text,
  add column failure_retryable boolean;

create table job_analysis_history (
  job_analysis_id uuid primary key references job_analysis(id) on delete cascade,
  user_id uuid not null references "user"(id) on delete cascade,
  previous_version integer not null check (previous_version > 0),
  requirements jsonb not null check (jsonb_typeof(requirements) = 'array'),
  archived_at timestamptz not null default now(),
  unique (user_id, job_analysis_id)
);

create function validate_requirement_source_span()
returns trigger
language plpgsql
as $$
declare
  source_text text;
  span_start integer;
  span_end integer;
  span_quote text;
begin
  select job_posting.description_raw into source_text
  from job_analysis
  join job_posting on job_posting.id = job_analysis.job_posting_id
  where job_analysis.id = new.job_analysis_id
    and job_analysis.user_id = new.user_id;

  if source_text is null then
    raise exception 'requirement analysis source is unavailable';
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

create trigger requirement_source_span_exact
before insert or update of source_span, job_analysis_id, user_id on requirement
for each row execute function validate_requirement_source_span();
