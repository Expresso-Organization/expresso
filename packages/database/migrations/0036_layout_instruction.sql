-- 이 지면이 어떤 지시로 나왔는지 남긴다(§8.3 지면 변형).
--
-- 생성으로 나온 후보는 null이다. "더 차분하게"라고 해서 나온 지면은 그 문장이
-- 남아야, 03·04가 "무엇을 시켜서 이렇게 됐는지"를 보여줄 수 있다.

alter table layout_spec
  add column instruction text
    check (instruction is null or length(instruction) between 1 and 300);
