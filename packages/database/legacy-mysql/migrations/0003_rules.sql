-- 스키마가 지키던 규칙 — PostgreSQL 의 PL/pgSQL 트리거를 MySQL 로 옮긴 것입니다.
--
-- 옮기지 못한 셋은 응용 코드가 지킵니다.
--   · portfolio_snapshot · recipe_revision 의 보관 개수 — MySQL 트리거는 자기 표를
--     고치지 못합니다.
--   · brew_source 의 「후보가 있으면 선택 하나는 남는다」 — MySQL 에는 지연 제약이
--     없어 트랜잭션 끝에 확인할 수 없습니다.

-- ── 소유자가 같은 것만 가리킨다 ────────────────────────────────
create trigger answer_record_owner_insert before insert on answer for each row
  if new.created_record_id is not null
     and not exists (select 1 from record where id = new.created_record_id and user_id = new.user_id)
  then signal sqlstate '45000' set message_text = 'created_record_id must reference a record owned by the same user';
  end if;

create trigger answer_record_owner_update before update on answer for each row
  if new.created_record_id is not null
     and not exists (select 1 from record where id = new.created_record_id and user_id = new.user_id)
  then signal sqlstate '45000' set message_text = 'created_record_id must reference a record owned by the same user';
  end if;

create trigger block_source_record_owner_insert before insert on block for each row
  if new.source_record_id is not null
     and not exists (select 1 from record where id = new.source_record_id and user_id = new.user_id)
  then signal sqlstate '45000' set message_text = 'source_record_id must reference a record owned by the same user';
  end if;

create trigger block_source_record_owner_update before update on block for each row
  if new.source_record_id is not null
     and not exists (select 1 from record where id = new.source_record_id and user_id = new.user_id)
  then signal sqlstate '45000' set message_text = 'source_record_id must reference a record owned by the same user';
  end if;

create trigger portfolio_section_recipe_owner_insert before insert on portfolio_section for each row
  if new.recipe_section_id is not null
     and not exists (select 1 from recipe_section where id = new.recipe_section_id and user_id = new.user_id)
  then signal sqlstate '45000' set message_text = 'recipe_section_id must reference a recipe_section owned by the same user';
  end if;

create trigger portfolio_section_recipe_owner_update before update on portfolio_section for each row
  if new.recipe_section_id is not null
     and not exists (select 1 from recipe_section where id = new.recipe_section_id and user_id = new.user_id)
  then signal sqlstate '45000' set message_text = 'recipe_section_id must reference a recipe_section owned by the same user';
  end if;

create trigger question_replacement_owner_insert before insert on question for each row
  if new.replaced_from_id is not null
     and not exists (select 1 from question where id = new.replaced_from_id and user_id = new.user_id)
  then signal sqlstate '45000' set message_text = 'replaced_from_id must reference a question owned by the same user';
  end if;

create trigger revision_block_owner_insert before insert on revision for each row
  if new.block_id is not null
     and not exists (select 1 from block where id = new.block_id and user_id = new.user_id)
  then signal sqlstate '45000' set message_text = 'block_id must reference a block owned by the same user';
  end if;

create trigger widget_derived_metric_owner_insert before insert on widget for each row
  if new.derived_metric_id is not null
     and not exists (select 1 from derived_metric where id = new.derived_metric_id and user_id = new.user_id)
  then signal sqlstate '45000' set message_text = 'derived_metric_id must reference a derived_metric owned by the same user';
  end if;

-- ── 복합 외래 키를 쪼갠 자리의 소유자 확인 ─────────────────────
create trigger export_job_owner_insert before insert on export_job for each row
  if (new.asset_id is not null
      and not exists (select 1 from export_asset where id = new.asset_id and user_id = new.user_id))
     or (new.deployment_id is not null
      and not exists (select 1 from deployment where id = new.deployment_id and user_id = new.user_id))
  then signal sqlstate '45000' set message_text = 'export job must reference assets owned by the same user';
  end if;

create trigger generation_job_portfolio_owner_insert before insert on generation_job for each row
  if new.portfolio_id is not null
     and not exists (select 1 from portfolio where id = new.portfolio_id and user_id = new.user_id)
  then signal sqlstate '45000' set message_text = 'generation job must reference a portfolio owned by the same user';
  end if;

-- ── check 로 두지 못한 셋 ──────────────────────────────────────
create trigger block_metric_source_insert before insert on block for each row
  if new.kind in ('metric', 'chart') and new.source_record_id is null and new.sync_state <> 'detached'
  then signal sqlstate '45000' set message_text = 'metric and chart blocks need a source record';
  end if;

create trigger question_self_replacement_insert before insert on question for each row
  if new.replaced_from_id is not null and new.replaced_from_id = new.id
  then signal sqlstate '45000' set message_text = 'a question cannot replace itself';
  end if;

create trigger widget_metric_choice_insert before insert on widget for each row
  if (new.metric_key is not null) + (new.derived_metric_id is not null) <> 1
  then signal sqlstate '45000' set message_text = 'a widget needs exactly one of metric_key or derived_metric_id';
  end if;

-- ── 카테고리와 기록 ────────────────────────────────────────────
create trigger record_category_scope_insert before insert on record for each row
  if not exists (select 1 from category where id = new.category_id and (user_id is null or user_id = new.user_id))
  then signal sqlstate '45000' set message_text = 'category must be a system category or belong to the record owner';
  end if;

create trigger record_category_scope_update before update on record for each row
  if not exists (select 1 from category where id = new.category_id and (user_id is null or user_id = new.user_id))
  then signal sqlstate '45000' set message_text = 'category must be a system category or belong to the record owner';
  end if;

create trigger category_view_category_scope_insert before insert on category_view for each row
  if not exists (select 1 from category where id = new.category_id and (user_id is null or user_id = new.user_id))
  then signal sqlstate '45000' set message_text = 'category must be a system category or belong to the view owner';
  end if;

create trigger category_view_limit_insert before insert on category_view for each row
  if (select count(*) from category_view where user_id = new.user_id and category_id = new.category_id) >= 8
  then signal sqlstate '45000' set message_text = 'category view limit exceeded';
  end if;

create trigger category_system_immutable_update before update on category for each row
  if old.is_system then signal sqlstate '45000' set message_text = 'system category definitions are immutable';
  end if;

create trigger category_system_immutable_delete before delete on category for each row
  if old.is_system then signal sqlstate '45000' set message_text = 'system category definitions are immutable';
  end if;

create trigger category_version_on_update before update on category for each row
  set new.version = old.version + 1, new.updated_at = now(6);

create trigger record_version_on_update before update on record for each row
  set new.version = old.version + 1, new.updated_at = now(6);

-- 기록을 지우면 그 기록을 가리키던 블록은 인용을 놓고 떨어진다.
create trigger record_delete_detaches_blocks before delete on record for each row
  update block set source_record_id = null, sync_state = 'detached'
  where user_id = old.user_id and source_record_id = old.id;

-- ── 공고 원문은 불변 ───────────────────────────────────────────
create trigger job_posting_source_immutable_update before update on job_posting for each row
  if not (new.source <=> old.source) or not (new.external_id <=> old.external_id)
     or not (new.source_url <=> old.source_url) or not (new.description_raw <=> old.description_raw)
     or not (new.dedupe_hash <=> old.dedupe_hash)
  then signal sqlstate '45000' set message_text = 'job posting source fields are immutable';
  end if;

-- ── 배포 스냅샷은 불변 ─────────────────────────────────────────
create trigger deployment_snapshot_immutable_update before update on deployment for each row
  if not (new.user_id <=> old.user_id) or not (new.portfolio_id <=> old.portfolio_id)
     or not (new.version <=> old.version) or not (new.subdomain <=> old.subdomain)
     or not (cast(new.snapshot as char) <=> cast(old.snapshot as char))
     or not (cast(new.seo as char) <=> cast(old.seo as char))
     or not (new.contact_visibility <=> old.contact_visibility)
     or not (new.published_at <=> old.published_at)
  then signal sqlstate '45000' set message_text = 'deployment snapshot is immutable';
  end if;

-- ── 포트폴리오 ─────────────────────────────────────────────────
create trigger portfolio_current_deployment_scope_insert before insert on portfolio for each row
  if new.current_deployment_id is not null
     and not exists (select 1 from deployment where id = new.current_deployment_id
                       and user_id = new.user_id and portfolio_id = new.id)
  then signal sqlstate '45000' set message_text = 'current deployment must belong to the same portfolio';
  end if;

create trigger portfolio_current_deployment_scope_update before update on portfolio for each row
  if new.current_deployment_id is not null
     and not exists (select 1 from deployment where id = new.current_deployment_id
                       and user_id = new.user_id and portfolio_id = new.id)
  then signal sqlstate '45000' set message_text = 'current deployment must belong to the same portfolio';
  end if;

create trigger portfolio_updated_at_on_update before update on portfolio for each row
  set new.updated_at = now(6);

-- ── 대시보드 뷰는 포트폴리오마다 여섯 개까지 ───────────────────
create trigger dashboard_view_limit_insert before insert on dashboard_view for each row
  if (select count(*) from dashboard_view where user_id = new.user_id and portfolio_id = new.portfolio_id) >= 6
  then signal sqlstate '45000' set message_text = 'a portfolio can have at most 6 dashboard views';
  end if;

-- ── 제작 재료 ──────────────────────────────────────────────────
create trigger brew_source_candidate_guard_insert before insert on brew_source for each row
  if not exists (select 1 from brew where id = new.brew_id and user_id = new.user_id)
     or not exists (select 1 from record where id = new.record_id and user_id = new.user_id
                      and deleted_at is null and status in ('organized', 'verified'))
  then signal sqlstate '45000' set message_text = 'brew source must be an active organized record owned by the brew owner';
  end if;

create trigger brew_source_selected_limit_insert before insert on brew_source for each row
  if new.is_selected
     and (select count(*) from brew_source where user_id = new.user_id and brew_id = new.brew_id and is_selected) >= 10
  then signal sqlstate '45000' set message_text = 'a brew can select at most 10 sources';
  end if;

-- ── 답변에서 만든 기록은 답변 안의 문장을 그대로 인용한다 ──────
create trigger answer_record_change_exact_source_insert before insert on answer_record_change for each row
  if not exists (select 1 from answer where id = new.answer_id and user_id = new.user_id
                   and instr(transcript, new.source_quote) > 0)
  then signal sqlstate '45000' set message_text = 'record change source must be an exact answer transcript span';
  end if;
