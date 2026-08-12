-- 말로 고치기(§8.3 부분 편집).
--
-- 지금까지 편집 제안은 셋뿐이었다 — 사용자가 **직접 쓴 텍스트**로 바꾸거나,
-- 스타일 값을 지정하거나, 기록 본문을 그대로 붙이거나. 전부 기계적이라
-- "이 문단을 짧게" 같은 지시는 받을 수 없었다.
--
-- §8.3의 부분 편집은 **지시 + 섹션 컨텍스트 → patch[]**다. 바뀐 자리마다
-- 무엇이 어떻게 바뀌었는지가 배열로 나오고, 04b 변경 요약이 그걸 그대로 그린다.

alter table portfolio_edit_proposal
  drop constraint portfolio_edit_proposal_operation_check;

alter table portfolio_edit_proposal
  add constraint portfolio_edit_proposal_operation_check
  check (operation in ('update_text', 'set_style', 'insert_record', 'instruct'));

-- 바뀐 자리들. 기계적 편집은 빈 배열이다 — 바뀐 곳이 하나뿐이라 요약할 것이 없다.
alter table portfolio_edit_proposal
  add column patches jsonb not null default '[]'::jsonb
    check (jsonb_typeof(patches) = 'array');

-- 지시로 만든 제안은 무엇을 시켰는지 남는다. 04c 이력이 이 문장을 보여준다.
alter table portfolio_edit_proposal
  add column instruction text
    check (instruction is null or length(instruction) between 1 and 500);

alter table portfolio_edit_proposal
  add constraint portfolio_edit_proposal_instruction_present
  check (operation <> 'instruct' or (instruction is not null and jsonb_array_length(patches) > 0));
