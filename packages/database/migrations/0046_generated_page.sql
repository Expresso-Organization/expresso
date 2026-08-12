-- 자유 생성 지면.
--
-- 블록과 `layout_spec`으로 짜던 길과 다르다 — 여기서는 모델이 마크업과 CSS를
-- 직접 쓰고, 한 포트폴리오에 **한 장이 통째로** 붙는다. 블록으로 쪼개 두지
-- 않으므로 부분 편집도 부분 재생성도 이 표로는 할 수 없다. 그 대신 CSS 전부를
-- 쓴다.
--
-- 저장되는 것은 **소독을 지난 것뿐이다.** 모델이 낸 원본은 두지 않는다 — 두면
-- 언젠가 누군가 그걸 내보내고, 그 순간 소독기는 없는 것이 된다.

create table generated_page (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  portfolio_id uuid not null,
  -- 지면의 몸통. `<html>`이나 `<head>`는 들어 있지 않다 — 껍데기는 계약이 씌운다.
  html text not null,
  css text not null,
  -- 왜 이렇게 만들었는지 한 문장. 사용자가 읽고 다시 뽑을지 정한다.
  rationale text not null default '',
  -- 몇 번째로 뽑은 것인가. 다시 뽑아도 앞의 것을 지우지 않아 되돌아갈 수 있다.
  revision integer not null check (revision >= 0),
  -- 이 지면을 만든 지시. 처음 뽑은 것은 비어 있다.
  instruction text,
  prompt_version integer not null,
  -- 근거에서 확인하지 못한 수. 비어 있어야 정상이고, 있으면 사용자에게 보인다.
  -- 막지 않는 이유는 대개 환산값이고, 틀린 숫자인지는 본인이 가장 잘 알기 때문이다.
  ungrounded_numbers text[] not null default '{}',
  -- 소독기가 지운 것. 비어 있어야 정상이다. 남으면 프롬프트가 규칙을 덜 가르친 것이다.
  removed text[] not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (user_id, portfolio_id) references portfolio(user_id, id) on delete cascade,
  -- 한 포트폴리오의 한 판은 하나다.
  unique (portfolio_id, revision),
  unique (user_id, id)
);

-- 최신 판을 꺼내는 것이 거의 모든 조회다.
create index generated_page_latest_idx on generated_page (portfolio_id, revision desc);

comment on table generated_page is
  '모델이 직접 쓴 포트폴리오 지면 한 장. 소독을 지난 마크업과 CSS만 담는다.';
