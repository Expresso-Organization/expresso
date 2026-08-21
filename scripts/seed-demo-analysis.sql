-- 06b 자격 요건 대조를 위한 공고 해석 시드.
--
-- 요건은 **공고에 붙는다**(`job_posting_requirement`). 사람마다 다른 건 그
-- 요건에 내 기록이 닿는지(`requirement_coverage`)뿐이다.
--
-- 요건의 `source_span`은 DB 트리거가 원문과 글자까지 같은지 검사한다. 그래서
-- 인용을 손으로 적지 않고 `position()`으로 원문에서 찾아 넣는다 — 라벨이
-- 원문에 없으면 여기서 바로 터진다. 그게 이 제품이 지키려는 규칙이다.
--
-- 실행:
--   docker exec -i expresso-local-mysql-1 mysql -uexpresso -pexpresso expresso \
--     -v ON_ERROR_STOP=1 -f - < scripts/seed-demo-analysis.sql

begin;

delete from job_analysis
where user_id = (select id from "user" where email = 'demo@expresso.local')
  and job_posting_id = (
    select id from job_posting where dedupe_hash = 'demo-job-banksalad-pipeline'
  );

insert into job_analysis (
  user_id, job_posting_id, input_type, status, progress_stage,
  analyzed_at, result_version
)
select u.id, p.id, 'url', 'done', 'done', now() - interval '40 minutes', 1
from "user" u, job_posting p
where u.email = 'demo@expresso.local'
  and p.dedupe_hash = 'demo-job-banksalad-pipeline';

delete from job_posting_requirement
where job_posting_id = (
  select id from job_posting where dedupe_hash = 'demo-job-banksalad-pipeline'
);

with seeded as (
  select
    p.id as job_posting_id,
    u.id as user_id,
    seed.order_no, seed.label, seed.kind, seed.coverage, seed.covering
  from job_posting p
  cross join "user" u
  cross join (values
  -- 자격 요건 — 5개 중 3개 충족.
  (0, '데이터 엔지니어링 또는 관련 분야 3년 이상', 'must', 'covered',
   array['야간 배치 파이프라인 안정화']),
  (1, 'SQL 및 Python · Java · Scala 중 하나에 숙련', 'must', 'covered',
   array['데이터 품질 모니터링 자동화']),
  (2, '대용량 ETL / ELT 파이프라인 설계 · 운영 경험', 'must', 'covered',
   array['정산 스케줄러 재설계']),
  (3, 'Airflow 등 워크플로우 운영 경험', 'must', 'partial',
   array['적재 파이프라인 재설계']),
  (4, 'Kafka · Flink 기반 스트리밍 처리 경험', 'must', 'missing',
   array[]::text[]),
  -- 우대 사항 — 06b가 항목마다 있음 / 약함 / 없음을 붙인다.
  (5, '금융권 데이터 프로젝트 수행 경험', 'nice', 'partial',
   array['정산 스케줄러 재설계']),
  (6, 'CDC(Debezium) 기반 실시간 동기화', 'nice', 'missing', array[]::text[]),
  (7, 'MLOps 파이프라인 구축 · 자동화', 'nice', 'missing', array[]::text[]),
  (8, '데이터 거버넌스 · 문서화 이해', 'nice', 'covered',
   array['데이터 품질 모니터링 자동화'])
  ) as seed(order_no, label, kind, coverage, covering)
  where u.email = 'demo@expresso.local'
    and p.dedupe_hash = 'demo-job-banksalad-pipeline'
),
inserted as (
  insert into job_posting_requirement (
    job_posting_id, order_no, label, kind, source_span
  )
  select
    seeded.job_posting_id, seeded.order_no, seeded.label, seeded.kind,
    jsonb_build_object(
      'start', position(seeded.label in p.description_raw) - 1,
      'end', position(seeded.label in p.description_raw) - 1 + char_length(seeded.label),
      'quote', seeded.label
    )
  from seeded
  join job_posting p on p.id = seeded.job_posting_id
  returning id, order_no
)
insert into requirement_coverage (user_id, requirement_id, coverage, covered_by)
select
  seeded.user_id, inserted.id, seeded.coverage,
  coalesce(
    (
      select array_agg(record.id)
      from record
      where record.user_id = seeded.user_id
        and record.deleted_at is null
        and record.title = any(seeded.covering)
    ),
    '{}'::uuid[]
  )
from seeded
join inserted on inserted.order_no = seeded.order_no;

commit;
