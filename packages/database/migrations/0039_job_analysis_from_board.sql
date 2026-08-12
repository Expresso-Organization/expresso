-- 게시판에 모아 둔 공고를 내 분석으로 가져오는 경로가 생겼다.
--
-- `input_type`은 이 분석이 **어디서 왔는지**를 적는 자리다. url · paste · file은
-- 사용자가 공고를 직접 들고 온 경우고, 모아 둔 공고를 고른 것은 그 셋 어디에도
-- 해당하지 않는다. 없는 값을 쓰면 계정 내보내기가 거짓을 말한다.

alter table job_analysis drop constraint job_analysis_input_type_check;

alter table job_analysis add constraint job_analysis_input_type_check
  check (input_type = any (array['url', 'paste', 'file', 'board']));
