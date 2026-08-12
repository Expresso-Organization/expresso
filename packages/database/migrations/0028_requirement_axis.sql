-- 요건에 축을 붙인다.
--
-- 일치도(§8.1)는 축별 충족 내역을 보여주는데, 지금은 그 축이
-- `job_posting.requirements` jsonb(기술·규모·역할·조건 문자열 배열)에서만 나온다.
-- 요건 행에는 축이 없어서 목록 점수와 06b 요건 대조가 서로 다른 자리에서
-- 계산된다. 축을 요건에 붙이면 두 읽기가 하나로 합쳐진다.
--
-- 분류는 §8.3 공고 분석 계약이 한다. **애매하면 넣지 않는다** — 억지로
-- 넣는 것보다 축 게이지에서 빠지는 쪽이 낫고, 총점은 요건 전체의 충족률이라
-- 축이 없어도 영향받지 않는다.

alter table job_posting_requirement
  add column axis text
    check (axis in ('technology', 'impact', 'role', 'conditions'));

create index job_posting_requirement_axis_idx
  on job_posting_requirement(job_posting_id, axis)
  where axis is not null;
