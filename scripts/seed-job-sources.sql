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

insert into job_source (provider, token, display_name)
values
  ('greenhouse', 'daangn',   '당근'),
  ('greenhouse', 'coupang',  '쿠팡'),
  ('greenhouse', 'krafton',  '크래프톤'),
  ('greenhouse', 'moloco',   '몰로코'),
  ('greenhouse', 'sendbird', '센드버드')
on conflict (provider, token) do update set
  display_name = excluded.display_name,
  is_active = true;
