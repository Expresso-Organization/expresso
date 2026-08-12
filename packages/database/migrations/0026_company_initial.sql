-- 카드 이니셜 아바타의 글자.
--
-- 정의서는 한글 회사명에도 라틴 이니셜을 쓴다(토스 → T, 뱅크샐러드 → B).
-- 이름 첫 글자를 잘라 쓰면 "토"가 되고, 도메인 첫 글자로 유추하면 컬리가
-- K가 되는데 정의서는 C다. 유추할 수 있는 값이 아니라서 열로 둔다.

alter table company
  add column initial text check (initial ~ '^[A-Z]$');

update company set initial = upper(left(coalesce(domain, name), 1))
where initial is null and coalesce(domain, name) ~ '^[A-Za-z]';
