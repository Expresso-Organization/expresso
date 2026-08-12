-- 공고 본문에서 연봉 · 경력 · 근무 형태를 읽어 담는다.
--
-- 0024가 `salary_note` · `work_type` 열을 만들어 두었지만 **아무도 쓰지
-- 않았다.** 수집의 insert 열 목록에 없었고 분석은 `requirements`만 갱신했다.
-- 그 사이 화면은 빈 칸마다 "적혀 있지 않음"이라고 말하고 있었는데, 모아 둔
-- 162건 중 연봉이 본문에 적힌 것이 25건, 근무 형태가 39건, 경력이 131건이었다.
-- 우리가 안 읽은 것을 공고가 안 적은 것처럼 말하고 있었다.

alter table job_posting
  -- 본문에서 읽은 경력 요건("5년 이상"). ATS가 준 `experience_label`
  -- ("경력" · "신입/경력")은 분류지 연차가 아니라서 따로 둔다 — 출처가 준
  -- 값을 우리가 읽은 값으로 덮어쓰지 않는다.
  add column experience_note text,
  -- 본문을 훑어 본 시각.
  --
  -- 이게 없으면 화면이 빈 칸을 두고 "안 적혀 있다"와 "아직 안 읽었다"를
  -- 구분할 수 없다. 값이 null인 것과 뜻이 다르다: 읽었는데 못 찾은 것도
  -- 값은 null이다.
  add column facts_read_at timestamptz;

comment on column job_posting.facts_read_at is
  '본문에서 연봉·경력·근무 형태를 훑어 본 시각. null이면 아직 훑지 않았다.';

-- 아직 훑지 않은 공고를 수집이 이어서 집어간다.
create index job_posting_facts_pending_idx on job_posting(created_at)
  where facts_read_at is null;
