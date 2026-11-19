

/**
 * 코드가 다룰 줄 아는 잡. **DB의 `scheduled_job_definition_job_key_check`와
 * 같아야 한다.** 스케줄러는 이 목록의 키만 집는다 — DB에만 있는 키의 정의는
 * 실행되지 않고 `nextRunAt`이 지난 채로 남는다.
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
  "deadline_reminders",
  "proposal_briefing",
  "activity_collect",
] as const;

export type ScheduledJobKey = (typeof SCHEDULED_JOB_KEYS)[number];
