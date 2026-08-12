-- 레시피 섹션 하나가 포트폴리오 하나에만 붙을 수 있었다.
--
-- `portfolio_section`에 `unique (recipe_section_id)`가 **전역으로** 걸려 있어서,
-- 같은 레시피로 두 번째 추출을 돌리면 새 포트폴리오에 섹션이 하나도 생기지 않고
-- 문장이 **앞 포트폴리오로 들어갔다**. `on conflict (recipe_section_id) do update`가
-- 앞 포트폴리오의 행을 집어 왔기 때문이다.
--
-- 재생성은 새 포트폴리오를 만드는 정상 경로다(§8.3 재생성 · 08b 새 버전 배포).
-- 유일해야 하는 것은 "한 포트폴리오 안에서 한 번"이다.

alter table portfolio_section
  drop constraint portfolio_section_recipe_section_id_key;

alter table portfolio_section
  add constraint portfolio_section_portfolio_recipe_section_key
  unique (user_id, portfolio_id, recipe_section_id);

-- 포트폴리오를 지울 수 없었다.
--
-- `generation_job`이 `(user_id, portfolio_id)`로 포트폴리오를 가리키면서
-- `on delete set null`을 걸어 뒀다. 비울 열을 적지 않으면 Postgres는 **두 열을 다**
-- 비우려 들고, `user_id`는 not null이라 삭제가 통째로 막힌다. 사용자 삭제가
-- 지금까지 통과한 것은 cascade 순서가 우연히 맞았기 때문이다.
alter table generation_job
  drop constraint generation_job_portfolio_fk;

alter table generation_job
  add constraint generation_job_portfolio_fk
  foreign key (user_id, portfolio_id) references portfolio(user_id, id)
  on delete set null (portfolio_id);
