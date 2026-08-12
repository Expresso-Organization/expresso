-- 회사 로고.
--
-- 화면 곳곳이 회사를 **이름 첫 글자**로 그린다(06 목록 · 06b 상세 · 홈 ·
-- 사이드바 · 01b). `company.initial`·`avatar_background`를 두고도 5개 회사
-- 전부 null이라, 실제로는 회색 동그라미에 `C`·`당`·`M`이 떠 있다. 목록에서
-- 회사를 훑어 찾을 때 이게 아무 도움이 안 된다.
--
-- ## 바이트를 왜 여기 두나
--
-- `media_asset`은 저장소 포트(`platform/storage`)에 바이트를 맡기는데, 그건
-- **사용자가 올리는 그림**을 위한 길이다 — 수가 늘고, 사람마다 다르고, 지울 수
-- 있어야 한다. 로고는 반대다. 회사 수만큼만 있고(지금 5), 한 장이 수십 KB고,
-- 우리가 설정한 출처에서만 온다. 표 하나에 담는 것이 맞다.
--
-- ## 왜 링크가 아니라 바이트인가
--
-- 회사 사이트 이미지를 화면에서 그대로 링크하면 **보는 사람의 IP가 그 회사로
-- 간다.** 우리가 한 번 받아 두면 우리 서버만 나가고, 상대가 경로를 바꿔도
-- 화면이 조용히 깨지지 않는다.

alter table company
  -- 받아 둔 마크. 없으면 이니셜 아바타로 그린다.
  add column logo_data bytea,
  add column logo_media_type text,
  -- 어디서 받았는지. 이 값이 없으면 그 로고는 근거가 없는 것이다.
  add column logo_source_url text,
  -- 주소에 붙여 캐시를 가른다. 내용이 바뀌면 주소가 바뀐다.
  add column logo_checksum text,
  -- 받아 보려고 **시도한** 시각. null이면 아직 시도한 적이 없다.
  --
  -- `logo_data`가 null인 것과 뜻이 다르다: 봇 문을 닫아 둔 사이트도 있고
  -- (쿠팡 careers는 Cloudflare 챌린지 뒤에 있다), 16×16짜리만 주는 곳도 있다.
  -- 그런 회사를 매 수집마다 다시 두드리지 않으려고 남긴다.
  add column logo_read_at timestamptz,
  -- PNG만 받는다. SVG는 우리 출처에서 내보내는 순간 스크립트를 품을 수 있는
  -- 문서가 된다 — 주소를 직접 열면 그게 우리 도메인에서 실행된다. 아바타는
  -- 24px로 그리므로 벡터로 얻을 것도 없다.
  add constraint company_logo_media_type_check
    check (logo_media_type is null or logo_media_type = 'image/png'),
  -- 셋은 함께 있거나 함께 없다. 바이트만 있고 출처가 없는 로고는 못 만든다.
  add constraint company_logo_complete_check
    check (num_nonnulls(logo_data, logo_media_type, logo_source_url, logo_checksum) in (0, 4));

comment on column company.logo_data is
  '회사 마크 원본 바이트. 우리가 회사 사이트에서 한 번 받아 둔 것.';
comment on column company.logo_read_at is
  '마크를 받아 보려고 시도한 시각. null이면 아직 시도 전. logo_data가 null인 것과 뜻이 다르다.';

-- 아직 시도하지 않은 회사를 수집이 이어서 집어간다. (`company`에는 created_at이
-- 없어 id로 잡는다 — 순서가 아니라 "남은 것 찾기"가 이 색인의 일이다.)
create index company_logo_pending_idx on company (id)
  where logo_read_at is null;

alter table job_source
  -- 이 출처가 대변하는 **회사 자기 사이트**. 로고는 여기서 받는다.
  --
  -- 공고의 `source_url`에서 짐작하지 않는다. Greenhouse에 얹은 회사는 그 값이
  -- `job-boards.greenhouse.io`라 ATS를 가리키고, 본문 링크에서 세어 보면 당근은
  -- 최빈 호스트가 `pf.kakao.com`(카카오톡 채널)이다. 짐작이 틀리면 **다른 회사
  -- 로고가 뜬다** — 안 뜨는 것보다 나쁘다. 그래서 설정으로 받는다.
  add column site_url text;

comment on column job_source.site_url is
  '이 출처가 대변하는 회사의 자기 사이트. 로고를 여기서 받는다. 짐작하지 않고 설정한다.';
