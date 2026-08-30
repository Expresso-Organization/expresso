-- 계약이 받아 주는 길이를 열이 담지 못한다.
--
-- PostgreSQL 의 text 는 길이 제한이 없어서 옮길 때 모두 text 로 적었는데, MySQL 의
-- text 는 65,535 바이트에서 끊긴다. 한글은 한 글자가 3바이트라 21,845자가 한계다.
-- 계약은 그보다 긴 값을 통과시키므로, 긴 기록이나 긴 공고는 검증을 지나고 나서
-- 데이터베이스에서 거절된다. mediumtext 는 16MB 라 아래 여섯 자리의 상한을 모두
-- 담는다.
--
--   record.body_md                     계약 200,000자
--   answer.transcript                  계약 100,000자
--   answer_record_change.source_quote  계약 100,000자
--   job_posting.description_raw        계약 1,000,000자
--   generated_page.html · css          계약 512KB

alter table `record` modify column `body_md` mediumtext not null default (_utf8mb4'');
alter table `answer` modify column `transcript` mediumtext not null;
alter table `answer_record_change` modify column `source_quote` mediumtext not null;
alter table `job_posting` modify column `description_raw` mediumtext not null;
alter table `generated_page` modify column `html` mediumtext not null;
alter table `generated_page` modify column `css` mediumtext not null;
