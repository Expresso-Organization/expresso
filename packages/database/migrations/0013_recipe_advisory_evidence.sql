-- 출처와 권장 분량은 레시피를 버릴 이유가 아니라 사용자가 검토할 메타데이터다.
alter table `recipe_item` drop check `recipe_item_evidence_check`;
alter table `recipe_item`
  add constraint `recipe_item_evidence_check`
  check (json_type(`evidence`) = 'ARRAY');

alter table `recipe_section` drop check `recipe_section_target_length_check`;
alter table `recipe_section`
  add constraint `recipe_section_target_length_check`
  check (`target_length` >= 0);
