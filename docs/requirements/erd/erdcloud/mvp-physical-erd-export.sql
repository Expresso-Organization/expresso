CREATE TABLE `education_careers` (
	`career_record_id`	BIGINT	NOT NULL,
	`record_type`	VARCHAR(20)	NOT NULL,
	`institution`	VARCHAR(255)	NOT NULL,
	`start_month`	DATE	NULL,
	`end_month`	DATE	NULL,
	`is_ongoing`	BOOLEAN	NOT NULL	DEFAULT FALSE,
	`status`	VARCHAR(30)	NULL,
	`detail`	TEXT	NULL,
	`major`	VARCHAR(255)	NULL,
	`degree_info`	VARCHAR(100)	NULL,
	`job_position`	VARCHAR(255)	NULL,
	`course_name`	VARCHAR(255)	NULL
);

CREATE TABLE `portfolios` (
	`id`	BIGINT	NOT NULL,
	`user_id`	BIGINT	NOT NULL,
	`title`	VARCHAR(255)	NOT NULL
);

CREATE TABLE `education_career_highlights` (
	`id`	BIGINT	NOT NULL,
	`career_record_id`	BIGINT	NOT NULL,
	`activity_achievement_value`	TEXT	NOT NULL
);

CREATE TABLE `projects` (
	`career_record_id`	BIGINT	NOT NULL,
	`description`	TEXT	NOT NULL,
	`start_month`	DATE	NULL,
	`end_month`	DATE	NULL,
	`is_ongoing`	BOOLEAN	NOT NULL	DEFAULT FALSE,
	`role`	VARCHAR(255)	NULL,
	`project_link`	VARCHAR(2048)	NULL,
	`representative_image_key`	VARCHAR(512)	NULL
);

CREATE TABLE `portfolio_sources` (
	`portfolio_id`	BIGINT	NOT NULL,
	`career_record_id`	BIGINT	NOT NULL
);

CREATE TABLE `users` (
	`id`	BIGINT	NOT NULL,
	`name`	VARCHAR(100)	NOT NULL,
	`email`	VARCHAR(254)	NOT NULL,
	`password_hash`	VARCHAR(255)	NOT NULL
);

CREATE TABLE `project_technology_items` (
	`id`	BIGINT	NOT NULL,
	`career_record_id`	BIGINT	NOT NULL,
	`technology_value`	VARCHAR(100)	NOT NULL
);

CREATE TABLE `career_records` (
	`id`	BIGINT	NOT NULL,
	`user_id`	BIGINT	NOT NULL,
	`title`	VARCHAR(255)	NOT NULL,
	`created_at`	DATETIME(6)	NOT NULL	DEFAULT CURRENT_TIMESTAMP(6)
);

CREATE TABLE `portfolio_sections` (
	`id`	BIGINT	NOT NULL,
	`portfolio_id`	BIGINT	NOT NULL,
	`logical_order`	INT	NOT NULL,
	`content`	LONGTEXT	NOT NULL
);

CREATE TABLE `project_achievement_items` (
	`id`	BIGINT	NOT NULL,
	`career_record_id`	BIGINT	NOT NULL,
	`achievement_value`	TEXT	NOT NULL
);

ALTER TABLE `education_careers` ADD CONSTRAINT `PK_EDUCATION_CAREERS` PRIMARY KEY (
	`career_record_id`
);

ALTER TABLE `portfolios` ADD CONSTRAINT `PK_PORTFOLIOS` PRIMARY KEY (
	`id`
);

ALTER TABLE `education_career_highlights` ADD CONSTRAINT `PK_EDUCATION_CAREER_HIGHLIGHTS` PRIMARY KEY (
	`id`
);

ALTER TABLE `projects` ADD CONSTRAINT `PK_PROJECTS` PRIMARY KEY (
	`career_record_id`
);

ALTER TABLE `portfolio_sources` ADD CONSTRAINT `PK_PORTFOLIO_SOURCES` PRIMARY KEY (
	`portfolio_id`,
	`career_record_id`
);

ALTER TABLE `users` ADD CONSTRAINT `PK_USERS` PRIMARY KEY (
	`id`
);

ALTER TABLE `project_technology_items` ADD CONSTRAINT `PK_PROJECT_TECHNOLOGY_ITEMS` PRIMARY KEY (
	`id`
);

ALTER TABLE `career_records` ADD CONSTRAINT `PK_CAREER_RECORDS` PRIMARY KEY (
	`id`
);

ALTER TABLE `portfolio_sections` ADD CONSTRAINT `PK_PORTFOLIO_SECTIONS` PRIMARY KEY (
	`id`
);

ALTER TABLE `project_achievement_items` ADD CONSTRAINT `PK_PROJECT_ACHIEVEMENT_ITEMS` PRIMARY KEY (
	`id`
);

ALTER TABLE `education_careers` ADD CONSTRAINT `FK_career_records_TO_education_careers_1` FOREIGN KEY (
	`career_record_id`
)
REFERENCES `career_records` (
	`id`
);

ALTER TABLE `projects` ADD CONSTRAINT `FK_career_records_TO_projects_1` FOREIGN KEY (
	`career_record_id`
)
REFERENCES `career_records` (
	`id`
);

ALTER TABLE `portfolio_sources` ADD CONSTRAINT `FK_portfolios_TO_portfolio_sources_1` FOREIGN KEY (
	`portfolio_id`
)
REFERENCES `portfolios` (
	`id`
);

ALTER TABLE `portfolio_sources` ADD CONSTRAINT `FK_career_records_TO_portfolio_sources_1` FOREIGN KEY (
	`career_record_id`
)
REFERENCES `career_records` (
	`id`
);

