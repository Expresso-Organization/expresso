-- 06b 머리글이 그리는 나머지 세 조각.
-- "뱅크샐러드 · 데이터플랫폼팀 · 채용 시 마감" 한 줄과 "원티드 · 2일 전 등록"
-- 배지가 각각 팀 · 마감 문구 · 수집처를 필요로 한다.

alter table job_posting
  add column team text,
  -- 마감일이 없는 공고도 화면에는 "채용 시 마감"처럼 이유가 적힌다.
  add column deadline_note text,
  -- `source`가 api/partner/user_input이라 어느 채용 사이트에서 왔는지는 못 담는다.
  add column source_board text;
