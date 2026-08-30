# MySQL 공고 자산의 MongoDB 이관

이 절차는 `job_source`, `company`, `job_posting`, `job_posting_requirement` 네 표만 이관합니다. 사용자 계정, 분석 결과, 생성 결과는 대상이 아닙니다.

## 준비

MySQL 계정에는 네 표와 `information_schema.columns`의 `SELECT` 권한만 부여합니다. MongoDB 주소는 migration 전용 계정을 사용합니다. 접속 문자열은 명령 인자나 로그에 남기지 않고 환경 변수로 전달합니다.

```bash
export MYSQL_SOURCE_URL='mysql://...'
export MONGODB_MIGRATE_URL='mongodb://...'
export MONGODB_DATABASE='expresso'
export IMPORT_RUN_ID='고정된-UUID'
pnpm migrate:jobs-to-mongodb
```

도구는 repeatable-read read-only snapshot을 열고 `job_source → company → job_posting → job_posting_requirement` 순서로 읽습니다. 원본 열이 고정 사전과 다르면 시작 전에 중단합니다. 각 페이지의 마지막 ID와 처리 건수는 `import_checkpoints`에 기록됩니다.

같은 `IMPORT_RUN_ID`로 재실행하면 체크포인트부터 이어집니다. 다른 이관이 만든 `_id` 또는 내용이 다른 기존 문서는 덮어쓰지 않습니다. 마지막 전수 검증에서 건수, ID, 내용 해시, 회사·공고 참조가 모두 일치해야 `import_runs.completed`가 `true`가 됩니다. 대상 전체 삭제 명령은 제공하지 않습니다.

## 2026-08-30 로컬 리허설

기존 개발 MySQL을 읽기 전용 snapshot으로 열어 회사 10건, 공고 11건, 요구사항
14건을 무작위 이름의 격리 MongoDB에 이관했습니다. 같은 `IMPORT_RUN_ID`로 두 번
실행한 건수와 전체 해시가 일치했습니다. 리허설이 만든 대상 DB만 검증 후 삭제했고
MySQL 원본은 변경하지 않았습니다. 원문 결과는
`coordination/mongodb/evidence/T16-import-first.log`와
`T16-import-repeat.log`에 있습니다.
