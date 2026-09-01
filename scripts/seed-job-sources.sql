-- 공고를 모아 올 곳.
--
-- Greenhouse의 board token은 그 회사가 자기 채용 페이지를 붙이려고 공개해 둔
-- 값이다. 인증이 없고, `?content=true`를 주면 본문이 통째로 온다.
--
--   https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
--
-- 새 회사를 넣으려면 그 회사 채용 페이지의 주소에서 token을 찾아 한 줄 더한다.
-- 없는 token은 수집이 HTTP 404로 실패하고 `job_source.last_error`에 남는다 —
-- 조용히 0건을 모으지 않는다.
--
-- 그리팅(greeting)·Lever·Workable도 같은 성격이다 — 인증이 없고, 회사가 자기
-- 채용 페이지로 쓰라고 세워 둔 보드다. token은 보드 주소의 슬러그다.
--
--   그리팅   https://{token}.career.greetinghr.com/ko/home
--   Lever    https://api.lever.co/v0/postings/{token}?mode=json
--   Workable https://apply.workable.com/api/v1/widget/accounts/{token}?details=true
--
-- **슬러그는 짐작하지 않는다.** 변형 492개를 찍어 본 결과가 0건이었다 —
-- 여기어때는 `gccompany`, 뷰노는 `vunohire`, 채널톡은 Lever의 `zoyi` 다.
-- 새로 넣을 회사는 그 회사 채용 페이지(`/careers` · `/recruit`)를 열어 거기
-- 걸린 보드 주소에서 슬러그를 그대로 가져온다.
--
-- `work24` 출처는 여기 없다. 그 어댑터가 부르는 곳은 워크넷이 아니라
-- **공공기관 채용정보**(재정경제부)이고, data.go.kr 서비스키(`WORK24_API_KEY`)를
-- 넣기 전에는 어댑터가 만들어지지 않아 매일 "adapter not configured"로 실패한다.
--
--   https://www.data.go.kr/data/15125273/openapi.do

-- `site_url`은 **그 회사의 자기 사이트**다. 수집이 여기서 마크(로고)를 받아
-- `company.domain`에 적어 둔다. 비워 두면 `domain`이 null로 남고, 로고를 받는
-- 질의가 `domain is not null`이라 **한 번도 시도하지 않는다** — 로고가 없는
-- 것과 받으려다 못 받은 것은 다른 상태인데, 비워 두면 둘을 구분할 수 없다.
--
-- 쿠팡이 `www.coupang.jobs`인 것은 저장소에 손으로 넣어 둔 마크의 파일
-- 이름이 그 호스트이기 때문이다(assets/company-marks/README.md).

insert into job_source (provider, token, display_name, site_url)
values
  ('greenhouse', 'daangn',   '당근',     'https://www.daangn.com'),
  ('greenhouse', 'coupang',  '쿠팡',     'https://www.coupang.jobs'),
  ('greenhouse', 'krafton',  '크래프톤', 'https://www.krafton.com'),
  ('greenhouse', 'moloco',   '몰로코',   'https://www.moloco.com'),
  ('greenhouse', 'sendbird', '센드버드', 'https://sendbird.com')
as new on duplicate key update
  display_name = new.display_name,
  site_url = coalesce(job_source.site_url, new.site_url),
  is_active = true;

-- 그리팅 — 국내 스타트업이 가장 많이 쓰는 ATS.
insert into job_source (provider, token, display_name, site_url)
values
  ('greeting', 'oliveyoung',    'CJ올리브영',      'https://www.oliveyoung.co.kr'),
  ('greeting', 'hybe',          'HYBE',            'https://hybecorp.com'),
  ('greeting', 'musinsa',       '무신사',          'https://www.musinsa.com'),
  ('greeting', 'kurly',         '컬리',            'https://www.kurly.com'),
  -- 오늘의집(`bucketplace`)은 여기 없다. 보드 루트가 꺼져 있어 `/ko/home`이
  -- 404를 낸다(실측) — 공고 61건은 자사 채용 페이지에만 걸려 있다. 넣어 두면
  -- 우리가 할 수 있는 일이 없는 실패가 매일 쌓인다. 오늘의집이 보드를 켜면
  -- 이 줄만 되살리면 된다.
  ('greeting', 'fastfive',      '패스트파이브',    'https://www.fastfive.co.kr'),
  ('greeting', 'catchtable',    '캐치테이블',      'https://www.catchtable.co.kr'),
  ('greeting', 'makinarocks',   '마키나락스',      'https://www.makinarocks.ai'),
  -- 여기어때는 goodchoice.kr 이 아니라 yeogi.com 으로 옮겼다(실측 리다이렉트).
  ('greeting', 'gccompany',     '여기어때',        'https://www.yeogi.com'),
  -- 팀스파르타는 teamsparta.co 가 응답하지 않아 사이트를 비워 둔다. 틀린
  -- 도메인을 적으면 다른 회사 로고가 뜬다 — 없는 것보다 나쁘다.
  ('greeting', 'teamsparta',    '팀스파르타',      null),
  ('greeting', 'finda',         '핀다',            'https://finda.co.kr'),
  ('greeting', 'kakaomobility', '카카오모빌리티',  'https://www.kakaomobility.com'),
  ('greeting', 'wadiz',         '와디즈',          'https://www.wadiz.kr'),
  ('greeting', 'buzzvil',       '버즈빌',          'https://www.buzzvil.com'),
  ('greeting', 'igaworks',      '아이지에이웍스',  'https://www.igaworks.com'),
  ('greeting', 'zigbang',       '직방',            'https://www.zigbang.com'),
  ('greeting', 'vunohire',      '뷰노',            'https://www.vuno.co'),
  ('greeting', 'korbit',        '코빗',            'https://www.korbit.co.kr'),
  ('greeting', 'wavve',         '콘텐츠웨이브',    'https://www.wavve.com'),
  ('greeting', 'socraai',       'Socra.ai',        'https://socra.ai'),
  ('greeting', 'qanda',         '매스프레소',      'https://mathpresso.com')
as new on duplicate key update
  display_name = new.display_name,
  site_url = coalesce(job_source.site_url, new.site_url),
  is_active = true;

-- Lever — 회사 이름 칸이 없어서 `display_name`이 그대로 회사 이름이 된다.
insert into job_source (provider, token, display_name, site_url)
values
  ('lever', 'zoyi',   '채널코퍼레이션', 'https://channel.io'),
  ('lever', 'neowiz', '네오위즈',       'https://www.neowiz.com')
as new on duplicate key update
  display_name = new.display_name,
  site_url = coalesce(job_source.site_url, new.site_url),
  is_active = true;

-- Workable
insert into job_source (provider, token, display_name, site_url)
values
  ('workable', 'lunit', '루닛', 'https://www.lunit.io')
as new on duplicate key update
  display_name = new.display_name,
  site_url = coalesce(job_source.site_url, new.site_url),
  is_active = true;

-- 고용24 채용정보 화면. token 은 직종코드이고, 여러 개면 `|`로 잇는다.
--
-- **직종을 하나씩 나눠 둔다.** 한 출처가 목록 50장(5,000건)을 넘으면 어댑터가
-- 던진다 — 조용히 자르지 않기 위해서다. IT 다섯 직종을 합치면 4,761건이라
-- 한 줄로 묶어도 지금은 들어가지만, 늘어나면 그날 통째로 실패한다.
--
-- 직종코드는 공통코드 API 로 받는다(`target=CMCD&dtlGb=2`).
-- 회사가 여럿이라 `site_url` 은 비운다 — 로고는 공고마다 회사가 다르다.
insert into job_source (provider, token, display_name, site_url)
values
  ('work24web', '022', '고용24 · 컴퓨터하드웨어·통신공학',   null),
  ('work24web', '023', '고용24 · 컴퓨터시스템',              null),
  ('work24web', '024', '고용24 · 소프트웨어',                null),
  ('work24web', '025', '고용24 · 네트워크·정보보안',         null),
  ('work24web', '026', '고용24 · 데이터·정보시스템·웹운영',  null)
as new on duplicate key update
  display_name = new.display_name,
  site_url = coalesce(job_source.site_url, new.site_url),
  is_active = true;
