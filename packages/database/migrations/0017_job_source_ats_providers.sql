-- 국내 스타트업이 가장 많이 쓰는 ATS는 그리팅(greetinghr)이다. Workable도 같은
-- 성격의 공개 보드다. 둘 다 인증이 없고 본문이 통째로 온다.
--
-- `provider` 체크가 네 값만 허용하고 있어 새 출처를 넣을 수 없었다. 값 목록을
-- 늘린다 — 어댑터가 없는 값을 막는 일은 `JobIngestService.addSource`가 이미
-- 한다(422). 여기서는 어댑터가 있는 것만 통과시키면 된다.
alter table `job_source` drop check `job_source_provider_check`;
alter table `job_source` add constraint `job_source_provider_check`
  check ((`provider` in ('greenhouse', 'lever', 'ashby', 'workable', 'greeting', 'work24')));
