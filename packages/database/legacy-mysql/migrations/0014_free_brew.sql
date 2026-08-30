-- 공고 없이 사용자가 직접 정한 제목과 방향으로 만드는 제작을 저장한다.
alter table `job_analysis`
  drop check `job_analysis_input_type_check`;

alter table `job_analysis`
  add constraint `job_analysis_input_type_check`
    check ((`input_type` in ('url', 'paste', 'file', 'board', 'free')));

alter table `brew`
  add column `free_title` varchar(300) null after `job_analysis_id`,
  add column `free_brief` text null after `free_title`;
