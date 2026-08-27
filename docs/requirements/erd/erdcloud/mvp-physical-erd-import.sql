/*
 * Expresso 1차 MVP
 * ERDCloud 물리 ERD Import용 설계 DDL
 *
 * 주의:
 * 실제 운영 Migration이 아니다.
 * 실제 스키마 적용 시 별도 검증이 필요하다.
 */

CREATE TABLE users (
    id BIGINT AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(254) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (email)
);

-- 이메일은 애플리케이션에서 소문자로 정규화한다.
-- 대소문자를 구분하지 않는 정확한 MySQL Collation은 후속 DDL 설계에서 결정한다.

CREATE TABLE career_records (
    id BIGINT AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    title VARCHAR(255) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    INDEX (user_id, created_at),
    FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE projects (
    career_record_id BIGINT,
    description TEXT NOT NULL,
    start_month DATE NULL,
    end_month DATE NULL,
    is_ongoing BOOLEAN NOT NULL DEFAULT FALSE,
    role VARCHAR(255) NULL,
    project_link VARCHAR(2048) NULL,
    representative_image_key VARCHAR(512) NULL,
    PRIMARY KEY (career_record_id),
    FOREIGN KEY (career_record_id) REFERENCES career_records (id)
);

-- projects CHECK 후보:
-- start_month와 end_month는 값이 있으면 해당 월의 1일이어야 한다.
-- 허용 기간 상태는 기간 없음, 시작 월과 종료 월, 시작 월과 진행 중 중 하나이다.
-- 종료 월은 시작 월보다 빠를 수 없다.

CREATE TABLE project_technology_items (
    id BIGINT AUTO_INCREMENT,
    career_record_id BIGINT NOT NULL,
    technology_value VARCHAR(100) NOT NULL,
    PRIMARY KEY (id),
    INDEX (career_record_id),
    FOREIGN KEY (career_record_id) REFERENCES projects (career_record_id)
);

CREATE TABLE project_achievement_items (
    id BIGINT AUTO_INCREMENT,
    career_record_id BIGINT NOT NULL,
    achievement_value TEXT NOT NULL,
    PRIMARY KEY (id),
    INDEX (career_record_id),
    FOREIGN KEY (career_record_id) REFERENCES projects (career_record_id)
);

CREATE TABLE education_careers (
    career_record_id BIGINT,
    record_type VARCHAR(20) NOT NULL,
    institution VARCHAR(255) NOT NULL,
    start_month DATE NULL,
    end_month DATE NULL,
    is_ongoing BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(30) NULL,
    detail TEXT NULL,
    major VARCHAR(255) NULL,
    degree_info VARCHAR(100) NULL,
    job_position VARCHAR(255) NULL,
    course_name VARCHAR(255) NULL,
    PRIMARY KEY (career_record_id),
    FOREIGN KEY (career_record_id) REFERENCES career_records (id)
);

-- education_careers CHECK 후보:
-- record_type 허용값은 EDUCATION, EMPLOYMENT, TRAINING이다.
-- EDUCATION은 job_position과 course_name을 사용하지 않는다.
-- EMPLOYMENT는 major, degree_info 및 course_name을 사용하지 않는다.
-- TRAINING은 major, degree_info 및 job_position을 사용하지 않는다.
-- start_month와 end_month는 값이 있으면 해당 월의 1일이어야 한다.
-- 허용 기간 상태는 기간 없음, 시작 월과 종료 월, 시작 월과 진행 중 중 하나이다.
-- 종료 월은 시작 월보다 빠를 수 없다.

CREATE TABLE education_career_highlights (
    id BIGINT AUTO_INCREMENT,
    career_record_id BIGINT NOT NULL,
    activity_achievement_value TEXT NOT NULL,
    PRIMARY KEY (id),
    INDEX (career_record_id),
    FOREIGN KEY (career_record_id) REFERENCES education_careers (career_record_id)
);

CREATE TABLE portfolios (
    id BIGINT AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    title VARCHAR(255) NOT NULL,
    PRIMARY KEY (id),
    INDEX (user_id),
    FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE portfolio_sections (
    id BIGINT AUTO_INCREMENT,
    portfolio_id BIGINT NOT NULL,
    logical_order INT NOT NULL,
    content LONGTEXT NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (portfolio_id, logical_order),
    FOREIGN KEY (portfolio_id) REFERENCES portfolios (id)
);

CREATE TABLE portfolio_sources (
    portfolio_id BIGINT NOT NULL,
    career_record_id BIGINT NOT NULL,
    PRIMARY KEY (portfolio_id, career_record_id),
    INDEX (career_record_id, portfolio_id),
    FOREIGN KEY (portfolio_id) REFERENCES portfolios (id),
    FOREIGN KEY (career_record_id) REFERENCES career_records (id)
);
