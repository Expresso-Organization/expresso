

/**
 * 코드가 다룰 줄 아는 잡. **DB의 `scheduled_job_definition_job_key_check`와
 * 같아야 한다** — 어긋나면 스케줄러가 모르는 키를 집어 든다.
 *
 * 타입이 아니라 값으로 둔다. 타입은 컴파일에 지워져서 시험이 확인할 수 없다.
 */
export const SCHEDULED_JOB_KEYS = [
  "saved_searches",
  "expire_postings",
  "notification_batch",
  "analytics_daily",
  "deletion_grace",
  "retention",
  "job_ingest",
  "posting_facts",
] as const;

export type ScheduledJobKey = (typeof SCHEDULED_JOB_KEYS)[number];
