-- 내보낼 수 있는 크기들.
--
-- 원본은 그대로 두고 **내보내는 것만** 따로 만든다. 4,000px짜리 PNG 캡처를 그대로
-- 내보내면 8MB가 나가고, 그러면 지면이 아무리 좋아도 열리기 전에 닫힌다.
--
-- 나중에 더 나은 인코더가 생기면 원본에서 이 표를 다시 채우면 된다. 그래서
-- 원본을 지우지 않는다.

create table media_variant (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  media_asset_id uuid not null,
  storage_key text not null,
  mime_type text not null check (mime_type in ('image/webp')),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  byte_size integer not null check (byte_size > 0),
  created_at timestamptz not null default now(),
  foreign key (user_id, media_asset_id) references media_asset(user_id, id) on delete cascade,
  -- 한 그림의 한 폭은 하나다. 다시 만들면 덮어쓴다.
  unique (media_asset_id, width),
  unique (user_id, id)
);

create index media_variant_asset_idx on media_variant (media_asset_id, width);

comment on table media_variant is
  '원본에서 만든 내보내기용 크기. srcset이 이 폭들을 내밀고 브라우저가 고른다.';
