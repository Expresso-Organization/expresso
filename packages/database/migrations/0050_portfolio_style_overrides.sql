-- 문법을 템플릿에서 떼어낸다.
--
-- 문법의 축(골격 · 밀도 · 서체 · 팔레트)은 서로 독립인데, 지금은 `template` 행
-- 세 개가 그 공간을 **점 세 개로 접어** 놓고 있다. 골격만 3 × 밀도 3 × 서체 2로도
-- 18가지인데 실제로 뽑을 수 있는 것이 셋이다.
--
-- 키트를 아무리 다양하게 만들어도 들어오는 문법이 셋이면 결과도 셋으로 수렴한다.
-- 그래서 템플릿을 **출발점**으로 바꾸고, 포트폴리오마다 축을 따로 움직일 수 있게
-- 한 칸을 연다. "이 사람 이 공고를 위해 매번 새로 짠다"는 기획이 여기서 산다.
--
-- 통째로 새 문법을 넣는 것이 아니라 **덮어쓸 축만** 담는다. 안 적은 축은 템플릿을
-- 그대로 따르므로, 템플릿을 고치면 안 건드린 축은 함께 따라 움직인다.

alter table portfolio
  add column style_overrides jsonb not null default '{}'::jsonb
    check (jsonb_typeof(style_overrides) = 'object');

comment on column portfolio.style_overrides is
  '이 포트폴리오만의 문법 조정. 템플릿의 style 위에 덮어쓴다 — 적은 축만 바뀐다.';
