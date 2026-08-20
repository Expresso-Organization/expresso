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
-- 고용24(워크넷)는 여기 없다. 인증키(`WORK24_API_KEY`)를 발급받아 넣기 전에는
-- 어댑터가 만들어지지 않아 매일 "adapter not configured"로 실패한다.

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
on conflict (provider, token) do update set
  display_name = excluded.display_name,
  site_url = coalesce(job_source.site_url, excluded.site_url),
  is_active = true;
