-- 사용자가 올린 이미지.
--
-- 지면에 그림을 넣는 길이 둘로 갈린다. `chart`는 근거의 수치로 우리가 그리고,
-- 이 표는 **만들어 낼 수 없는 것** — 화면 캡처 · 로고 · 사진 — 을 받는다.
-- 디자이너·기획자 포트폴리오는 이쪽이 없으면 성립하지 않는다.
--
-- 바이트는 여기 두지 않는다. 저장소 포트(`platform/storage`)가 `storage_key`로
-- 찾아가고, 지금은 로컬 디스크이며 객체 저장소로 바뀌어도 이 표는 그대로다.

create table media_asset (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  -- 저장소 안의 자리. 어댑터마다 뜻이 다르지만 형태는 같다.
  storage_key text not null,
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
  -- 원본 픽셀. 지면이 자리를 미리 잡아 그림이 뜰 때 글이 밀리지 않게 한다.
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  byte_size integer not null check (byte_size > 0),
  -- 같은 파일을 두 번 올리면 한 줄로 선다. 같은 화면을 여러 포트폴리오에 쓰는
  -- 일이 흔하고, 그때마다 사본이 쌓일 이유가 없다.
  checksum text not null,
  created_at timestamptz not null default now(),
  unique (user_id, checksum),
  unique (user_id, id)
);

create index media_asset_user_created_idx on media_asset (user_id, created_at desc);

comment on table media_asset is
  '사용자가 올린 이미지. 바이트는 저장소 포트가 storage_key로 들고 있다.';
