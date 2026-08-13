-- 본문 읽기를 수집에서 떼어 낸다.
--
-- 한 잡이던 것이 둘이 된다. 성질이 다르기 때문이다 —
--
--   `job_ingest`    HTTP 몇 번. 다섯 곳을 훑어 새 공고를 들인다. 초 단위.
--   `posting_facts` 공고 하나당 모델 한 번. 급여 · 경력 · 근무 형태를 읽는다. 분 단위.
--
-- 묶여 있으면 **느린 쪽이 빠른 쪽을 붙잡는다.** 모델이 죽은 날에는 공고 목록도
-- 갱신되지 않았고, 반대로 본문 읽기가 밀려도 그게 수집 실패로 보였다.
--
-- 나누면 목록은 즉시 최신이 되고 급여 · 경력은 뒤따라 채워진다. 화면은 아직
-- 안 읽은 칸을 "아직 뽑지 않았습니다"로 정직하게 말할 수 있다.

alter table scheduled_job_definition
  drop constraint scheduled_job_definition_job_key_check;

alter table scheduled_job_definition
  add constraint scheduled_job_definition_job_key_check check (
    job_key = any (array[
      'saved_searches', 'expire_postings', 'notification_batch',
      'analytics_daily', 'deletion_grace', 'retention',
      'job_ingest', 'posting_facts'
    ])
  );

-- 10분. 한 번에 25건을 집어가므로(실측: 4레인에서 공고당 10초 남짓 → 3~4분)
-- 자기 간격 안에 끝나 겹쳐 돌지 않고, 하루치 수집 백여 건을 한 시간쯤에 따라잡는다.
insert into scheduled_job_definition (job_key, interval_seconds, next_run_at)
values ('posting_facts', 600, now())
on conflict (job_key) do nothing;
