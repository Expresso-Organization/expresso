alter table `brew`
  add column `design_system_revision_id` char(36) null,
  add column `reference_lock_snapshot` json null,
  add column `design_style_overrides` json not null default (cast('{}' as json)),
  add column `design_selected_at` datetime(6) null,
  add constraint `brew_reference_lock_snapshot_check` check (`reference_lock_snapshot` is null or json_type(`reference_lock_snapshot`) = 'OBJECT'),
  add constraint `brew_design_style_overrides_check` check (json_type(`design_style_overrides`) = 'OBJECT');
