-- Expresso — MySQL 8.4 베이스라인 스키마
-- PostgreSQL 마이그레이션 0001–0054 의 최종 스키마를 옮긴 것입니다.
-- 트리거와 저장 프로시저는 0002 에 따로 있습니다.

create table `plan` (
  `id` char(36) not null default (uuid()),
  `code` varchar(255) not null,
  `generation_quota` int not null,
  `features` json not null default (cast('{}' as json)),
  `is_public_listed` tinyint(1) not null default 1,
  primary key (`id`),
  unique key `plan_code_key` (`code`),
  constraint `plan_code_check` check ((`code` in ('free', 'pro', 'team'))),
  constraint `plan_features_check` check ((json_type(`features`) = 'OBJECT')),
  constraint `plan_generation_quota_check` check ((`generation_quota` >= 0))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `user` (
  `id` char(36) not null default (uuid()),
  `email` varchar(320) character set utf8mb4 collate utf8mb4_0900_ai_ci not null,
  `display_name` text not null,
  `plan_id` char(36) not null,
  `deletion_requested_at` datetime(6) null,
  `created_at` datetime(6) not null default current_timestamp(6),
  `password_hash` text null,
  primary key (`id`),
  unique key `user_email_key` (`email`),
  constraint `user_password_hash_format` check (((`password_hash` IS NULL) OR (regexp_like(`password_hash`, '^scrypt\\$[0-9]+\\$[0-9]+\\$[0-9]+\\$[0-9a-f]{32}\\$[0-9a-f]{128}$'))))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `account_deletion_request` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) null,
  `subject_id` char(36) not null,
  `status` varchar(255) not null,
  `requested_at` datetime(6) not null,
  `purge_after` datetime(6) not null,
  `cancelled_at` datetime(6) null,
  `purged_at` datetime(6) null,
  `cancellation_token_hash` text not null,
  `restoration` json not null,
  `phase` text not null default ('grace_period'),
  `pending_subject_id` char(36) generated always as (case when `status` = 'pending' then `subject_id` end) virtual,
  primary key (`id`),
  unique key `pending_subject_id_unique` (`pending_subject_id`),
  constraint `account_deletion_request_cancellation_token_hash_check` check ((char_length(`cancellation_token_hash`) = 64)),
  constraint `account_deletion_request_check` check ((`purge_after` = (`requested_at` + interval 30 day))),
  constraint `account_deletion_request_restoration_check` check ((json_type(`restoration`) = 'OBJECT')),
  constraint `account_deletion_request_status_check` check ((`status` in ('pending', 'cancelled', 'purged')))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `account_deletion_event` (
  `id` char(36) not null default (uuid()),
  `request_id` char(36) not null,
  `phase` varchar(255) not null,
  `affected_rows` int not null default 0,
  `occurred_at` datetime(6) not null default current_timestamp(6),
  primary key (`id`),
  unique key `account_deletion_event_request_id_phase_key` (`request_id`, `phase`),
  constraint `account_deletion_event_affected_rows_check` check ((`affected_rows` >= 0))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `company` (
  `id` char(36) not null default (uuid()),
  `name` text not null,
  `domain` text null,
  `industry` text null,
  `tone_summary` text null,
  `dedupe_key` varchar(255) null,
  `tone_palette` json null,
  `avatar_background` text null,
  `avatar_color` text null,
  `brand_colors` json not null default (cast('[]' as json)),
  `tone_impression` text null,
  `initial` text null,
  `logo_data` blob null,
  `logo_media_type` text null,
  `logo_source_url` text null,
  `logo_checksum` text null,
  `logo_read_at` datetime(6) null,
  primary key (`id`),
  constraint `company_avatar_background_check` check ((regexp_like(`avatar_background`, '^#[0-9A-Fa-f]{6}$'))),
  constraint `company_avatar_color_check` check ((regexp_like(`avatar_color`, '^#[0-9A-Fa-f]{6}$'))),
  constraint `company_brand_colors_check` check (json_length(`brand_colors`) <= 6),
  constraint `company_initial_check` check ((regexp_like(`initial`, '^[A-Z]$'))),
  constraint `company_logo_complete_check` check ((((`logo_data` is not null) + (`logo_media_type` is not null) + (`logo_source_url` is not null) + (`logo_checksum` is not null)) in (0, 4))),
  constraint `company_logo_media_type_check` check (((`logo_media_type` IS NULL) OR (`logo_media_type` = 'image/png'))),
  constraint `company_tone_palette_check` check (((`tone_palette` IS NULL) OR (json_type(`tone_palette`) = 'OBJECT')))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `job_posting` (
  `id` char(36) not null default (uuid()),
  `company_id` char(36) not null,
  `source` varchar(255) not null,
  `external_id` varchar(255) null,
  `title` text not null,
  `description_raw` text not null,
  `requirements` json not null default (cast('{}' as json)),
  `expires_at` datetime(6) null,
  `dedupe_hash` varchar(255) not null,
  `source_url` text null,
  `created_at` datetime(6) not null default current_timestamp(6),
  `normalized_at` datetime(6) null,
  `location` text null,
  `work_type` text null,
  `experience_label` text null,
  `employment_type` text null,
  `salary_note` text null,
  `job_family` varchar(255) null,
  `duties` json not null default (cast('[]' as json)),
  `preferred` json not null default (cast('[]' as json)),
  `hiring_process` json not null default (cast('[]' as json)),
  `process_note` text null,
  `notice` text null,
  `team` text null,
  `deadline_note` text null,
  `source_board` text null,
  `location_region` varchar(255) null,
  `experience_note` text null,
  `facts_read_at` datetime(6) null,
  `experience_min_years` int generated always as (case when coalesce(`experience_note`, `experience_label`) is null then null when coalesce(`experience_note`, `experience_label`) like '%신입%' then 0 else cast(nullif(regexp_substr(coalesce(`experience_note`, `experience_label`), '[0-9]+'), '') as signed) end) stored null,
  primary key (`id`),
  unique key `job_posting_source_external_id_key` (`source`, `external_id`),
  constraint `job_posting_duties_check` check ((json_type(`duties`) = 'ARRAY')),
  constraint `job_posting_hiring_process_check` check ((json_type(`hiring_process`) = 'ARRAY')),
  constraint `job_posting_preferred_check` check ((json_type(`preferred`) = 'ARRAY')),
  constraint `job_posting_source_check` check ((`source` in ('api', 'partner', 'user_input')))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `job_analysis` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `job_posting_id` char(36) null,
  `input_type` text not null,
  `status` varchar(255) not null default 'queued',
  `attachments` json not null default (cast('[]' as json)),
  `analyzed_at` datetime(6) null,
  `input_idempotency_key` varchar(255) null,
  `input_request_hash` text null,
  `progress_stage` text not null default ('queued'),
  `attempts` int not null default 0,
  `result_version` int not null default 0,
  `target_version` int not null default 1,
  `failure_code` text null,
  `failure_retryable` tinyint(1) null,
  primary key (`id`),
  unique key `job_analysis_user_id_id_key` (`user_id`, `id`),
  constraint `job_analysis_attachments_check` check ((json_type(`attachments`) = 'ARRAY')),
  constraint `job_analysis_attempts_check` check ((`attempts` >= 0)),
  constraint `job_analysis_input_type_check` check ((`input_type` in ('url', 'paste', 'file', 'board'))),
  constraint `job_analysis_progress_stage_check` check ((`progress_stage` in ('queued', 'extracting', 'validating', 'covering', 'done', 'failed'))),
  constraint `job_analysis_result_version_check` check ((`result_version` >= 0)),
  constraint `job_analysis_status_check` check ((`status` in ('queued', 'running', 'done', 'failed'))),
  constraint `job_analysis_target_version_check` check ((`target_version` > 0))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `brew` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `job_analysis_id` char(36) not null,
  `mode` text not null default ('solo'),
  `length_preset` text not null,
  `status` varchar(255) not null default 'draft',
  `deadline_at` datetime(6) null,
  `resumed_at` datetime(6) null,
  `created_at` datetime(6) not null default current_timestamp(6),
  `updated_at` datetime(6) not null default current_timestamp(6),
  primary key (`id`),
  unique key `brew_user_id_id_key` (`user_id`, `id`),
  constraint `brew_length_preset_check` check ((`length_preset` in ('single', 'double', 'triple'))),
  constraint `brew_mode_check` check ((`mode` in ('solo', 'collab'))),
  constraint `brew_status_check` check ((`status` in ('draft', 'interviewing', 'recipe', 'generating', 'done')))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `template` (
  `id` char(36) not null default (uuid()),
  `code` varchar(255) not null,
  `name` text not null,
  `tone_tags` json not null default (cast('[]' as json)),
  `supported_sections` json not null,
  `plan_required` text not null,
  `description` text not null default (''),
  `renderer_version` int not null default 1,
  `style` json not null default (cast('{"font": "sans", "text": "#1f2937", "accent": "#2563eb", "density": "comfortable", "structure": "single-column", "background": "#ffffff"}' as json)),
  `industries` json not null default (cast('[]' as json)),
  `is_active` tinyint(1) not null default 1,
  primary key (`id`),
  unique key `template_code_key` (`code`),
  constraint `template_plan_required_check` check ((`plan_required` in ('free', 'pro'))),
  constraint `template_renderer_version_check` check ((`renderer_version` > 0)),
  constraint `template_style_check` check ((json_type(`style`) = 'OBJECT')),
  constraint `template_style_has_structure` check (((`style` = cast('{}' as json)) OR (json_contains_path(`style`, 'one', '$.structure') AND ((`style` ->> '$.structure') in ('single-column', 'dense-grid', 'wide-margin')))))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `portfolio` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `brew_id` char(36) not null,
  `template_id` char(36) not null,
  `current_deployment_id` char(36) null,
  `title` text not null,
  `status` varchar(255) not null default 'draft',
  `created_at` datetime(6) not null default current_timestamp(6),
  `updated_at` datetime(6) not null default current_timestamp(6),
  `style_overrides` json not null default (cast('{}' as json)),
  primary key (`id`),
  unique key `portfolio_user_id_id_key` (`user_id`, `id`),
  constraint `portfolio_status_check` check ((`status` in ('draft', 'published', 'unlisted'))),
  constraint `portfolio_style_overrides_check` check ((json_type(`style_overrides`) = 'OBJECT'))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `deployment` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `portfolio_id` char(36) not null,
  `version` int not null,
  `subdomain` varchar(255) not null,
  `custom_domain` varchar(255) null,
  `seo_indexable` tinyint(1) not null default 0,
  `contact_visibility` text not null default ('hidden'),
  `published_at` datetime(6) null,
  `has_unpublished_changes` tinyint(1) not null default 0,
  `snapshot` json not null default (cast('{}' as json)),
  `seo` json not null default (cast('{}' as json)),
  primary key (`id`),
  unique key `deployment_custom_domain_key` (`custom_domain`),
  unique key `deployment_subdomain_key` (`subdomain`),
  unique key `deployment_user_id_id_key` (`user_id`, `id`),
  unique key `deployment_user_id_portfolio_id_version_key` (`user_id`, `portfolio_id`, `version`),
  constraint `deployment_contact_visibility_check` check ((`contact_visibility` in ('public', 'on_request', 'hidden'))),
  constraint `deployment_seo_check` check ((json_type(`seo`) = 'OBJECT')),
  constraint `deployment_snapshot_check` check ((json_type(`snapshot`) = 'OBJECT')),
  constraint `deployment_version_check` check ((`version` > 0))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `analytics_event_receipt` (
  `event_id` char(36) not null,
  `user_id` char(36) not null,
  `deployment_id` char(36) not null,
  `event_type` text not null,
  `visitor_hash` varchar(255) not null,
  `payload_hash` text not null,
  `payload_bytes` int not null,
  `occurred_at` datetime(6) not null,
  `received_at` datetime(6) not null default current_timestamp(6),
  primary key (`event_id`),
  unique key `analytics_event_receipt_user_id_event_id_key` (`user_id`, `event_id`),
  constraint `analytics_event_receipt_event_type_check` check ((`event_type` in ('visit', 'complete', 'section_view', 'contact_click', 'file_download', 'link_click'))),
  constraint `analytics_event_receipt_payload_bytes_check` check (((`payload_bytes` >= 1) AND (`payload_bytes` <= 8192))),
  constraint `analytics_event_receipt_payload_hash_check` check ((char_length(`payload_hash`) = 64)),
  constraint `analytics_event_receipt_visitor_hash_check` check ((char_length(`visitor_hash`) = 64))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `annotation` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `portfolio_id` char(36) not null,
  `date` date not null,
  `label` text not null,
  `note` text not null,
  primary key (`id`),
  unique key `annotation_user_id_id_key` (`user_id`, `id`)
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `interview_session` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `brew_id` char(36) not null,
  `status` text not null default ('open'),
  `question_count` int not null default 0,
  `transcript_url` text null,
  `input_idempotency_key` varchar(255) null,
  `current_order` int not null default 0,
  `answered_count` int not null default 0,
  `paused_at` datetime(6) null,
  `created_at` datetime(6) not null default current_timestamp(6),
  `updated_at` datetime(6) not null default current_timestamp(6),
  primary key (`id`),
  unique key `interview_session_user_id_brew_id_key` (`user_id`, `brew_id`),
  unique key `interview_session_user_id_id_key` (`user_id`, `id`),
  constraint `interview_session_answered_count_check` check ((`answered_count` >= 0)),
  constraint `interview_session_current_order_check` check ((`current_order` >= 0)),
  constraint `interview_session_question_count_check` check ((`question_count` >= 0)),
  constraint `interview_session_status_check` check ((`status` in ('open', 'paused', 'done')))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `job_posting_requirement` (
  `id` char(36) not null default (uuid()),
  `job_posting_id` char(36) not null,
  `order_no` int not null,
  `label` text not null,
  `kind` text not null,
  `source_span` json not null,
  `extractor_version` int not null default 1,
  `extracted_at` datetime(6) not null default current_timestamp(6),
  `axis` varchar(255) null,
  primary key (`id`),
  constraint `job_posting_requirement_axis_check` check ((`axis` in ('technology', 'impact', 'role', 'conditions'))),
  constraint `job_posting_requirement_extractor_version_check` check ((`extractor_version` > 0)),
  constraint `job_posting_requirement_kind_check` check ((`kind` in ('must', 'nice', 'tone'))),
  constraint `job_posting_requirement_order_no_check` check ((`order_no` >= 0)),
  constraint `job_posting_requirement_source_span_check` check ((json_type(`source_span`) = 'OBJECT'))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `question` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `interview_session_id` char(36) not null,
  `requirement_id` char(36) null,
  `replaced_from_id` char(36) null,
  `order_no` int not null,
  `text` text not null,
  `skipped` tinyint(1) not null default 0,
  `basis` json not null default (cast('{"type": "legacy"}' as json)),
  `active` tinyint(1) not null default 1,
  `variant` int not null default 0,
  `created_at` datetime(6) not null default current_timestamp(6),
  `rationale` text null,
  `active_order_no` int generated always as (case when `active` then `order_no` end) virtual,
  primary key (`id`),
  unique key `question_user_id_id_key` (`user_id`, `id`),
  unique key `active_order_no_unique` (`user_id`, `interview_session_id`, `active_order_no`),
  constraint `question_basis_check` check ((json_type(`basis`) = 'OBJECT')),
  -- question_check 는 0002 의 트리거가 지킵니다 — SET NULL 이 걸린 열은 check 에 쓰지 못합니다,
  constraint `question_order_no_check` check ((`order_no` >= 0)),
  constraint `question_rationale_check` check (((`rationale` IS NULL) OR ((char_length(`rationale`) >= 1) AND (char_length(`rationale`) <= 300)))),
  constraint `question_variant_check` check ((`variant` >= 0))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `category` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) null,
  `key` varchar(255) not null,
  `is_system` tinyint(1) not null default 0,
  `property_schema` json not null default (cast('{}' as json)),
  `sort_order` int not null default 0,
  `name` text not null,
  `icon` text not null,
  `default_view` text not null,
  `version` int not null default 1,
  `updated_at` datetime(6) not null default current_timestamp(6),
  `system_key` varchar(255) generated always as (case when `user_id` is null then `key` end) virtual,
  primary key (`id`),
  unique key `system_key_unique` (`system_key`),
  constraint `category_check` check (((`is_system` AND (`user_id` IS NULL)) OR ((NOT `is_system`) AND (`user_id` IS NOT NULL)))),
  constraint `category_default_view_check` check ((`default_view` in ('table', 'gallery', 'timeline', 'board', 'list'))),
  constraint `category_property_schema_check` check ((json_type(`property_schema`) = 'OBJECT')),
  constraint `category_version_check` check ((`version` > 0))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `record` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `category_id` char(36) not null,
  `title` text not null,
  `status` text not null default ('draft'),
  `origin` text not null,
  `properties` json not null default (cast('{}' as json)),
  `body_md` text not null default (''),
  `period_start` date null,
  `period_end` date null,
  `version` int not null default 1,
  `updated_at` datetime(6) not null default current_timestamp(6),
  `deleted_at` datetime(6) null,
  `purge_after` datetime(6) null,
  `create_idempotency_key` varchar(255) null,
  `create_request_hash` text null,
  primary key (`id`),
  unique key `record_user_id_id_key` (`user_id`, `id`),
  constraint `record_deletion_window_check` check ((((`deleted_at` IS NULL) AND (`purge_after` IS NULL)) OR ((`deleted_at` IS NOT NULL) AND (`purge_after` = (`deleted_at` + interval 30 day))))),
  constraint `record_origin_check` check ((`origin` in ('manual', 'ai', 'interview', 'import'))),
  constraint `record_properties_check` check ((json_type(`properties`) = 'OBJECT')),
  constraint `record_status_check` check ((`status` in ('draft', 'organized', 'verified'))),
  constraint `record_version_check` check ((`version` > 0))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `answer` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `question_id` char(36) not null,
  `input_type` text not null,
  `transcript` text not null,
  `created_record_id` char(36) null,
  `input_idempotency_key` varchar(255) null,
  `request_hash` text null,
  `version` int not null default 1,
  `updated_at` datetime(6) not null default current_timestamp(6),
  primary key (`id`),
  unique key `answer_user_id_id_key` (`user_id`, `id`),
  unique key `answer_user_id_question_id_key` (`user_id`, `question_id`),
  constraint `answer_input_type_check` check ((`input_type` in ('text', 'voice'))),
  constraint `answer_version_check` check ((`version` > 0))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `answer_record_change` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `answer_id` char(36) not null,
  `record_id` char(36) not null,
  `change_type` text not null,
  `changed_fields` json not null,
  `source_quote` text not null,
  `created_at` datetime(6) not null default current_timestamp(6),
  primary key (`id`),
  unique key `answer_record_change_user_id_answer_id_key` (`user_id`, `answer_id`),
  unique key `answer_record_change_user_id_id_key` (`user_id`, `id`),
  constraint `answer_record_change_change_type_check` check ((`change_type` in ('created', 'strengthened'))),
  constraint `answer_record_change_changed_fields_check` check (((json_type(`changed_fields`) = 'ARRAY') AND (json_length(`changed_fields`) > 0))),
  constraint `answer_record_change_source_quote_check` check ((char_length(`source_quote`) > 0))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `recipe` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `brew_id` char(36) not null,
  `version` int not null,
  `status` text not null default ('draft'),
  `completeness` decimal(18,6) not null,
  `generated_at` datetime(6) not null default current_timestamp(6),
  `input_idempotency_key` varchar(255) null,
  `updated_at` datetime(6) not null default current_timestamp(6),
  `prompt_version` int not null default 0,
  `portfolio_plan` json null,
  `planning_manifest` json null,
  primary key (`id`),
  unique key `recipe_user_id_brew_id_version_key` (`user_id`, `brew_id`, `version`),
  unique key `recipe_user_id_id_key` (`user_id`, `id`),
  constraint `recipe_planning_manifest_check` check (((`planning_manifest` IS NULL) OR (json_type(`planning_manifest`) = 'OBJECT'))),
  constraint `recipe_portfolio_plan_check` check (((`portfolio_plan` IS NULL) OR (json_type(`portfolio_plan`) = 'OBJECT'))),
  constraint `recipe_prompt_version_check` check ((`prompt_version` >= 0)),
  constraint `recipe_status_check` check ((`status` in ('draft', 'confirmed'))),
  constraint `recipe_version_check` check ((`version` > 0))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `recipe_section` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `recipe_id` char(36) not null,
  `order_no` int not null,
  `title` text not null,
  `purpose` text not null,
  `target_length` int not null,
  `context` json not null default (cast('{"goal": "", "tone": "professional", "format": "narrative", "points": [], "exclude": [], "metrics": []}' as json)),
  `locked` tinyint(1) not null default 0,
  `edited_by` text not null default ('ai'),
  `updated_at` datetime(6) not null default current_timestamp(6),
  primary key (`id`),
  unique key `recipe_section_user_id_id_key` (`user_id`, `id`),
  unique key `recipe_section_user_id_recipe_id_order_no_key` (`user_id`, `recipe_id`, `order_no`),
  constraint `recipe_section_context_check` check ((json_type(`context`) = 'OBJECT')),
  constraint `recipe_section_edited_by_check` check ((`edited_by` in ('ai', 'user'))),
  constraint `recipe_section_order_no_check` check ((`order_no` >= 0)),
  constraint `recipe_section_target_length_check` check ((`target_length` > 0))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `portfolio_section` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `portfolio_id` char(36) not null,
  `recipe_section_id` char(36) null,
  `order_no` int not null,
  `visible` tinyint(1) not null default 1,
  `hidden_reason` text null,
  primary key (`id`),
  unique key `portfolio_section_portfolio_recipe_section_key` (`user_id`, `portfolio_id`, `recipe_section_id`),
  unique key `portfolio_section_user_id_id_key` (`user_id`, `id`),
  unique key `portfolio_section_user_id_portfolio_id_order_no_key` (`user_id`, `portfolio_id`, `order_no`),
  constraint `portfolio_section_order_no_check` check ((`order_no` >= 0))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `block` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `portfolio_section_id` char(36) not null,
  `kind` text not null,
  `content` json not null,
  `style` json not null default (cast('{}' as json)),
  `source_record_id` char(36) null,
  `sync_state` text not null default ('synced'),
  `locked` tinyint(1) not null default 0,
  `order_no` int not null default 0,
  primary key (`id`),
  unique key `block_user_id_id_key` (`user_id`, `id`),
  -- block_check 는 0002 의 트리거가 지킵니다 — SET NULL 이 걸린 열은 check 에 쓰지 못합니다,
  constraint `block_content_check` check ((json_type(`content`) = 'OBJECT')),
  constraint `block_kind_check` check ((`kind` in ('heading', 'paragraph', 'list', 'metric', 'chart', 'media'))),
  constraint `block_order_no_check` check ((`order_no` >= 0)),
  constraint `block_style_check` check ((json_type(`style`) = 'OBJECT')),
  constraint `block_sync_state_check` check ((`sync_state` in ('synced', 'stale', 'detached')))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `brew_job` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `type` varchar(255) not null,
  `status` text not null default ('queued'),
  `stage` text not null default ('queued'),
  `attempts` int not null default 0,
  `input` json not null,
  `result_id` char(36) null,
  `error_code` text null,
  `failure_retryable` tinyint(1) null,
  `input_idempotency_key` varchar(255) null,
  `created_at` datetime(6) not null default current_timestamp(6),
  `updated_at` datetime(6) not null default current_timestamp(6),
  primary key (`id`),
  unique key `brew_job_user_id_id_key` (`user_id`, `id`),
  constraint `brew_job_attempts_check` check ((`attempts` >= 0)),
  constraint `brew_job_check` check (((`status` <> 'succeeded') OR (`result_id` IS NOT NULL))),
  constraint `brew_job_check1` check (((`status` <> 'failed') OR (`error_code` IS NOT NULL))),
  constraint `brew_job_input_check` check ((json_type(`input`) = 'OBJECT')),
  constraint `brew_job_status_check` check ((`status` in ('queued', 'running', 'succeeded', 'failed'))),
  constraint `brew_job_type_check` check ((`type` in ('interview', 'recipe')))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `brew_source` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `brew_id` char(36) not null,
  `record_id` char(36) not null,
  `rank` int not null,
  `selected_by` text not null,
  `excluded_reason` text null,
  `score` int not null default 0,
  `reason_text` text not null default ('eligible organized record'),
  `is_selected` tinyint(1) not null default 1,
  `updated_at` datetime(6) not null default current_timestamp(6),
  `selected_rank` int generated always as (case when `is_selected` then `rank` end) virtual,
  primary key (`id`),
  unique key `brew_source_user_id_brew_id_record_id_key` (`user_id`, `brew_id`, `record_id`),
  unique key `brew_source_user_id_id_key` (`user_id`, `id`),
  unique key `selected_rank_unique` (`user_id`, `brew_id`, `selected_rank`),
  constraint `brew_source_rank_check` check ((`rank` >= 0)),
  constraint `brew_source_score_check` check ((`score` >= 0)),
  constraint `brew_source_selected_by_check` check ((`selected_by` in ('auto', 'user'))),
  constraint `brew_source_selection_reason_check` check (((`is_selected` AND (`excluded_reason` IS NULL)) OR ((NOT `is_selected`) AND (`excluded_reason` IS NOT NULL))))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `career_profile` (
  `user_id` char(36) not null,
  `target_roles` json not null default (cast('[]' as json)),
  `experience_years` int not null,
  `primary_goal` text not null,
  `updated_at` datetime(6) not null default current_timestamp(6),
  primary key (`user_id`),
  constraint `career_profile_experience_years_check` check (((`experience_years` >= 0) AND (`experience_years` <= 12))),
  constraint `career_profile_primary_goal_check` check ((`primary_goal` in ('explore', 'build', 'organize'))),
  constraint `career_profile_target_roles_check` check (json_length(`target_roles`) <= 8 and json_contains(`target_roles`, cast('null' as json)) = 0)
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `category_view` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `category_id` char(36) not null,
  `name` varchar(255) not null,
  `view_type` text not null,
  `filters` json not null default (cast('[]' as json)),
  `sorts` json not null default (cast('[]' as json)),
  `visible_properties` json not null default (cast('[]' as json)),
  `sort_order` int not null default 0,
  `created_at` datetime(6) not null default current_timestamp(6),
  primary key (`id`),
  unique key `category_view_user_id_category_id_name_key` (`user_id`, `category_id`, `name`),
  unique key `category_view_user_id_id_key` (`user_id`, `id`),
  constraint `category_view_filters_check` check ((json_type(`filters`) = 'ARRAY')),
  constraint `category_view_sort_order_check` check ((`sort_order` >= 0)),
  constraint `category_view_sorts_check` check ((json_type(`sorts`) = 'ARRAY')),
  constraint `category_view_view_type_check` check ((`view_type` in ('table', 'gallery', 'timeline', 'board', 'list')))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `company_research_item` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `company_id` char(36) not null,
  `kind` varchar(255) not null,
  `topic` text not null,
  `statement` text not null,
  `source_url` text null,
  `published_at` datetime(6) null,
  `captured_at` datetime(6) not null default current_timestamp(6),
  `confidence` text not null,
  `basis_fact_ids` json not null default (cast('[]' as json)),
  primary key (`id`),
  unique key `company_research_item_user_id_id_key` (`user_id`, `id`),
  constraint `company_research_item_check` check ((((`kind` = 'fact') AND (`source_url` IS NOT NULL) AND (json_length(`basis_fact_ids`) = 0)) OR ((`kind` = 'signal') AND (json_length(`basis_fact_ids`) > 0)))),
  constraint `company_research_item_confidence_check` check ((`confidence` in ('low', 'medium', 'high'))),
  constraint `company_research_item_kind_check` check ((`kind` in ('fact', 'signal'))),
  constraint `company_research_item_statement_check` check (((char_length(`statement`) >= 1) AND (char_length(`statement`) <= 2000))),
  constraint `company_research_item_topic_check` check (((char_length(`topic`) >= 1) AND (char_length(`topic`) <= 100)))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `consent` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `scope` varchar(255) not null,
  `policy_version` int not null,
  `granted_at` datetime(6) not null default current_timestamp(6),
  `revoked_at` datetime(6) null,
  `active_scope` varchar(255) generated always as (case when `revoked_at` is null then `scope` end) virtual,
  primary key (`id`),
  unique key `consent_user_id_id_key` (`user_id`, `id`),
  unique key `active_scope_unique` (`user_id`, `active_scope`),
  constraint `consent_check` check (((`revoked_at` IS NULL) OR (`revoked_at` >= `granted_at`))),
  constraint `consent_policy_version_check` check ((`policy_version` > 0)),
  constraint `consent_scope_check` check ((`scope` in ('job_posting_analysis', 'career_records')))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `visit_event` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `deployment_id` char(36) not null,
  `session_id` text not null,
  `referrer` text null,
  `org_domain` text null,
  `is_owner` tinyint(1) not null default 0,
  `started_at` datetime(6) not null default current_timestamp(6),
  `event_id` char(36) null,
  `completed` tinyint(1) not null default 0,
  `duration_ms` int null,
  primary key (`id`),
  unique key `visit_event_event_id_key` (`event_id`),
  unique key `visit_event_user_id_id_key` (`user_id`, `id`),
  constraint `visit_event_duration_ms_check` check (((`duration_ms` IS NULL) OR (`duration_ms` >= 0)))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `conversion_event` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `visit_event_id` char(36) not null,
  `kind` text not null,
  `target` text not null,
  `event_id` char(36) null,
  `occurred_at` datetime(6) not null default current_timestamp(6),
  primary key (`id`),
  unique key `conversion_event_event_id_key` (`event_id`),
  unique key `conversion_event_user_id_id_key` (`user_id`, `id`),
  constraint `conversion_event_kind_check` check ((`kind` in ('contact_click', 'file_download', 'link_click')))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `dashboard_view` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `portfolio_id` char(36) not null,
  `name` varchar(255) not null,
  `period` text not null,
  `is_default` tinyint(1) not null default 0,
  `default_portfolio_id` char(36) generated always as (case when `is_default` then `portfolio_id` end) virtual,
  primary key (`id`),
  unique key `dashboard_view_user_id_id_key` (`user_id`, `id`),
  unique key `dashboard_view_user_id_portfolio_id_name_key` (`user_id`, `portfolio_id`, `name`),
  unique key `default_portfolio_id_unique` (`user_id`, `default_portfolio_id`),
  constraint `dashboard_view_period_check` check ((`period` in ('7d', '30d', 'all')))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `deployment_slug_redirect` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `portfolio_id` char(36) not null,
  `old_slug` varchar(255) not null,
  `new_slug` text not null,
  `created_at` datetime(6) not null default current_timestamp(6),
  `expires_at` datetime(6) not null,
  primary key (`id`),
  unique key `deployment_slug_redirect_old_slug_key` (`old_slug`),
  constraint `deployment_slug_redirect_check` check ((`old_slug` <> `new_slug`)),
  constraint `deployment_slug_redirect_check1` check ((`expires_at` > `created_at`))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `derived_metric` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `name` varchar(255) not null,
  `numerator_key` text not null,
  `denominator_key` text not null,
  primary key (`id`),
  unique key `derived_metric_user_id_id_key` (`user_id`, `id`),
  unique key `derived_metric_user_id_name_key` (`user_id`, `name`),
  constraint `derived_metric_check` check ((`numerator_key` <> `denominator_key`))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `export_asset` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `portfolio_id` char(36) not null,
  `kind` varchar(255) not null,
  `file_url` text not null,
  `page_format` text null,
  `download_count` int not null default 0,
  `version` int not null default 1,
  `access_nonce` char(36) not null default (uuid()),
  `revoked_at` datetime(6) null,
  `created_at` datetime(6) not null default current_timestamp(6),
  `active_resume_portfolio_id` char(36) generated always as (case when `kind` = 'resume_file' and `revoked_at` is null then `portfolio_id` end) virtual,
  primary key (`id`),
  unique key `export_asset_user_id_id_key` (`user_id`, `id`),
  unique key `active_resume_portfolio_id_unique` (`user_id`, `active_resume_portfolio_id`),
  constraint `export_asset_download_count_check` check ((`download_count` >= 0)),
  constraint `export_asset_kind_check` check ((`kind` in ('pdf', 'deck', 'resume_file'))),
  constraint `export_asset_page_format_check` check (((`page_format` IS NULL) OR (`page_format` in ('letter', 'a4')))),
  constraint `export_asset_version_check` check ((`version` > 0))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `export_job` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `portfolio_id` char(36) not null,
  `deployment_id` char(36) null,
  `kind` text not null,
  `page_format` text null,
  `status` text not null default ('queued'),
  `attempts` int not null default 0,
  `idempotency_key` varchar(255) not null,
  `request_hash` text not null,
  `asset_id` char(36) null,
  `error_code` text null,
  `created_at` datetime(6) not null default current_timestamp(6),
  `updated_at` datetime(6) not null default current_timestamp(6),
  primary key (`id`),
  unique key `export_job_user_id_id_key` (`user_id`, `id`),
  unique key `export_job_user_id_idempotency_key_key` (`user_id`, `idempotency_key`),
  constraint `export_job_attempts_check` check ((`attempts` >= 0)),
  constraint `export_job_kind_check` check ((`kind` in ('pdf', 'deck'))),
  constraint `export_job_page_format_check` check (((`page_format` IS NULL) OR (`page_format` in ('letter', 'a4')))),
  constraint `export_job_status_check` check ((`status` in ('queued', 'running', 'done', 'failed')))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `generated_page` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `portfolio_id` char(36) not null,
  `html` text not null,
  `css` text not null,
  `rationale` text not null default (''),
  `revision` int not null,
  `instruction` text null,
  `prompt_version` int not null,
  `ungrounded_numbers` json not null default (cast('[]' as json)),
  `removed` json not null default (cast('[]' as json)),
  `created_at` datetime(6) not null default current_timestamp(6),
  `quality_status` text not null default ('ready'),
  `qa_report` json not null default (cast('{"checks": [], "status": "ready"}' as json)),
  `generation_manifest` json not null default (cast('{}' as json)),
  `portfolio_plan_snapshot` json null,
  `style_spec_snapshot` json null,
  `design_principles_version` int not null default 1,
  primary key (`id`),
  unique key `generated_page_portfolio_id_revision_key` (`portfolio_id`, `revision`),
  unique key `generated_page_user_id_id_key` (`user_id`, `id`),
  constraint `generated_page_design_principles_version_check` check ((`design_principles_version` > 0)),
  constraint `generated_page_generation_manifest_check` check ((json_type(`generation_manifest`) = 'OBJECT')),
  constraint `generated_page_portfolio_plan_snapshot_check` check (((`portfolio_plan_snapshot` IS NULL) OR (json_type(`portfolio_plan_snapshot`) = 'OBJECT'))),
  constraint `generated_page_qa_report_check` check ((json_type(`qa_report`) = 'OBJECT')),
  constraint `generated_page_quality_status_check` check ((`quality_status` in ('ready', 'failed_qa'))),
  constraint `generated_page_revision_check` check ((`revision` >= 0)),
  constraint `generated_page_style_spec_snapshot_check` check (((`style_spec_snapshot` IS NULL) OR (json_type(`style_spec_snapshot`) = 'OBJECT')))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `generation_job` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `brew_id` char(36) not null,
  `recipe_id` char(36) not null,
  `template_id` char(36) not null,
  `status` varchar(255) not null default 'queued',
  `usage_charged` tinyint(1) not null default 0,
  `error_code` text null,
  `input_idempotency_key` varchar(255) null,
  `request_hash` text null,
  `stage` text not null default ('queued'),
  `attempts` int not null default 0,
  `failure_retryable` tinyint(1) null,
  `portfolio_id` char(36) null,
  `created_at` datetime(6) not null default current_timestamp(6),
  `updated_at` datetime(6) not null default current_timestamp(6),
  `style_overrides` json not null default (cast('{}' as json)),
  primary key (`id`),
  unique key `generation_job_user_id_id_key` (`user_id`, `id`),
  constraint `generation_job_attempts_check` check ((`attempts` >= 0)),
  constraint `generation_job_stage_check` check ((`stage` in ('queued', 'validating', 'materializing', 'charging', 'done', 'failed'))),
  constraint `generation_job_status_check` check ((`status` in ('queued', 'running', 'done', 'failed'))),
  constraint `generation_job_style_overrides_check` check ((json_type(`style_overrides`) = 'OBJECT'))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `recipe_item` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `recipe_section_id` char(36) not null,
  `order_no` int not null,
  `point_text` text not null,
  `evidence` json not null,
  `locked` tinyint(1) not null default 0,
  `edited_by` text not null,
  `updated_at` datetime(6) not null default current_timestamp(6),
  primary key (`id`),
  unique key `recipe_item_user_id_id_key` (`user_id`, `id`),
  unique key `recipe_item_user_id_recipe_section_id_order_no_key` (`user_id`, `recipe_section_id`, `order_no`),
  constraint `recipe_item_edited_by_check` check ((`edited_by` in ('ai', 'user'))),
  constraint `recipe_item_evidence_check` check (((json_type(`evidence`) = 'ARRAY') AND (json_length(`evidence`) > 0))),
  constraint `recipe_item_order_no_check` check ((`order_no` >= 0))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `recipe_evidence_path` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `recipe_id` char(36) not null,
  `recipe_item_id` char(36) not null,
  `source_type` varchar(255) not null,
  `source_id` char(36) not null,
  `source_label` text not null,
  `target_path` text not null,
  `created_at` datetime(6) not null default current_timestamp(6),
  primary key (`id`),
  unique key `recipe_evidence_path_user_id_id_key` (`user_id`, `id`),
  unique key `recipe_evidence_path_user_id_recipe_id_source_type_source_i_key` (`user_id`, `recipe_id`, `source_type`, `source_id`, `recipe_item_id`),
  constraint `recipe_evidence_path_source_type_check` check ((`source_type` in ('requirement', 'record', 'answer')))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `generation_sentence_evidence` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `generation_job_id` char(36) not null,
  `block_id` char(36) not null,
  `recipe_evidence_path_id` char(36) not null,
  `source_quote` text not null,
  `created_at` datetime(6) not null default current_timestamp(6),
  primary key (`id`),
  unique key `generation_sentence_evidence_user_id_generation_job_id_bloc_key` (`user_id`, `generation_job_id`, `block_id`, `recipe_evidence_path_id`),
  unique key `generation_sentence_evidence_user_id_id_key` (`user_id`, `id`)
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `usage_counter` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `period_start` date not null,
  `used` int not null default 0,
  `resets_at` datetime(6) not null,
  primary key (`id`),
  unique key `usage_counter_user_id_id_key` (`user_id`, `id`),
  unique key `usage_counter_user_id_period_start_key` (`user_id`, `period_start`),
  constraint `usage_counter_used_check` check ((`used` >= 0))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `generation_usage_ledger` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `generation_job_id` char(36) not null,
  `usage_counter_id` char(36) null,
  `amount` int not null,
  `reason` varchar(255) not null,
  `created_at` datetime(6) not null default current_timestamp(6),
  primary key (`id`),
  unique key `generation_usage_ledger_user_id_generation_job_id_reason_key` (`user_id`, `generation_job_id`, `reason`),
  unique key `generation_usage_ledger_user_id_id_key` (`user_id`, `id`),
  constraint `generation_usage_ledger_amount_check` check ((`amount` in ('-1', 1)))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `identity_oauth_account` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `provider` varchar(255) not null,
  `provider_account_id` varchar(255) not null,
  `email` varchar(320) character set utf8mb4 collate utf8mb4_0900_ai_ci not null,
  `linked_at` datetime(6) not null default current_timestamp(6),
  `last_login_at` datetime(6) null,
  primary key (`id`),
  unique key `identity_oauth_account_provider_provider_account_id_key` (`provider`, `provider_account_id`),
  unique key `identity_oauth_account_user_id_provider_key` (`user_id`, `provider`),
  constraint `identity_oauth_account_provider_account_id_check` check (((char_length(`provider_account_id`) >= 1) AND (char_length(`provider_account_id`) <= 255))),
  constraint `identity_oauth_account_provider_check` check ((`provider` = 'google'))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `identity_session` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `token_hash` varchar(255) not null,
  `expires_at` datetime(6) not null,
  `revoked_at` datetime(6) null,
  `last_seen_at` datetime(6) null,
  `created_at` datetime(6) not null default current_timestamp(6),
  primary key (`id`),
  unique key `identity_session_token_hash_key` (`token_hash`),
  unique key `identity_session_user_id_id_key` (`user_id`, `id`),
  constraint `identity_session_check` check ((`expires_at` > `created_at`)),
  constraint `identity_session_token_hash_check` check ((regexp_like(`token_hash`, '^[0-9a-f]{64}$')))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `insight` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `deployment_id` char(36) not null,
  `period_start` date null,
  `period_end` date null,
  `narrative` text not null,
  `evidence_metrics` json not null,
  `suggestions` json not null default (cast('[]' as json)),
  `generated_at` datetime(6) not null default current_timestamp(6),
  primary key (`id`),
  unique key `insight_user_id_id_key` (`user_id`, `id`),
  constraint `insight_suggestions_check` check (((json_type(`suggestions`) = 'ARRAY') AND (json_length(`suggestions`) <= 2)))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `interest` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `job_posting_id` char(36) not null,
  `stage` text not null default ('saved'),
  `deadline_at` datetime(6) null,
  `memo` text null,
  `updated_at` datetime(6) not null default current_timestamp(6),
  primary key (`id`),
  unique key `interest_user_id_id_key` (`user_id`, `id`),
  unique key `interest_user_id_job_posting_id_key` (`user_id`, `job_posting_id`),
  constraint `interest_stage_check` check ((`stage` in ('saved', 'applied', 'closed')))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `job_analysis_history` (
  `job_analysis_id` char(36) not null,
  `user_id` char(36) not null,
  `previous_version` int not null,
  `requirements` json not null,
  `archived_at` datetime(6) not null default current_timestamp(6),
  primary key (`job_analysis_id`),
  unique key `job_analysis_history_user_id_job_analysis_id_key` (`user_id`, `job_analysis_id`),
  constraint `job_analysis_history_previous_version_check` check ((`previous_version` > 0)),
  constraint `job_analysis_history_requirements_check` check ((json_type(`requirements`) = 'ARRAY'))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `job_source` (
  `id` char(36) not null default (uuid()),
  `provider` varchar(255) not null,
  `token` varchar(255) not null,
  `display_name` text not null,
  `is_active` tinyint(1) not null default 1,
  `last_run_at` datetime(6) null,
  `last_status` text null,
  `last_error` text null,
  `last_seen_count` int not null default 0,
  `last_added_count` int not null default 0,
  `created_at` datetime(6) not null default current_timestamp(6),
  `site_url` text null,
  primary key (`id`),
  unique key `job_source_provider_token_key` (`provider`, `token`),
  constraint `job_source_last_added_count_check` check ((`last_added_count` >= 0)),
  constraint `job_source_last_seen_count_check` check ((`last_seen_count` >= 0)),
  constraint `job_source_last_status_check` check (((`last_status` IS NULL) OR (`last_status` in ('succeeded', 'failed')))),
  constraint `job_source_provider_check` check ((`provider` in ('greenhouse', 'lever', 'ashby', 'work24')))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `layout_spec` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `portfolio_id` char(36) not null,
  `batch_id` char(36) not null,
  `generation_job_id` char(36) null,
  `seed_template_id` char(36) null,
  `spec` json not null,
  `prompt_version` int not null,
  `edited_by` text not null default ('ai'),
  `order_no` int not null default 0,
  `selected` tinyint(1) not null default 0,
  `created_at` datetime(6) not null default current_timestamp(6),
  `instruction` text null,
  `selected_portfolio_id` char(36) generated always as (case when `selected` then `portfolio_id` end) virtual,
  primary key (`id`),
  unique key `layout_spec_user_id_id_key` (`user_id`, `id`),
  unique key `selected_portfolio_id_unique` (`user_id`, `selected_portfolio_id`),
  constraint `layout_spec_edited_by_check` check ((`edited_by` in ('ai', 'user'))),
  constraint `layout_spec_instruction_check` check (((`instruction` IS NULL) OR ((char_length(`instruction`) >= 1) AND (char_length(`instruction`) <= 300)))),
  constraint `layout_spec_order_no_check` check ((`order_no` >= 0)),
  constraint `layout_spec_prompt_version_check` check ((`prompt_version` > 0)),
  constraint `layout_spec_spec_check` check ((json_type(`spec`) = 'OBJECT'))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `match_score` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `job_posting_id` char(36) not null,
  `total` decimal(18,6) not null,
  `axes` json not null,
  `reason_text` text not null,
  `computed_at` datetime(6) not null default current_timestamp(6),
  `next_action` text not null,
  primary key (`id`),
  unique key `match_score_user_id_id_key` (`user_id`, `id`),
  unique key `match_score_user_id_job_posting_id_key` (`user_id`, `job_posting_id`),
  constraint `match_score_axes_check` check ((json_type(`axes`) = 'OBJECT'))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `media_asset` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `storage_key` text not null,
  `mime_type` text not null,
  `width` int not null,
  `height` int not null,
  `byte_size` int not null,
  `checksum` varchar(255) not null,
  `created_at` datetime(6) not null default current_timestamp(6),
  primary key (`id`),
  unique key `media_asset_user_id_checksum_key` (`user_id`, `checksum`),
  unique key `media_asset_user_id_id_key` (`user_id`, `id`),
  constraint `media_asset_byte_size_check` check ((`byte_size` > 0)),
  constraint `media_asset_height_check` check ((`height` > 0)),
  constraint `media_asset_mime_type_check` check ((`mime_type` in ('image/png', 'image/jpeg', 'image/webp', 'image/gif'))),
  constraint `media_asset_width_check` check ((`width` > 0))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `media_variant` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `media_asset_id` char(36) not null,
  `storage_key` text not null,
  `mime_type` text not null,
  `width` int not null,
  `height` int not null,
  `byte_size` int not null,
  `created_at` datetime(6) not null default current_timestamp(6),
  primary key (`id`),
  unique key `media_variant_media_asset_id_width_key` (`media_asset_id`, `width`),
  unique key `media_variant_user_id_id_key` (`user_id`, `id`),
  constraint `media_variant_byte_size_check` check ((`byte_size` > 0)),
  constraint `media_variant_height_check` check ((`height` > 0)),
  constraint `media_variant_mime_type_check` check ((`mime_type` = 'image/webp')),
  constraint `media_variant_width_check` check ((`width` > 0))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `metric_daily` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `deployment_id` char(36) not null,
  `date` date not null,
  `metric_key` varchar(255) not null,
  `value` decimal(18,6) not null,
  `sample_size` int not null,
  primary key (`id`),
  unique key `metric_daily_user_id_deployment_id_date_metric_key_key` (`user_id`, `deployment_id`, `date`, `metric_key`),
  unique key `metric_daily_user_id_id_key` (`user_id`, `id`),
  constraint `metric_daily_sample_size_check` check ((`sample_size` >= 0))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `notification` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `kind` text not null,
  `target_url` text not null,
  `dedupe_key` varchar(255) not null,
  `read_at` datetime(6) null,
  `dedupe_date` date not null default (curdate()),
  `delivery_status` varchar(255) not null default 'queued',
  `attempts` int not null default 0,
  `next_attempt_at` datetime(6) not null default current_timestamp(6),
  `last_error` text null,
  `created_at` datetime(6) not null default current_timestamp(6),
  `delivered_at` datetime(6) null,
  primary key (`id`),
  unique key `notification_user_id_id_key` (`user_id`, `id`),
  constraint `notification_attempts_check` check ((`attempts` >= 0)),
  constraint `notification_delivery_status_check` check ((`delivery_status` in ('queued', 'sending', 'sent', 'failed', 'suppressed'))),
  constraint `notification_kind_check` check ((`kind` in ('deadline', 'saved_search', 'generation', 'traffic')))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `notification_preference` (
  `user_id` char(36) not null,
  `kind` varchar(255) not null,
  `enabled` tinyint(1) not null default 1,
  `updated_at` datetime(6) not null default current_timestamp(6),
  primary key (`user_id`, `kind`),
  constraint `notification_preference_kind_check` check ((`kind` in ('deadline', 'saved_search', 'generation', 'traffic')))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `platform_outbox` (
  `id` char(36) not null default (uuid()),
  `topic` text not null,
  `payload` json not null,
  `idempotency_key` varchar(255) not null,
  `state` varchar(255) not null default 'pending',
  `attempts` int not null default 0,
  `available_at` datetime(6) not null default current_timestamp(6),
  `locked_at` datetime(6) null,
  `published_at` datetime(6) null,
  `last_error` text null,
  `created_at` datetime(6) not null default current_timestamp(6),
  `updated_at` datetime(6) not null default current_timestamp(6),
  primary key (`id`),
  unique key `platform_outbox_idempotency_key_key` (`idempotency_key`),
  constraint `platform_outbox_attempts_check` check ((`attempts` >= 0)),
  constraint `platform_outbox_check` check (((`state` = 'publishing') = (`locked_at` IS NOT NULL))),
  constraint `platform_outbox_check1` check (((`state` = 'published') = (`published_at` IS NOT NULL))),
  constraint `platform_outbox_idempotency_key_check` check (((char_length(`idempotency_key`) >= 16) AND (char_length(`idempotency_key`) <= 128))),
  constraint `platform_outbox_payload_check` check ((json_type(`payload`) = 'OBJECT')),
  constraint `platform_outbox_state_check` check ((`state` in ('pending', 'publishing', 'published', 'dead_letter'))),
  constraint `platform_outbox_topic_check` check ((regexp_like(`topic`, '^[a-z][a-z0-9._-]{1,99}$')))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `portfolio_edit_proposal` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `portfolio_id` char(36) not null,
  `target_path` text not null,
  `block_id` char(36) not null,
  `operation` text not null,
  `before_state` json not null,
  `after_state` json not null,
  `source_record_id` char(36) null,
  `status` varchar(255) not null default 'pending',
  `created_at` datetime(6) not null default current_timestamp(6),
  `expires_at` datetime(6) not null,
  `applied_at` datetime(6) null,
  `patches` json not null default (cast('[]' as json)),
  `instruction` text null,
  primary key (`id`),
  unique key `portfolio_edit_proposal_user_id_id_key` (`user_id`, `id`),
  constraint `portfolio_edit_proposal_after_state_check` check ((json_type(`after_state`) = 'OBJECT')),
  constraint `portfolio_edit_proposal_before_state_check` check ((json_type(`before_state`) = 'OBJECT')),
  constraint `portfolio_edit_proposal_instruction_check` check (((`instruction` IS NULL) OR ((char_length(`instruction`) >= 1) AND (char_length(`instruction`) <= 500)))),
  constraint `portfolio_edit_proposal_instruction_present` check (((`operation` <> 'instruct') OR ((`instruction` IS NOT NULL) AND (json_length(`patches`) > 0)))),
  constraint `portfolio_edit_proposal_operation_check` check ((`operation` in ('update_text', 'set_style', 'insert_record', 'instruct'))),
  constraint `portfolio_edit_proposal_patches_check` check ((json_type(`patches`) = 'ARRAY')),
  constraint `portfolio_edit_proposal_status_check` check ((`status` in ('pending', 'applied', 'rejected', 'expired')))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `portfolio_snapshot` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `portfolio_id` char(36) not null,
  `kind` text not null,
  `snapshot` json not null,
  `created_at` datetime(6) not null default current_timestamp(6),
  primary key (`id`),
  unique key `portfolio_snapshot_user_id_id_key` (`user_id`, `id`),
  constraint `portfolio_snapshot_kind_check` check ((`kind` in ('initial_generation', 'edit', 'manual'))),
  constraint `portfolio_snapshot_snapshot_check` check ((json_type(`snapshot`) = 'OBJECT'))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `recent_search` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `query_text` text not null,
  `conditions` json not null default (cast('[]' as json)),
  `result_count` int not null default 0,
  `created_at` datetime(6) not null default current_timestamp(6),
  primary key (`id`),
  unique key `recent_search_user_id_id_key` (`user_id`, `id`),
  constraint `recent_search_conditions_check` check ((json_type(`conditions`) = 'ARRAY')),
  constraint `recent_search_result_count_check` check ((`result_count` >= 0))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `recipe_revision` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `recipe_id` char(36) not null,
  `actor` text not null,
  `action` text not null,
  `snapshot` json not null,
  `diff` json not null,
  `created_at` datetime(6) not null default current_timestamp(6),
  primary key (`id`),
  unique key `recipe_revision_user_id_id_key` (`user_id`, `id`),
  constraint `recipe_revision_actor_check` check ((`actor` in ('ai', 'user'))),
  constraint `recipe_revision_diff_check` check ((json_type(`diff`) = 'ARRAY')),
  constraint `recipe_revision_snapshot_check` check ((json_type(`snapshot`) = 'OBJECT'))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `recipe_unused_source` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `recipe_id` char(36) not null,
  `record_id` char(36) not null,
  `reason` text not null,
  `created_at` datetime(6) not null default current_timestamp(6),
  primary key (`id`),
  unique key `recipe_unused_source_user_id_id_key` (`user_id`, `id`),
  unique key `recipe_unused_source_user_id_recipe_id_record_id_key` (`user_id`, `recipe_id`, `record_id`),
  constraint `recipe_unused_source_reason_check` check ((char_length(`reason`) > 0))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `record_link` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `from_record_id` char(36) not null,
  `to_record_id` char(36) not null,
  `relation` varchar(255) not null,
  `created_by` text not null,
  primary key (`id`),
  unique key `record_link_user_id_from_record_id_to_record_id_relation_key` (`user_id`, `from_record_id`, `to_record_id`, `relation`),
  unique key `record_link_user_id_id_key` (`user_id`, `id`),
  constraint `record_link_check` check ((`from_record_id` <> `to_record_id`)),
  constraint `record_link_created_by_check` check ((`created_by` in ('user', 'ai'))),
  constraint `record_link_relation_check` check ((`relation` in ('related', 'parent', 'duplicate_of')))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `record_usage` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `record_id` char(36) not null,
  `block_id` char(36) not null,
  `quoted_text` text not null,
  `first_used_at` datetime(6) not null default current_timestamp(6),
  primary key (`id`),
  unique key `record_usage_user_id_id_key` (`user_id`, `id`),
  unique key `record_usage_user_id_record_id_block_id_key` (`user_id`, `record_id`, `block_id`)
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `requirement_coverage` (
  `user_id` char(36) not null,
  `requirement_id` char(36) not null,
  `coverage` text not null,
  `covered_by` json not null default (cast('[]' as json)),
  `computed_at` datetime(6) not null default current_timestamp(6),
  primary key (`user_id`, `requirement_id`),
  constraint `requirement_coverage_coverage_check` check ((`coverage` in ('covered', 'partial', 'missing')))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `revision` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `portfolio_id` char(36) not null,
  `block_id` char(36) null,
  `actor` text not null,
  `before` json null,
  `after` json null,
  `restore_label` text null,
  `proposal_id` char(36) null,
  `reverted_revision_id` char(36) null,
  `change_kind` text not null default ('edit'),
  `summary` text not null default ('portfolio changed'),
  `created_at` datetime(6) not null default current_timestamp(6),
  primary key (`id`),
  unique key `revision_user_id_id_key` (`user_id`, `id`),
  constraint `revision_actor_check` check ((`actor` in ('user', 'ai'))),
  constraint `revision_change_kind_check` check ((`change_kind` in ('edit', 'revert', 'restore'))),
  constraint `revision_check` check (((`before` IS NOT NULL) OR (`after` IS NOT NULL)))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `saved_search` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `query_text` text not null,
  `filters` json not null default (cast('{}' as json)),
  `notify` tinyint(1) not null default 0,
  `last_run_at` datetime(6) null,
  `name` varchar(255) not null,
  `created_at` datetime(6) not null default current_timestamp(6),
  `updated_at` datetime(6) not null default current_timestamp(6),
  primary key (`id`),
  unique key `saved_search_user_id_id_key` (`user_id`, `id`),
  constraint `saved_search_filters_check` check ((json_type(`filters`) = 'OBJECT'))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `scheduled_job_definition` (
  `job_key` varchar(255) not null,
  `interval_seconds` int not null,
  `next_run_at` datetime(6) not null,
  `last_started_at` datetime(6) null,
  `last_finished_at` datetime(6) null,
  `last_status` text null,
  `failure_count` int not null default 0,
  primary key (`job_key`),
  constraint `scheduled_job_definition_failure_count_check` check ((`failure_count` >= 0)),
  constraint `scheduled_job_definition_interval_seconds_check` check (((`interval_seconds` >= 60) AND (`interval_seconds` <= 604800))),
  constraint `scheduled_job_definition_job_key_check` check ((`job_key` in ('saved_searches', 'expire_postings', 'notification_batch', 'analytics_daily', 'deletion_grace', 'retention', 'job_ingest', 'posting_facts'))),
  constraint `scheduled_job_definition_last_status_check` check (((`last_status` IS NULL) OR (`last_status` in ('succeeded', 'failed'))))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `scheduled_job_run` (
  `id` char(36) not null default (uuid()),
  `job_key` varchar(255) not null,
  `scheduled_for` datetime(6) not null,
  `status` varchar(255) not null default 'queued',
  `attempts` int not null default 0,
  `started_at` datetime(6) null,
  `finished_at` datetime(6) null,
  `last_error` text null,
  `result` json null,
  `created_at` datetime(6) not null default current_timestamp(6),
  primary key (`id`),
  unique key `scheduled_job_run_job_key_scheduled_for_key` (`job_key`, `scheduled_for`),
  constraint `scheduled_job_run_attempts_check` check ((`attempts` >= 0)),
  constraint `scheduled_job_run_result_check` check (((`result` IS NULL) OR (json_type(`result`) = 'OBJECT'))),
  constraint `scheduled_job_run_status_check` check ((`status` in ('queued', 'running', 'succeeded', 'failed')))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `section_view` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `visit_event_id` char(36) not null,
  `portfolio_section_id` char(36) not null,
  `dwell_ms` int not null,
  `scroll_depth` decimal(18,6) not null,
  `exited` tinyint(1) not null default 0,
  `event_id` char(36) null,
  `occurred_at` datetime(6) not null default current_timestamp(6),
  primary key (`id`),
  unique key `section_view_event_id_key` (`event_id`),
  unique key `section_view_user_id_id_key` (`user_id`, `id`),
  constraint `section_view_dwell_ms_check` check ((`dwell_ms` >= 0)),
  constraint `section_view_scroll_depth_check` check (((`scroll_depth` >= (0)) AND (`scroll_depth` <= (1))))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `skill` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `name` varchar(255) not null,
  `level` int not null,
  `computed_at` datetime(6) not null default current_timestamp(6),
  `demand_score` decimal(18,6) null,
  `evidence_count` int not null default 0,
  `last_used_at` datetime(6) null,
  `strength` text not null default ('weak'),
  primary key (`id`),
  unique key `skill_user_id_id_key` (`user_id`, `id`),
  unique key `skill_user_id_name_key` (`user_id`, `name`),
  constraint `skill_evidence_count_check` check ((`evidence_count` >= 0)),
  constraint `skill_level_check` check (((`level` >= 1) AND (`level` <= 5))),
  constraint `skill_strength_check` check ((`strength` in ('weak', 'supported', 'strong')))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `skill_evidence` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `skill_id` char(36) not null,
  `record_id` char(36) not null,
  `weight` decimal(18,6) not null,
  `extracted_span` json not null,
  primary key (`id`),
  unique key `skill_evidence_user_id_id_key` (`user_id`, `id`),
  unique key `skill_evidence_user_id_skill_id_record_id_key` (`user_id`, `skill_id`, `record_id`),
  constraint `skill_evidence_extracted_span_check` check ((json_type(`extracted_span`) = 'OBJECT'))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

create table `widget` (
  `id` char(36) not null default (uuid()),
  `user_id` char(36) not null,
  `dashboard_view_id` char(36) not null,
  `metric_key` text null,
  `derived_metric_id` char(36) null,
  `visualization` text not null,
  `compare_to` text null,
  `position` json not null,
  primary key (`id`),
  unique key `widget_user_id_id_key` (`user_id`, `id`),
  -- widget_check 는 0002 의 트리거가 지킵니다 — SET NULL 이 걸린 열은 check 에 쓰지 못합니다,
  constraint `widget_compare_to_check` check (((`compare_to` IS NULL) OR (`compare_to` in ('prev_period', 'other_portfolio', 'industry')))),
  constraint `widget_position_check` check ((json_type(`position`) = 'OBJECT')),
  constraint `widget_visualization_check` check ((`visualization` in ('number', 'spark', 'line', 'bar', 'donut', 'list', 'note')))
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin;

-- 인덱스
create unique index `company_dedupe_key_unique` on `company` (`dedupe_key`);
create index `company_logo_pending_idx` on `company` (`id`);  -- PostgreSQL 에서는 조건부 인덱스였습니다: where (logo_read_at IS NULL)
create unique index `job_posting_dedupe_hash_unique` on `job_posting` (`dedupe_hash`);
create index `job_posting_experience_years_idx` on `job_posting` (`experience_min_years`);  -- PostgreSQL 에서는 조건부 인덱스였습니다: where (experience_min_years IS NOT NULL)
create index `job_posting_expires_at_idx` on `job_posting` (`expires_at`);  -- PostgreSQL 에서는 조건부 인덱스였습니다: where (expires_at IS NOT NULL)
create index `job_posting_facts_pending_idx` on `job_posting` (`created_at`);  -- PostgreSQL 에서는 조건부 인덱스였습니다: where (facts_read_at IS NULL)
create index `job_posting_family_region_idx` on `job_posting` (`job_family`, `location_region`);  -- PostgreSQL 에서는 조건부 인덱스였습니다: where (job_family IS NOT NULL)
create index `job_posting_job_family_idx` on `job_posting` (`job_family`);  -- PostgreSQL 에서는 조건부 인덱스였습니다: where (job_family IS NOT NULL)
create index `job_posting_region_idx` on `job_posting` (`location_region`);  -- PostgreSQL 에서는 조건부 인덱스였습니다: where (location_region IS NOT NULL)
create unique index `job_analysis_input_idempotency_unique` on `job_analysis` (`user_id`, `input_idempotency_key`);
create index `job_analysis_user_status_idx` on `job_analysis` (`user_id`, `status`);
create index `brew_user_status_idx` on `brew` (`user_id`, `status`);
create index `portfolio_user_status_idx` on `portfolio` (`user_id`, `status`);
create index `portfolio_user_updated_idx` on `portfolio` (`user_id`, `updated_at` desc, `id` desc);
create index `deployment_portfolio_idx` on `deployment` (`user_id`, `portfolio_id`, `version` desc);
create index `analytics_event_rate_idx` on `analytics_event_receipt` (`visitor_hash`, `received_at` desc);
create unique index `interview_session_idempotency_unique` on `interview_session` (`user_id`, `input_idempotency_key`);
create index `job_posting_requirement_axis_idx` on `job_posting_requirement` (`job_posting_id`, `axis`);  -- PostgreSQL 에서는 조건부 인덱스였습니다: where (axis IS NOT NULL)
create index `job_posting_requirement_posting_idx` on `job_posting_requirement` (`job_posting_id`, `order_no`);
create unique index `category_user_key_unique` on `category` (`user_id`, `key`);
create unique index `record_create_idempotency_unique` on `record` (`user_id`, `create_idempotency_key`);
create index `record_user_category_idx` on `record` (`user_id`, `category_id`);
create unique index `answer_idempotency_unique` on `answer` (`user_id`, `input_idempotency_key`);
create unique index `recipe_idempotency_unique` on `recipe` (`user_id`, `input_idempotency_key`);
create index `block_section_order_idx` on `block` (`user_id`, `portfolio_section_id`, `order_no`, `id`);
create index `block_source_record_idx` on `block` (`user_id`, `source_record_id`);  -- PostgreSQL 에서는 조건부 인덱스였습니다: where (source_record_id IS NOT NULL)
create unique index `brew_job_idempotency_unique` on `brew_job` (`user_id`, `input_idempotency_key`);
create index `brew_job_recent_idx` on `brew_job` (`user_id`, `type`, `created_at` desc);
create index `category_view_user_category_idx` on `category_view` (`user_id`, `category_id`, `sort_order`);
create index `company_research_lookup_idx` on `company_research_item` (`user_id`, `company_id`, `kind`, `captured_at` desc);
create index `consent_lookup_idx` on `consent` (`user_id`, `scope`, `revoked_at`);
create index `visit_event_deployment_started_idx` on `visit_event` (`user_id`, `deployment_id`, `started_at` desc);
create index `deployment_slug_redirect_lookup_idx` on `deployment_slug_redirect` (`old_slug`, `expires_at`);
create index `generated_page_latest_idx` on `generated_page` (`portfolio_id`, `revision` desc);
create unique index `generation_job_idempotency_unique` on `generation_job` (`user_id`, `input_idempotency_key`);
create index `generation_job_user_status_idx` on `generation_job` (`user_id`, `status`);
create index `identity_session_active_token_idx` on `identity_session` (`token_hash`, `expires_at`);  -- PostgreSQL 에서는 조건부 인덱스였습니다: where (revoked_at IS NULL)
create index `identity_session_user_active_idx` on `identity_session` (`user_id`, `created_at` desc);  -- PostgreSQL 에서는 조건부 인덱스였습니다: where (revoked_at IS NULL)
create index `job_source_active_idx` on `job_source` (`provider`, `token`);  -- PostgreSQL 에서는 조건부 인덱스였습니다: where is_active
create index `layout_spec_portfolio_recent_idx` on `layout_spec` (`user_id`, `portfolio_id`, `created_at` desc, `batch_id`, `order_no`);
create index `media_asset_user_created_idx` on `media_asset` (`user_id`, `created_at` desc);
create index `media_variant_asset_idx` on `media_variant` (`media_asset_id`, `width`);
create index `metric_daily_lookup_idx` on `metric_daily` (`user_id`, `deployment_id`, `metric_key`, `date` desc);
create unique index `notification_daily_dedupe_idx` on `notification` (`user_id`, `dedupe_key`, `dedupe_date`);
create index `notification_delivery_ready_idx` on `notification` (`delivery_status`, `next_attempt_at`);  -- PostgreSQL 에서는 조건부 인덱스였습니다: where (delivery_status = ANY (ARRAY['queued'::text, 'failed'::text]))
create index `platform_outbox_dispatch_idx` on `platform_outbox` (`available_at`, `created_at`);  -- PostgreSQL 에서는 조건부 인덱스였습니다: where (state = ANY (ARRAY['pending'::text, 'publishing'::text]))
create index `portfolio_edit_proposal_pending_idx` on `portfolio_edit_proposal` (`user_id`, `portfolio_id`, `status`, `expires_at`);
create index `portfolio_snapshot_recent_idx` on `portfolio_snapshot` (`user_id`, `portfolio_id`, `created_at` desc, `id` desc);
create index `recent_search_user_created_idx` on `recent_search` (`user_id`, `created_at` desc);
create index `recipe_revision_recent_idx` on `recipe_revision` (`user_id`, `recipe_id`, `created_at` desc, `id` desc);
create index `record_link_to_idx` on `record_link` (`user_id`, `to_record_id`);
create index `requirement_coverage_user_idx` on `requirement_coverage` (`user_id`);
create unique index `saved_search_user_name_unique` on `saved_search` (`user_id`, `name`);
create index `scheduled_job_due_idx` on `scheduled_job_definition` (`next_run_at`);
create index `scheduled_job_run_status_idx` on `scheduled_job_run` (`status`, `scheduled_for`);

-- 외래 키 — 표를 모두 만든 뒤에 겁니다
alter table `user` add constraint `user_plan_id_fkey` foreign key (`plan_id`) references `plan` (`id`) on delete restrict;
alter table `account_deletion_request` add constraint `account_deletion_request_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete set null;
alter table `account_deletion_event` add constraint `account_deletion_event_request_id_fkey` foreign key (`request_id`) references `account_deletion_request` (`id`) on delete cascade;
alter table `job_posting` add constraint `job_posting_company_id_fkey` foreign key (`company_id`) references `company` (`id`) on delete restrict;
alter table `job_analysis` add constraint `job_analysis_job_posting_id_fkey` foreign key (`job_posting_id`) references `job_posting` (`id`) on delete set null;
alter table `job_analysis` add constraint `job_analysis_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `brew` add constraint `brew_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `brew` add constraint `brew_user_id_job_analysis_id_fkey` foreign key (`user_id`, `job_analysis_id`) references `job_analysis` (`user_id`, `id`) on delete restrict;
alter table `portfolio` add constraint `portfolio_current_deployment_fk` foreign key (`current_deployment_id`) references `deployment` (`id`) on delete set null;
alter table `portfolio` add constraint `portfolio_template_id_fkey` foreign key (`template_id`) references `template` (`id`) on delete restrict;
alter table `portfolio` add constraint `portfolio_user_id_brew_id_fkey` foreign key (`user_id`, `brew_id`) references `brew` (`user_id`, `id`) on delete restrict;
alter table `portfolio` add constraint `portfolio_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `deployment` add constraint `deployment_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `deployment` add constraint `deployment_user_id_portfolio_id_fkey` foreign key (`user_id`, `portfolio_id`) references `portfolio` (`user_id`, `id`) on delete cascade;
alter table `analytics_event_receipt` add constraint `analytics_event_receipt_user_id_deployment_id_fkey` foreign key (`user_id`, `deployment_id`) references `deployment` (`user_id`, `id`) on delete cascade;
alter table `analytics_event_receipt` add constraint `analytics_event_receipt_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `annotation` add constraint `annotation_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `annotation` add constraint `annotation_user_id_portfolio_id_fkey` foreign key (`user_id`, `portfolio_id`) references `portfolio` (`user_id`, `id`) on delete cascade;
alter table `interview_session` add constraint `interview_session_user_id_brew_id_fkey` foreign key (`user_id`, `brew_id`) references `brew` (`user_id`, `id`) on delete cascade;
alter table `interview_session` add constraint `interview_session_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `job_posting_requirement` add constraint `job_posting_requirement_job_posting_id_fkey` foreign key (`job_posting_id`) references `job_posting` (`id`) on delete cascade;
alter table `question` add constraint `question_replaced_from_id_fkey` foreign key (`replaced_from_id`) references `question` (`id`) on delete set null;
alter table `question` add constraint `question_requirement_id_fkey` foreign key (`requirement_id`) references `job_posting_requirement` (`id`) on delete set null;
alter table `question` add constraint `question_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `question` add constraint `question_user_id_interview_session_id_fkey` foreign key (`user_id`, `interview_session_id`) references `interview_session` (`user_id`, `id`) on delete cascade;
alter table `category` add constraint `category_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `record` add constraint `record_category_id_fkey` foreign key (`category_id`) references `category` (`id`) on delete restrict;
alter table `record` add constraint `record_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `answer` add constraint `answer_created_record_id_fkey` foreign key (`created_record_id`) references `record` (`id`) on delete set null;
alter table `answer` add constraint `answer_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `answer` add constraint `answer_user_id_question_id_fkey` foreign key (`user_id`, `question_id`) references `question` (`user_id`, `id`) on delete cascade;
alter table `answer_record_change` add constraint `answer_record_change_user_id_answer_id_fkey` foreign key (`user_id`, `answer_id`) references `answer` (`user_id`, `id`) on delete cascade;
alter table `answer_record_change` add constraint `answer_record_change_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `answer_record_change` add constraint `answer_record_change_user_id_record_id_fkey` foreign key (`user_id`, `record_id`) references `record` (`user_id`, `id`) on delete cascade;
alter table `recipe` add constraint `recipe_user_id_brew_id_fkey` foreign key (`user_id`, `brew_id`) references `brew` (`user_id`, `id`) on delete cascade;
alter table `recipe` add constraint `recipe_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `recipe_section` add constraint `recipe_section_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `recipe_section` add constraint `recipe_section_user_id_recipe_id_fkey` foreign key (`user_id`, `recipe_id`) references `recipe` (`user_id`, `id`) on delete cascade;
alter table `portfolio_section` add constraint `portfolio_section_recipe_section_id_fkey` foreign key (`recipe_section_id`) references `recipe_section` (`id`) on delete set null;
alter table `portfolio_section` add constraint `portfolio_section_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `portfolio_section` add constraint `portfolio_section_user_id_portfolio_id_fkey` foreign key (`user_id`, `portfolio_id`) references `portfolio` (`user_id`, `id`) on delete cascade;
alter table `block` add constraint `block_source_record_id_fkey` foreign key (`source_record_id`) references `record` (`id`) on delete set null;
alter table `block` add constraint `block_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `block` add constraint `block_user_id_portfolio_section_id_fkey` foreign key (`user_id`, `portfolio_section_id`) references `portfolio_section` (`user_id`, `id`) on delete cascade;
alter table `brew_job` add constraint `brew_job_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `brew_source` add constraint `brew_source_user_id_brew_id_fkey` foreign key (`user_id`, `brew_id`) references `brew` (`user_id`, `id`) on delete cascade;
alter table `brew_source` add constraint `brew_source_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `brew_source` add constraint `brew_source_user_id_record_id_fkey` foreign key (`user_id`, `record_id`) references `record` (`user_id`, `id`) on delete restrict;
alter table `career_profile` add constraint `career_profile_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `category_view` add constraint `category_view_category_id_fkey` foreign key (`category_id`) references `category` (`id`) on delete cascade;
alter table `category_view` add constraint `category_view_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `company_research_item` add constraint `company_research_item_company_id_fkey` foreign key (`company_id`) references `company` (`id`) on delete cascade;
alter table `company_research_item` add constraint `company_research_item_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `consent` add constraint `consent_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `visit_event` add constraint `visit_event_user_id_deployment_id_fkey` foreign key (`user_id`, `deployment_id`) references `deployment` (`user_id`, `id`) on delete cascade;
alter table `visit_event` add constraint `visit_event_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `conversion_event` add constraint `conversion_event_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `conversion_event` add constraint `conversion_event_user_id_visit_event_id_fkey` foreign key (`user_id`, `visit_event_id`) references `visit_event` (`user_id`, `id`) on delete cascade;
alter table `dashboard_view` add constraint `dashboard_view_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `dashboard_view` add constraint `dashboard_view_user_id_portfolio_id_fkey` foreign key (`user_id`, `portfolio_id`) references `portfolio` (`user_id`, `id`) on delete cascade;
alter table `deployment_slug_redirect` add constraint `deployment_slug_redirect_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `deployment_slug_redirect` add constraint `deployment_slug_redirect_user_id_portfolio_id_fkey` foreign key (`user_id`, `portfolio_id`) references `portfolio` (`user_id`, `id`) on delete cascade;
alter table `derived_metric` add constraint `derived_metric_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `export_asset` add constraint `export_asset_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `export_asset` add constraint `export_asset_user_id_portfolio_id_fkey` foreign key (`user_id`, `portfolio_id`) references `portfolio` (`user_id`, `id`) on delete cascade;
alter table `export_job` add constraint `export_job_asset_fk` foreign key (`asset_id`) references `export_asset` (`id`) on delete set null;  -- 소유자 일치는 트리거가 봅니다
alter table `export_job` add constraint `export_job_user_id_deployment_id_fkey` foreign key (`deployment_id`) references `deployment` (`id`) on delete set null;  -- 소유자 일치는 트리거가 봅니다
alter table `export_job` add constraint `export_job_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `export_job` add constraint `export_job_user_id_portfolio_id_fkey` foreign key (`user_id`, `portfolio_id`) references `portfolio` (`user_id`, `id`) on delete cascade;
alter table `generated_page` add constraint `generated_page_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `generated_page` add constraint `generated_page_user_id_portfolio_id_fkey` foreign key (`user_id`, `portfolio_id`) references `portfolio` (`user_id`, `id`) on delete cascade;
alter table `generation_job` add constraint `generation_job_portfolio_fk` foreign key (`portfolio_id`) references `portfolio` (`id`) on delete set null;  -- 소유자 일치는 트리거가 봅니다
alter table `generation_job` add constraint `generation_job_template_id_fkey` foreign key (`template_id`) references `template` (`id`) on delete restrict;
alter table `generation_job` add constraint `generation_job_user_id_brew_id_fkey` foreign key (`user_id`, `brew_id`) references `brew` (`user_id`, `id`) on delete restrict;
alter table `generation_job` add constraint `generation_job_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `generation_job` add constraint `generation_job_user_id_recipe_id_fkey` foreign key (`user_id`, `recipe_id`) references `recipe` (`user_id`, `id`) on delete restrict;
alter table `recipe_item` add constraint `recipe_item_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `recipe_item` add constraint `recipe_item_user_id_recipe_section_id_fkey` foreign key (`user_id`, `recipe_section_id`) references `recipe_section` (`user_id`, `id`) on delete cascade;
alter table `recipe_evidence_path` add constraint `recipe_evidence_path_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `recipe_evidence_path` add constraint `recipe_evidence_path_user_id_recipe_id_fkey` foreign key (`user_id`, `recipe_id`) references `recipe` (`user_id`, `id`) on delete cascade;
alter table `recipe_evidence_path` add constraint `recipe_evidence_path_user_id_recipe_item_id_fkey` foreign key (`user_id`, `recipe_item_id`) references `recipe_item` (`user_id`, `id`) on delete cascade;
alter table `generation_sentence_evidence` add constraint `generation_sentence_evidence_recipe_evidence_path_id_fkey` foreign key (`recipe_evidence_path_id`) references `recipe_evidence_path` (`id`) on delete restrict;
alter table `generation_sentence_evidence` add constraint `generation_sentence_evidence_user_id_block_id_fkey` foreign key (`user_id`, `block_id`) references `block` (`user_id`, `id`) on delete cascade;
alter table `generation_sentence_evidence` add constraint `generation_sentence_evidence_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `generation_sentence_evidence` add constraint `generation_sentence_evidence_user_id_generation_job_id_fkey` foreign key (`user_id`, `generation_job_id`) references `generation_job` (`user_id`, `id`) on delete cascade;
alter table `usage_counter` add constraint `usage_counter_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `generation_usage_ledger` add constraint `generation_usage_ledger_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `generation_usage_ledger` add constraint `generation_usage_ledger_user_id_generation_job_id_fkey` foreign key (`user_id`, `generation_job_id`) references `generation_job` (`user_id`, `id`) on delete cascade;
alter table `generation_usage_ledger` add constraint `generation_usage_ledger_user_id_usage_counter_id_fkey` foreign key (`user_id`, `usage_counter_id`) references `usage_counter` (`user_id`, `id`) on delete restrict;
alter table `identity_oauth_account` add constraint `identity_oauth_account_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `identity_session` add constraint `identity_session_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `insight` add constraint `insight_user_id_deployment_id_fkey` foreign key (`user_id`, `deployment_id`) references `deployment` (`user_id`, `id`) on delete cascade;
alter table `insight` add constraint `insight_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `interest` add constraint `interest_job_posting_id_fkey` foreign key (`job_posting_id`) references `job_posting` (`id`) on delete cascade;
alter table `interest` add constraint `interest_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `job_analysis_history` add constraint `job_analysis_history_job_analysis_id_fkey` foreign key (`job_analysis_id`) references `job_analysis` (`id`) on delete cascade;
alter table `job_analysis_history` add constraint `job_analysis_history_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `layout_spec` add constraint `layout_spec_generation_job_id_fkey` foreign key (`generation_job_id`) references `generation_job` (`id`) on delete set null;
alter table `layout_spec` add constraint `layout_spec_seed_template_id_fkey` foreign key (`seed_template_id`) references `template` (`id`) on delete set null;
alter table `layout_spec` add constraint `layout_spec_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `layout_spec` add constraint `layout_spec_user_id_portfolio_id_fkey` foreign key (`user_id`, `portfolio_id`) references `portfolio` (`user_id`, `id`) on delete cascade;
alter table `match_score` add constraint `match_score_job_posting_id_fkey` foreign key (`job_posting_id`) references `job_posting` (`id`) on delete cascade;
alter table `match_score` add constraint `match_score_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `media_asset` add constraint `media_asset_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `media_variant` add constraint `media_variant_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `media_variant` add constraint `media_variant_user_id_media_asset_id_fkey` foreign key (`user_id`, `media_asset_id`) references `media_asset` (`user_id`, `id`) on delete cascade;
alter table `metric_daily` add constraint `metric_daily_user_id_deployment_id_fkey` foreign key (`user_id`, `deployment_id`) references `deployment` (`user_id`, `id`) on delete cascade;
alter table `metric_daily` add constraint `metric_daily_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `notification` add constraint `notification_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `notification_preference` add constraint `notification_preference_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `portfolio_edit_proposal` add constraint `portfolio_edit_proposal_user_id_block_id_fkey` foreign key (`user_id`, `block_id`) references `block` (`user_id`, `id`) on delete cascade;
alter table `portfolio_edit_proposal` add constraint `portfolio_edit_proposal_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `portfolio_edit_proposal` add constraint `portfolio_edit_proposal_user_id_portfolio_id_fkey` foreign key (`user_id`, `portfolio_id`) references `portfolio` (`user_id`, `id`) on delete cascade;
alter table `portfolio_edit_proposal` add constraint `portfolio_edit_proposal_user_id_source_record_id_fkey` foreign key (`user_id`, `source_record_id`) references `record` (`user_id`, `id`) on delete restrict;
alter table `portfolio_snapshot` add constraint `portfolio_snapshot_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `portfolio_snapshot` add constraint `portfolio_snapshot_user_id_portfolio_id_fkey` foreign key (`user_id`, `portfolio_id`) references `portfolio` (`user_id`, `id`) on delete cascade;
alter table `recent_search` add constraint `recent_search_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `recipe_revision` add constraint `recipe_revision_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `recipe_revision` add constraint `recipe_revision_user_id_recipe_id_fkey` foreign key (`user_id`, `recipe_id`) references `recipe` (`user_id`, `id`) on delete cascade;
alter table `recipe_unused_source` add constraint `recipe_unused_source_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `recipe_unused_source` add constraint `recipe_unused_source_user_id_recipe_id_fkey` foreign key (`user_id`, `recipe_id`) references `recipe` (`user_id`, `id`) on delete cascade;
alter table `recipe_unused_source` add constraint `recipe_unused_source_user_id_record_id_fkey` foreign key (`user_id`, `record_id`) references `record` (`user_id`, `id`) on delete cascade;
alter table `record_link` add constraint `record_link_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `record_link` add constraint `record_link_user_id_from_record_id_fkey` foreign key (`user_id`, `from_record_id`) references `record` (`user_id`, `id`) on delete cascade;
alter table `record_link` add constraint `record_link_user_id_to_record_id_fkey` foreign key (`user_id`, `to_record_id`) references `record` (`user_id`, `id`) on delete cascade;
alter table `record_usage` add constraint `record_usage_user_id_block_id_fkey` foreign key (`user_id`, `block_id`) references `block` (`user_id`, `id`) on delete cascade;
alter table `record_usage` add constraint `record_usage_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `record_usage` add constraint `record_usage_user_id_record_id_fkey` foreign key (`user_id`, `record_id`) references `record` (`user_id`, `id`) on delete restrict;
alter table `requirement_coverage` add constraint `requirement_coverage_requirement_id_fkey` foreign key (`requirement_id`) references `job_posting_requirement` (`id`) on delete cascade;
alter table `requirement_coverage` add constraint `requirement_coverage_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `revision` add constraint `revision_block_id_fkey` foreign key (`block_id`) references `block` (`id`) on delete cascade;
alter table `revision` add constraint `revision_proposal_fk` foreign key (`proposal_id`) references `portfolio_edit_proposal` (`id`) on delete set null;
alter table `revision` add constraint `revision_reverted_revision_id_fkey` foreign key (`reverted_revision_id`) references `revision` (`id`) on delete set null;
alter table `revision` add constraint `revision_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `revision` add constraint `revision_user_id_portfolio_id_fkey` foreign key (`user_id`, `portfolio_id`) references `portfolio` (`user_id`, `id`) on delete cascade;
alter table `saved_search` add constraint `saved_search_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `scheduled_job_run` add constraint `scheduled_job_run_job_key_fkey` foreign key (`job_key`) references `scheduled_job_definition` (`job_key`) on delete restrict;
alter table `section_view` add constraint `section_view_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `section_view` add constraint `section_view_user_id_portfolio_section_id_fkey` foreign key (`user_id`, `portfolio_section_id`) references `portfolio_section` (`user_id`, `id`) on delete cascade;
alter table `section_view` add constraint `section_view_user_id_visit_event_id_fkey` foreign key (`user_id`, `visit_event_id`) references `visit_event` (`user_id`, `id`) on delete cascade;
alter table `skill` add constraint `skill_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `skill_evidence` add constraint `skill_evidence_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
alter table `skill_evidence` add constraint `skill_evidence_user_id_record_id_fkey` foreign key (`user_id`, `record_id`) references `record` (`user_id`, `id`) on delete cascade;
alter table `skill_evidence` add constraint `skill_evidence_user_id_skill_id_fkey` foreign key (`user_id`, `skill_id`) references `skill` (`user_id`, `id`) on delete cascade;
alter table `widget` add constraint `widget_derived_metric_id_fkey` foreign key (`derived_metric_id`) references `derived_metric` (`id`) on delete set null;
alter table `widget` add constraint `widget_user_id_dashboard_view_id_fkey` foreign key (`user_id`, `dashboard_view_id`) references `dashboard_view` (`user_id`, `id`) on delete cascade;
alter table `widget` add constraint `widget_user_id_fkey` foreign key (`user_id`) references `user` (`id`) on delete cascade;
