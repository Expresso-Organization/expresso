-- 기록과 공고를 외부 모델로 보내기 전에 묻는다.
--
-- §8.3 계약 열 개가 전부 붙었는데 동의 지점이 없었다. 사용자가 쓴 커리어 기록과
-- 공고 원문이 이 머신 밖으로 나가는 일인데, 그걸 승낙한 적이 없다.
--
-- 범위를 둘로 나눈다 — 나가는 것이 다르기 때문이다:
--   job_posting_analysis : 공고 원문. 남이 쓴 글이고 이미 공개된 것이다.
--   career_records       : 내가 쓴 기록. 이쪽이 훨씬 민감하다.
-- 하나만 주고 다른 하나는 안 줄 수 있어야 한다.
--
-- 철회는 행을 지우지 않고 `revoked_at`을 찍는다. "동의한 적이 있다"는 사실
-- 자체가 기록이어야 하고, 정책 버전이 바뀌면 다시 물어야 한다.

create table consent (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  scope text not null check (scope in ('job_posting_analysis', 'career_records')),
  -- 무엇에 동의했는지. 문구가 바뀌면 올리고, 그때부터 옛 동의는 무효다.
  policy_version integer not null check (policy_version > 0),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (revoked_at is null or revoked_at >= granted_at),
  unique (user_id, id)
);

-- 한 범위에 살아 있는 동의는 하나다.
create unique index consent_active_unique
  on consent(user_id, scope) where revoked_at is null;

create index consent_lookup_idx on consent(user_id, scope, revoked_at);
