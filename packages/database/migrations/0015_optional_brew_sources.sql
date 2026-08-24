-- 재료는 생성 입력을 돕는 선택 사항이다. 후보가 있어도 사용자가 모두 뺄 수 있다.
drop trigger if exists brew_source_keep_selection_update;
drop trigger if exists brew_source_keep_selection_delete;
