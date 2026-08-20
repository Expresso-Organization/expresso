-- 소셜 로그인 계정 연결.
--
-- **이메일이 아니라 제공자의 subject(`sub`)로 잇는다.** 사용자는 Google 계정의
-- 이메일을 바꿀 수 있고, 바꾼 뒤에도 같은 사람이어야 한다. 이메일은 조회용이
-- 아니라 "연결할 당시 무엇이었나"의 기록으로만 둔다.
--
-- `user.password_hash`는 이미 nullable이다(0021) — 여기로 들어온 계정은 비밀번호
-- 없이 존재한다.

create table identity_oauth_account (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  provider text not null check (provider in ('google')),
  provider_account_id text not null check (
    char_length(provider_account_id) between 1 and 255
  ),
  email citext not null,
  linked_at timestamptz not null default now(),
  last_login_at timestamptz,
  -- 같은 Google 계정이 두 사람이 될 수 없다.
  unique (provider, provider_account_id),
  -- 한 사람에게 제공자당 하나. (user_id, provider) 순서라 사용자별 조회도 이 인덱스를 탄다.
  unique (user_id, provider)
);

comment on column identity_oauth_account.email is
  '연결 시점의 제공자 이메일. 조회 키가 아니다 — 계정 식별은 provider_account_id로만 한다.';
