-- 데모 공고 시드.
--
-- 내용은 화면 정의서(`docs/Expresso Screens.dc.html`)의 00b · 06 · 06b에서
-- 그대로 가져왔다. 화면을 실제 API로 돌리면서도 정의서와 같은 지면을 보려면
-- DB에 같은 값이 들어 있어야 한다.
--
-- 실행:
--   docker exec -i expresso-local-postgres-1 psql -U expresso -d expresso \
--     -v ON_ERROR_STOP=1 -f - < scripts/seed-demo-jobs.sql
--
-- `demo@expresso.local` 계정이 있어야 일치도 · 관심 · 해석이 함께 심긴다.

begin;

-- ── 회사 ──────────────────────────────────────────────────────────────
-- 아바타 색은 정의서가 회사마다 정해 둔 값이다. 같은 회사가 00b와 06에서
-- 다른 색으로 그려진 곳이 있는데(네이버 · 라인), 회사 행은 하나뿐이라
-- 00b 쪽 값을 기준으로 삼는다.

insert into company (
  name, domain, industry, dedupe_key, initial,
  avatar_background, avatar_color, brand_colors, tone_summary, tone_impression
) values
  ('토스', 'toss.im', '핀테크', 'demo-toss', 'T',
   '#EEF2FC', '#2A48B8', '{"#1B2A4A","#2E7CF6","#EFF2F6"}',
   '짧고 단정한 문장 · 숫자로 말함', '빠르게 만들고 빠르게 고칩니다'),
  ('뱅크샐러드', 'banksalad.com', '핀테크', 'demo-banksalad', 'B',
   '#E9F3FB', '#1E63A9', '{"#1B2A4A","#2E7CF6","#EFF2F6"}',
   '담백 · 사실 위주', '정확 · 신뢰'),
  ('네이버', 'navercorp.com', '플랫폼', 'demo-naver', 'N',
   '#E8F1EC', '#2C6B4F', '{"#03C75A","#16223A","#F3F5F7"}',
   '차분한 설명체', '오래 가는 것을 만듭니다'),
  ('레이니스트', 'rainist.com', '핀테크', 'demo-rainist', 'L',
   '#F1EDE4', '#7A6A3F', '{"#7A6A3F","#16223A","#F1EDE4"}',
   '친근한 존댓말', '돈 이야기를 쉽게'),
  ('컬리', 'kurly.com', '커머스', 'demo-kurly', 'C',
   '#EFF2F7', '#35455F', '{"#5F0080","#16223A","#F5F0F7"}',
   '단정한 설명체', '기준을 지킵니다'),
  ('왓챠', 'watcha.com', '미디어', 'demo-watcha', 'W',
   '#F5EEF0', '#8A3A55', '{"#FF0558","#16223A","#F7EEF1"}',
   '취향을 말하는 어투', '좋아하는 것을 아는 사람'),
  ('당근', 'daangn.com', '커뮤니티', 'demo-daangn', 'D',
   '#FBEEE4', '#9A4030', '{"#FF6F0F","#16223A","#F3F0EA"}',
   '담백한 존댓말 · 과장 없음', '만든 것을 보여주는 사람을 찾습니다'),
  ('쿠팡', 'coupang.com', '커머스', 'demo-coupang', 'C',
   '#FCEDEA', '#B03A25', '{"#B03A25","#16223A","#FCEDEA"}',
   '지표 중심 · 영어 혼용', '규모를 감당해 본 사람'),
  ('무신사', 'musinsa.com', '커머스', 'demo-musinsa', 'M',
   '#F1F2F5', '#2C3038', '{"#2C3038","#16223A","#F1F2F5"}',
   '군더더기 없는 문장', '취향과 숫자를 같이 봅니다'),
  ('카카오', 'kakaocorp.com', '플랫폼', 'demo-kakao', 'K',
   '#FBF4E2', '#8A6412', '{"#FEE500","#16223A","#FBF4E2"}',
   '친근한 설명체', '함께 오래 일할 사람'),
  ('라인', 'linecorp.com', '플랫폼', 'demo-line', 'L',
   '#EAF6EE', '#1E7A45', '{"#06C755","#16223A","#EAF6EE"}',
   '정중한 존댓말', '글로벌 규모를 다뤄 본 사람'),
  ('야드', 'yard.example', '물류', 'demo-yard', 'Y',
   '#F7EFE9', '#8A5A33', '{"#8A5A33","#16223A","#F7EFE9"}',
   '현장 중심의 말투', '직접 굴려 본 사람')
on conflict (dedupe_key) do update set
  initial = excluded.initial,
  avatar_background = excluded.avatar_background,
  avatar_color = excluded.avatar_color,
  brand_colors = excluded.brand_colors,
  tone_summary = excluded.tone_summary,
  tone_impression = excluded.tone_impression,
  domain = excluded.domain,
  industry = excluded.industry;

-- ── 공고 ──────────────────────────────────────────────────────────────
-- `description_raw`는 불변이라 한 번 들어가면 고칠 수 없다. 06b가 근거 구간을
-- 글자 위치로 하이라이트하므로 원문은 정의서의 문장을 그대로 담는다.

insert into job_posting (
  company_id, source, source_board, title, team, description_raw, requirements,
  location, work_type, experience_label, employment_type, salary_note,
  job_family, duties, preferred, hiring_process, process_note, notice,
  expires_at, deadline_note, dedupe_hash, created_at
)
select
  company.id, 'partner', seed.source_board, seed.title, seed.team,
  seed.description_raw, seed.requirements::jsonb,
  seed.location, seed.work_type, seed.experience_label,
  seed.employment_type, seed.salary_note, seed.job_family,
  seed.duties::jsonb, seed.preferred::jsonb, seed.hiring_process::jsonb,
  seed.process_note, seed.notice,
  case when seed.days_left is null then null else now() + (seed.days_left || ' days')::interval end,
  seed.deadline_note, seed.dedupe_hash, now() - (seed.age_minutes || ' minutes')::interval
from (values
  -- 06b 공고 상세의 그 공고.
  ('demo-banksalad', '원티드', '데이터 파이프라인 엔지니어 (Streaming · Batch)', '데이터플랫폼팀',
   E'뱅크샐러드 데이터플랫폼팀에서 함께할 데이터 엔지니어를 찾습니다.\n\n[주요 업무]\nKafka · Flink 기반 실시간 데이터 파이프라인 개발과 운영\n앱 로그와 주요 이벤트 데이터의 수집 · 가공 파이프라인 품질 관리\nAirflow 기반 배치 파이프라인 설계 및 개발\nPython · SQL 기반 적재 · 변환 로직 구현과 데이터 마트 설계\n데이터 정합성 보장, 온콜 대응, 파이프라인 효율 개선\n\n[자격 요건]\n데이터 엔지니어링 또는 관련 분야 3년 이상\nSQL 및 Python · Java · Scala 중 하나에 숙련\n대용량 ETL / ELT 파이프라인 설계 · 운영 경험\nAirflow 등 워크플로우 운영 경험\nKafka · Flink 기반 스트리밍 처리 경험\n\n[우대 사항]\n금융권 데이터 프로젝트 수행 경험\nCDC(Debezium) 기반 실시간 동기화\nMLOps 파이프라인 구축 · 자동화\n데이터 거버넌스 · 문서화 이해',
   '{"technologies":["Kafka","Flink","Airflow","Spark","dbt","BigQuery","Python","Kotlin","Terraform","Kubernetes"],"impacts":["대용량 ETL"],"roles":["데이터 엔지니어"],"conditions":["리모트 주 2일"]}',
   '서울 강남', '리모트 주 2일', '3년 이상', '정규직 · 수습 3개월', '8,000만 – 1억 1,000만',
   '백엔드 · 데이터',
   '[{"group":"Streaming Data Engineering","items":["Kafka · Flink 기반 실시간 데이터 파이프라인 개발과 운영","앱 로그와 주요 이벤트 데이터의 수집 · 가공 파이프라인 품질 관리"]},{"group":"Batch Data Engineering","items":["Airflow 기반 배치 파이프라인 설계 및 개발","Python · SQL 기반 적재 · 변환 로직 구현과 데이터 마트 설계"]},{"group":"운영과 개선","items":["데이터 정합성 보장, 온콜 대응, 파이프라인 효율 개선"]}]',
   '["금융권 데이터 프로젝트 수행 경험","CDC(Debezium) 기반 실시간 동기화","MLOps 파이프라인 구축 · 자동화","데이터 거버넌스 · 문서화 이해"]',
   '["서류 전형","직무 · 기술 인터뷰","컬처핏 인터뷰","처우 협의 · 입사"]', '평균 3주',
   '수습 3개월 후 정규직 전환 평가가 있으며 수습 기간 임금은 전액 지급됩니다 · 국가유공자 및 장애인은 관계 법령에 따라 우대합니다',
   null, '채용 시 마감', 'demo-job-banksalad-pipeline', 2880),

  -- 00b AI 검색 결과의 나머지 아홉 건.
  ('demo-toss', '원티드', '백엔드 엔지니어 (데이터)', '데이터플랫폼팀',
   E'토스 데이터플랫폼팀에서 적재 파이프라인을 만듭니다.\nAirflow · dbt · Spark로 배치를 운영하고 지연을 줄입니다.',
   '{"technologies":["Airflow","dbt","Spark"],"impacts":["일 3천만 건"],"roles":["백엔드 엔지니어"],"conditions":["리모트 혼합"]}',
   '서울 강남', '리모트 혼합', '5년 이상', '정규직', '면접 후 협의', '백엔드 · 데이터',
   '[]', '[]', '[]', null, null, 9, null, 'demo-job-toss-data', 4320),
  ('demo-naver', '잡코리아', '데이터 플랫폼 개발', '데이터플랫폼',
   E'네이버 데이터플랫폼에서 대규모 적재와 조회를 맡습니다.\nHadoop과 Spark로 페타바이트 규모를 다룹니다.',
   '{"technologies":["Hadoop","Spark"],"impacts":["페타바이트"],"roles":["데이터 엔지니어"],"conditions":["출근"]}',
   '분당', '출근', '경력', '정규직', '면접 후 협의', '백엔드 · 데이터',
   '[]', '[]', '[]', null, null, 14, null, 'demo-job-naver-platform', 5760),
  ('demo-rainist', '원티드', '서버 개발자 (정산)', '정산팀',
   E'레이니스트 정산팀에서 정산 스케줄러를 다시 만듭니다.\nKotlin과 Airflow로 매일의 정산을 책임집니다.',
   '{"technologies":["Kotlin","Airflow"],"impacts":["정산 스케줄러"],"roles":["백엔드 엔지니어"],"conditions":["리모트 가능"]}',
   '서울', '리모트 가능', '3년 이상', '정규직', '면접 후 협의', '백엔드 · 데이터',
   '[]', '[]', '[]', null, null, 6, null, 'demo-job-rainist-settlement', 7200),
  ('demo-kurly', '링크드인', '데이터 엔지니어', '데이터프로덕트팀',
   E'컬리 데이터프로덕트팀에서 적재와 모델링을 맡습니다.\nSpark와 Iceberg로 테이블을 관리합니다.',
   '{"technologies":["Spark","Iceberg"],"impacts":[],"roles":["데이터 엔지니어"],"conditions":["주 2일 재택"]}',
   '서울', '주 2일 재택', '3년 이상', '정규직', '면접 후 협의', '백엔드 · 데이터',
   '[]', '[]', '[]', null, null, 21, null, 'demo-job-kurly-de', 8640),
  ('demo-watcha', '원티드', '플랫폼 엔지니어', '플랫폼팀',
   E'왓챠 플랫폼팀에서 배포와 운영 기반을 만듭니다.\nKubernetes와 Terraform으로 인프라를 코드로 다룹니다.',
   '{"technologies":["Kubernetes","Terraform"],"impacts":[],"roles":["플랫폼 엔지니어"],"conditions":["리모트"]}',
   '서울', '리모트', '3년 이상', '정규직', '면접 후 협의', '플랫폼 · 인프라',
   '[]', '[]', '[]', null, null, 11, null, 'demo-job-watcha-platform', 10080),
  ('demo-yard', '잡코리아', '서버 개발자 (물류)', '물류개발팀',
   E'야드 물류개발팀에서 창고 시스템을 만듭니다.\nGo와 Postgres로 현장의 흐름을 다룹니다.',
   '{"technologies":["Go","Postgres"],"impacts":[],"roles":["백엔드 엔지니어"],"conditions":["출근"]}',
   '성수', '출근', '3년 이상', '정규직', '면접 후 협의', '백엔드 · 데이터',
   '[]', '[]', '[]', null, null, null, '상시 채용', 'demo-job-yard-server', 11520),

  -- 06 공고 탐색에만 있는 네 건.
  ('demo-toss', '원티드', '백엔드 엔지니어 (Core Banking)', '코어뱅킹팀',
   E'토스 코어뱅킹팀에서 대용량 정산 시스템을 만듭니다.\nKotlin으로 정산 스케줄러를 운영하고 장애 시 재처리 절차를 책임집니다.',
   '{"technologies":["Kotlin","대용량"],"impacts":["대용량 정산"],"roles":["백엔드 엔지니어"],"conditions":["출근"]}',
   '서울 강남', '출근', '5년 이상', '정규직', '면접 후 협의', '백엔드 · 데이터',
   '[]', '[]', '[]', null, null, 4, null, 'demo-job-toss-core', 1440),
  ('demo-coupang', '링크드인', 'Data Infrastructure Engineer', 'Data Platform',
   E'쿠팡 데이터 인프라 팀에서 사내 데이터 기반을 만듭니다.\nIaC로 배포를 자동화하고 온콜 로테이션을 함께 돕니다.',
   '{"technologies":["IaC","온콜"],"impacts":[],"roles":["플랫폼 엔지니어"],"conditions":["출근"]}',
   '서울 · 시애틀', '출근', '5년 이상', '정규직', '면접 후 협의', '플랫폼 · 인프라',
   '[]', '[]', '[]', null, null, 11, null, 'demo-job-coupang-infra', 2160),
  ('demo-daangn', '원티드', '서버 개발자 (커뮤니티)', '커뮤니티실',
   E'당근 커뮤니티실에서 동네 이야기를 다루는 서버를 만듭니다.\nGo와 Kubernetes로 하루 수천만 건의 요청을 받습니다.',
   '{"technologies":["Go","Kubernetes"],"impacts":["하루 수천만 건"],"roles":["백엔드 엔지니어"],"conditions":["리모트 일부"]}',
   '서울', '리모트 일부', '3년 이상', '정규직', '면접 후 협의', '백엔드 · 데이터',
   '[]', '[]', '[]', null, null, 9, null, 'demo-job-daangn-community', 2520),
  ('demo-musinsa', '잡코리아', '데이터 엔지니어', '데이터플랫폼팀',
   E'무신사 데이터플랫폼팀에서 지표를 만듭니다.\nBigQuery로 모델을 관리하고 품질 모니터링을 자동화합니다.',
   '{"technologies":["BigQuery"],"impacts":[],"roles":["데이터 엔지니어"],"conditions":["출근"]}',
   '서울 성수', '출근', '3년 이상', '정규직', '면접 후 협의', '백엔드 · 데이터',
   '[]', '[]', '[]', null, null, 2, null, 'demo-job-musinsa-de', 3240),
  ('demo-kakao', '링크드인', '플랫폼 엔지니어', '플랫폼서비스',
   E'카카오 플랫폼서비스에서 사내 공통 기반을 만듭니다.\nJava와 MSA로 여러 서비스를 잇습니다.',
   '{"technologies":["Java","MSA"],"impacts":[],"roles":["플랫폼 엔지니어"],"conditions":["출근"]}',
   '판교', '출근', '5년 이상', '정규직', '면접 후 협의', '플랫폼 · 인프라',
   '[]', '[]', '[]', null, null, 18, null, 'demo-job-kakao-platform', 3600),
  ('demo-line', '원티드', '데이터 플랫폼 엔지니어', '데이터플랫폼실',
   E'라인 데이터플랫폼실에서 글로벌 규모의 적재를 맡습니다.\nKafka와 Spark로 여러 나라의 로그를 다룹니다.',
   '{"technologies":["Kafka","Spark"],"impacts":["글로벌 규모"],"roles":["데이터 엔지니어"],"conditions":["리모트 가능"]}',
   '서울', '리모트 가능', '4년 이상', '정규직', '면접 후 협의', '백엔드 · 데이터',
   '[]', '[]', '[]', null, null, null, '상시 채용', 'demo-job-line-platform', 4680)
) as seed(
  company_key, source_board, title, team, description_raw, requirements,
  location, work_type, experience_label, employment_type, salary_note,
  job_family, duties, preferred, hiring_process, process_note, notice,
  days_left, deadline_note, dedupe_hash, age_minutes
)
join company on company.dedupe_key = seed.company_key
on conflict (dedupe_hash) do nothing;

commit;
