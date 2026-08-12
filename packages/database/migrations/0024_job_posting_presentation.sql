-- 공고 화면(00b · 06 · 06b)이 그리는 값에 자리를 준다.
-- 지금까지 `job_posting`은 제목 · 원문 · 요구사항 jsonb만 가지고 있어서
-- "서울 강남 · 리모트 혼합" 한 줄도, 06b의 사실 표도 낼 수 없었다.

alter table job_posting
  add column location text,
  add column work_type text,
  add column experience_label text,
  add column employment_type text,
  add column salary_note text,
  -- 06 카테고리 칩("백엔드 · 데이터", "플랫폼 · 인프라")이 이걸로 묶인다.
  add column job_family text,
  add column duties jsonb not null default '[]'::jsonb
    check (jsonb_typeof(duties) = 'array'),
  add column preferred jsonb not null default '[]'::jsonb
    check (jsonb_typeof(preferred) = 'array'),
  add column hiring_process jsonb not null default '[]'::jsonb
    check (jsonb_typeof(hiring_process) = 'array'),
  add column process_note text,
  add column notice text;

create index job_posting_job_family_idx on job_posting(job_family)
  where job_family is not null;

-- 공고 원문 불변 규칙은 그대로다. 위 열은 표시용이라 정정할 수 있어야 하고,
-- `prevent_job_posting_source_mutation`이 잠그는 목록에도 들어가지 않는다.

alter table company
  -- 카드 이니셜 아바타의 지면 · 글자색. 정의서가 회사마다 정해 둔 값이다.
  add column avatar_background text
    check (avatar_background ~ '^#[0-9A-Fa-f]{6}$'),
  add column avatar_color text
    check (avatar_color ~ '^#[0-9A-Fa-f]{6}$'),
  -- 06b 톤 카드는 색을 순서대로 보여준다. `tone_palette`(객체)는 템플릿
  -- 스타일이 쓰므로 건드리지 않고, 표시용 순서 배열을 따로 둔다.
  -- CHECK에는 서브쿼리를 쓸 수 없어 배열을 이어붙여 한 번에 검사한다.
  add column brand_colors text[] not null default '{}'::text[]
    check (
      coalesce(array_length(brand_colors, 1), 0) <= 6
      and array_to_string(brand_colors, ',') ~ '^(#[0-9A-Fa-f]{6}(,|$))*$'
    ),
  -- `tone_summary`가 "공고 말투", 이쪽이 "인상"이다.
  add column tone_impression text;
