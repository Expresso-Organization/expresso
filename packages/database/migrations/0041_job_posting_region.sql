-- 지역을 거를 수 있게 한다.
--
-- `location`은 출처가 적어 준 글자 그대로다. 그래서 같은 서울이 다섯 가지로
-- 흩어져 있다 — `Seoul, South Korea` 330 · `Seoul` 67 · `SEOUL` 33 ·
-- `South Korea` 43 · `Seoul, Korea` 13. 이 문자열로 필터를 만들면 서울을 눌러도
-- 절반이 빠진다.
--
-- 원문은 그대로 두고 **정규화한 값을 옆 칸에** 둔다. 원문을 고치면 그 공고가
-- 실제로 뭐라고 적혀 있었는지 알 수 없게 된다.
--
-- 읽을 수 없는 표기는 null이다. 모르는 것을 "해외"로 몰면 화면이 거짓을 말한다.

alter table job_posting add column location_region text;

create index job_posting_region_idx on job_posting (location_region)
  where location_region is not null;

-- 직군도 같은 이유로 인덱스를 준다. 06 카테고리 칩이 이 열로 묶는다.
create index job_posting_family_region_idx on job_posting (job_family, location_region)
  where job_family is not null;
