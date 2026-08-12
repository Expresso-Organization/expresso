-- 질문이 왜 나왔는지 남긴다.
--
-- §8.3 「질문 생성」은 질문마다 rationale을 요구한다 — 01b가 질문 아래에
-- "이걸 왜 묻는지"를 보여줘야 사용자가 답할 마음이 생긴다. 지금까지는
-- 규칙으로 만든 문장이라 댈 이유가 없었고, 그래서 열도 없었다.
--
-- 기존 행은 null이다. 이유를 지어내지 않는다.

alter table question
  add column rationale text check (rationale is null or length(rationale) between 1 and 300);
