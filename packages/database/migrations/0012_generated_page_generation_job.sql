-- 자유 HTML 생성 작업과 그 결과 판을 직접 연결한다.
-- 옛 판은 연결 없이 그대로 읽을 수 있고, 새 작업만 정확한 한 판을 가진다.
alter table `generated_page`
  add column `generation_job_id` char(36) null after `portfolio_id`,
  add unique key `generated_page_generation_job_unique` (`generation_job_id`),
  add key `generated_page_user_job_idx` (`user_id`, `generation_job_id`),
  add constraint `generated_page_generation_job_id_fkey`
    foreign key (`generation_job_id`) references `generation_job` (`id`)
    on delete set null;
