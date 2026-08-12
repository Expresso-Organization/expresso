-- 레시피가 어느 프롬프트로 나왔는지 남긴다.
--
-- §8.3 계약은 프롬프트를 고칠 때마다 결과가 달라진다. 지면(`layout_spec`)에는
-- 이미 같은 열이 있고, 레시피에도 있어야 "이건 옛 구성이라 다시 짜자"를
-- 말할 수 있다.
--
-- 기존 행은 규칙 기반으로 만들어진 것이라 0으로 둔다 — 계약이 낸 것이 아니다.

alter table recipe
  add column prompt_version integer not null default 0
    check (prompt_version >= 0);
