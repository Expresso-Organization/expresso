-- 온보딩 1단계(화면 10c)가 묻는 것 — 노리는 자리, 연차, 지금 급한 것.
--
-- 지금까지 이 화면은 **아무 데도 보내지 않았다.** 슬라이더를 12년에 놓고
-- 다음을 눌러도 그 값은 그 순간 사라졌다. 받을 칸이 여기다.
--
-- `user`를 넓히지 않고 따로 둔다. `user`는 거의 모든 질의가 조인하는
-- 테이블이고, 온보딩에서만 쓰는 칸을 거기 얹을 이유가 없다.

create table career_profile (
  -- 사람당 하나. 그래서 user_id가 곧 기본키다.
  user_id uuid primary key references "user"(id) on delete cascade,

  -- 노리는 직무. 여러 개를 고를 수 있다(화면의 칩 8종).
  -- 빈 배열은 "아직 안 정했다"는 뜻이고, 그것도 답이다.
  target_roles text[] not null default '{}' check (
    coalesce(array_length(target_roles, 1), 0) <= 8
    and array_position(target_roles, null) is null
  ),

  -- 0..12. **12는 "12년 이상"이다** — 화면의 슬라이더가 그렇게 읽힌다.
  -- 계약이 받는 범위와 같은 값을 여기에도 적는다. 더 넓게 열어 두면
  -- 화면이 만들 수 없는 값을 DB가 허락한다는 뜻이 된다.
  experience_years integer not null check (experience_years between 0 and 12),

  -- 화면의 세 갈래.
  primary_goal text not null check (primary_goal in ('explore', 'build', 'organize')),

  updated_at timestamptz not null default now()
);

comment on column career_profile.experience_years is
  '0..12. 12는 "12년 이상"을 뜻한다(화면 10c의 슬라이더 상한).';
