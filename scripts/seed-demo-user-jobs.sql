-- 데모 계정에 붙는 공고 데이터: 일치도 · 관심 · 해석 · 요건.
--
-- 공고 자체는 전역(`scripts/seed-demo-jobs.sql`)이고, 이 파일은 사람마다
-- 달라지는 부분만 심는다. 값은 화면 정의서 00b · 06 · 06b가 그리는 것과 같다.
--
-- 실행:
--   docker exec -i expresso-local-mysql-1 mysql -uexpresso -pexpresso expresso \
--     -v ON_ERROR_STOP=1 -f - < scripts/seed-demo-user-jobs.sql

begin;

-- 06b 요건 대조가 가리키는 기록. 이미 있으면 두고, 없는 것만 만든다.
insert into record (user_id, category_id, title, body_md, properties, status, origin)
select u.id, c.id, seed.title, seed.body, '{}'::jsonb, 'organized', 'manual'
from "user" u
join category c on c.key = 'experience' and c.is_system
cross join (values
  ('정산 스케줄러 재설계',
   E'매일 도는 정산 스케줄러를 다시 만들었습니다. 일 1,200만 건을 처리합니다.\n큐로 나눠 처리하도록 바꾸고 재처리 절차를 문서로 남겼습니다.'),
  ('야간 배치 파이프라인 안정화',
   E'2025년 3월부터 6월까지 야간 배치가 자주 멈췄습니다.\n알림 기준을 다시 세우고 재적재 절차를 만들어 실패율을 줄였습니다.'),
  ('데이터 품질 모니터링 자동화',
   E'이상 감지 규칙을 세우고 매일 아침 리포트가 자동으로 오게 만들었습니다.')
) as seed(title, body)
where u.email = 'demo@expresso.local'
  and not exists (
    select 1 from record
    where record.user_id = u.id and record.title = seed.title
      and record.deleted_at is null
  );

-- ── 일치도 ────────────────────────────────────────────────────────────
-- 축은 요구 건수와 충족 건수만 담는다. 배점은 없다 (§8.1).
-- `matched`/`missing`이 카드의 기술 칩을 가르므로, 정의서가 비어 있다고
-- 표시한 기술만 missing에 둔다.

-- 총점은 축의 합에서만 나온다. 시드가 숫자를 따로 적으면 어긋날 수 있어
-- SQL에서 계산한다 (§8.1).
insert into match_score (
  user_id, job_posting_id, total, axes, reason_text, next_action, computed_at
)
select
  u.id, p.id,
  round(
    100.0
    * (select sum((axis.value ->> 'covered')::numeric)
       from jsonb_each(seed.axes::jsonb) as axis)
    / nullif((select sum((axis.value ->> 'required')::numeric)
              from jsonb_each(seed.axes::jsonb) as axis), 0)
  ),
  seed.axes::jsonb, seed.reason, seed.next_action,
  now() - interval '1 hour'
from "user" u
join (values
  ('demo-job-toss-data',
   '{"technology": {"required": 3, "covered": 3, "matched": ["Airflow", "dbt", "Spark"], "missing": []}, "impact": {"required": 1, "covered": 1, "matched": ["일 3천만 건"], "missing": []}, "role": {"required": 1, "covered": 1, "matched": ["백엔드 엔지니어"], "missing": []}, "conditions": {"required": 1, "covered": 0, "matched": [], "missing": ["리모트 혼합"]}}',
   '기록 7건이 그대로 맞습니다 · 추가 질문 없음', '가장 관련 있는 기록을 포트폴리오 재료로 검토하세요.'),
  ('demo-job-banksalad-pipeline',
   '{"technology": {"required": 10, "covered": 6, "matched": ["Airflow", "Spark", "dbt", "BigQuery", "Python", "Terraform"], "missing": ["Kafka", "Flink", "Kotlin", "Kubernetes"]}, "impact": {"required": 1, "covered": 1, "matched": ["대용량 ETL"], "missing": []}, "role": {"required": 1, "covered": 1, "matched": ["데이터 엔지니어"], "missing": []}, "conditions": {"required": 1, "covered": 1, "matched": ["리모트 주 2일"], "missing": []}}',
   'Kafka 항목만 비어 있음 · 질문 3개로 채울 수 있습니다', 'Kafka나 Flink로 큐를 처리한 기록을 추가하세요.'),
  ('demo-job-line-platform',
   '{"technology": {"required": 2, "covered": 1, "matched": ["Spark"], "missing": ["Kafka"]}, "impact": {"required": 1, "covered": 1, "matched": ["글로벌 규모"], "missing": []}, "role": {"required": 1, "covered": 1, "matched": ["데이터 엔지니어"], "missing": []}, "conditions": {"required": 1, "covered": 1, "matched": ["리모트 가능"], "missing": []}}',
   'Kafka만 비어 있습니다', 'Kafka를 실제로 사용한 기록을 추가하세요.'),
  ('demo-job-toss-core',
   '{"technology": {"required": 2, "covered": 2, "matched": ["Kotlin", "대용량"], "missing": []}, "impact": {"required": 1, "covered": 1, "matched": ["대용량 정산"], "missing": []}, "role": {"required": 1, "covered": 1, "matched": ["백엔드 엔지니어"], "missing": []}, "conditions": {"required": 1, "covered": 0, "matched": [], "missing": ["출근"]}}',
   '적재 파이프라인 기록이 규모 요구와 맞습니다', '정산 규모를 적은 기록의 근거를 보강하세요.'),
  ('demo-job-naver-platform',
   '{"technology": {"required": 2, "covered": 1, "matched": ["Spark"], "missing": ["Hadoop"]}, "impact": {"required": 1, "covered": 1, "matched": ["페타바이트"], "missing": []}, "role": {"required": 1, "covered": 1, "matched": ["데이터 엔지니어"], "missing": []}, "conditions": {"required": 1, "covered": 0, "matched": [], "missing": ["출근"]}}',
   '리모트 조건과 어긋남 · 규모 · 스택은 잘 맞습니다', 'Hadoop을 다뤄 본 기록이 있다면 추가하세요.'),
  ('demo-job-coupang-infra',
   '{"technology": {"required": 2, "covered": 1, "matched": ["온콜"], "missing": ["IaC"]}, "impact": {"required": 0, "covered": 0, "matched": [], "missing": []}, "role": {"required": 1, "covered": 1, "matched": ["플랫폼 엔지니어"], "missing": []}, "conditions": {"required": 1, "covered": 0, "matched": [], "missing": ["출근"]}}',
   '온콜 기록은 있으나 IaC 근거가 얕습니다', 'IaC로 배포를 자동화한 기록을 보강하세요.'),
  ('demo-job-daangn-community',
   '{"technology": {"required": 2, "covered": 1, "matched": ["Kubernetes"], "missing": ["Go"]}, "impact": {"required": 1, "covered": 1, "matched": ["하루 수천만 건"], "missing": []}, "role": {"required": 1, "covered": 1, "matched": ["백엔드 엔지니어"], "missing": []}, "conditions": {"required": 1, "covered": 1, "matched": ["리모트 일부"], "missing": []}}',
   '언어 경험이 다르지만 규모는 맞습니다', 'Go로 만든 것이 있다면 기록으로 남기세요.'),
  ('demo-job-rainist-settlement',
   '{"technology": {"required": 2, "covered": 2, "matched": ["Kotlin", "Airflow"], "missing": []}, "impact": {"required": 1, "covered": 1, "matched": ["정산 스케줄러"], "missing": []}, "role": {"required": 1, "covered": 1, "matched": ["백엔드 엔지니어"], "missing": []}, "conditions": {"required": 1, "covered": 1, "matched": ["리모트 가능"], "missing": []}}',
   '정산 스케줄러 경험이 요구사항과 직접 겹칩니다', '정산 규모를 수치로 남기세요.'),
  ('demo-job-musinsa-de',
   '{"technology": {"required": 1, "covered": 1, "matched": ["BigQuery"], "missing": []}, "impact": {"required": 0, "covered": 0, "matched": [], "missing": []}, "role": {"required": 1, "covered": 1, "matched": ["데이터 엔지니어"], "missing": []}, "conditions": {"required": 1, "covered": 0, "matched": [], "missing": ["출근"]}}',
   '품질 모니터링 기록이 직접 겹칩니다', '지표 개선 폭을 수치로 남기세요.'),
  ('demo-job-kakao-platform',
   '{"technology": {"required": 2, "covered": 1, "matched": ["MSA"], "missing": ["Java"]}, "impact": {"required": 0, "covered": 0, "matched": [], "missing": []}, "role": {"required": 1, "covered": 1, "matched": ["플랫폼 엔지니어"], "missing": []}, "conditions": {"required": 0, "covered": 0, "matched": [], "missing": []}}',
   '연차와 언어가 모두 어긋납니다', 'Java로 만든 것이 있다면 기록으로 남기세요.'),
  ('demo-job-kurly-de',
   '{"technology": {"required": 2, "covered": 1, "matched": ["Spark"], "missing": ["Iceberg"]}, "impact": {"required": 0, "covered": 0, "matched": [], "missing": []}, "role": {"required": 1, "covered": 1, "matched": ["데이터 엔지니어"], "missing": []}, "conditions": {"required": 1, "covered": 1, "matched": ["주 2일 재택"], "missing": []}}',
   'Iceberg 미기록 · 나머지 요구는 충족', 'Iceberg를 다뤄 본 기록을 추가하세요.'),
  ('demo-job-watcha-platform',
   '{"technology": {"required": 2, "covered": 1, "matched": ["Terraform"], "missing": ["Kubernetes"]}, "impact": {"required": 0, "covered": 0, "matched": [], "missing": []}, "role": {"required": 1, "covered": 1, "matched": ["플랫폼 엔지니어"], "missing": []}, "conditions": {"required": 1, "covered": 1, "matched": ["리모트"], "missing": []}}',
   '인프라 비중이 높아 기록 보강이 많이 필요합니다', 'Kubernetes 운영 기록을 추가하세요.'),
  ('demo-job-yard-server',
   '{"technology": {"required": 2, "covered": 1, "matched": ["Postgres"], "missing": ["Go"]}, "impact": {"required": 0, "covered": 0, "matched": [], "missing": []}, "role": {"required": 1, "covered": 1, "matched": ["백엔드 엔지니어"], "missing": []}, "conditions": {"required": 1, "covered": 0, "matched": [], "missing": ["출근"]}}',
   '리모트 조건과 어긋나고 언어 경험이 다릅니다', 'Go로 만든 것이 있다면 기록으로 남기세요.')
) as seed(dedupe_hash, axes, reason, next_action) on true
join job_posting p on p.dedupe_hash = seed.dedupe_hash
where u.email = 'demo@expresso.local'
on conflict (user_id, job_posting_id) do update set
  total = excluded.total,
  axes = excluded.axes,
  reason_text = excluded.reason_text,
  next_action = excluded.next_action,
  computed_at = excluded.computed_at;

-- ── 관심 공고 ─────────────────────────────────────────────────────────
-- 06 우측 레일의 세 건이다.

insert into interest (user_id, job_posting_id, stage, deadline_at, memo)
select u.id, p.id, seed.stage, p.expires_at, seed.memo
from "user" u
join (values
  ('demo-job-toss-core', 'saved', '포트폴리오 준비됨'),
  ('demo-job-daangn-community', 'saved', '질문 더 답하기'),
  ('demo-job-banksalad-pipeline', 'saved', '아직 시작 안 함')
) as seed(dedupe_hash, stage, memo) on true
join job_posting p on p.dedupe_hash = seed.dedupe_hash
where u.email = 'demo@expresso.local'
on conflict (user_id, job_posting_id) do update set
  stage = excluded.stage, memo = excluded.memo, updated_at = now();

commit;
