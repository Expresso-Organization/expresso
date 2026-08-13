import type postgres from "postgres";

import { AccountLifecycleService } from "../account-lifecycle/service.js";
import { AnalyticsService } from "../analytics/service.js";
import type { JobIngestService } from "../jobs/ingest/service.js";
import { addOutboxEvent } from "../../platform/outbox.js";

export type ScheduledJobKey = "saved_searches" | "expire_postings" | "notification_batch" | "analytics_daily" | "deletion_grace" | "retention" | "job_ingest" | "posting_facts";

interface DefinitionRow {
  job_key: ScheduledJobKey; interval_seconds: number; next_run_at: Date | string;
  last_started_at: Date | string | null; last_finished_at: Date | string | null;
  last_status: "succeeded" | "failed" | null; failure_count: number;
}
interface RunRow {
  id: string; job_key: ScheduledJobKey; scheduled_for: Date | string;
  status: "queued" | "running" | "succeeded" | "failed"; attempts: number;
  started_at: Date | string | null; finished_at: Date | string | null;
  last_error: string | null; result: Record<string, unknown> | null;
}

function iso(value: Date | string | null): string | null { return value ? new Date(value).toISOString() : null; }
function runDto(row: RunRow, at = new Date()) {
  return {
    id: row.id, jobKey: row.job_key, scheduledFor: iso(row.scheduled_for)!, status: row.status,
    attempts: row.attempts, startedAt: iso(row.started_at), finishedAt: iso(row.finished_at),
    lastError: row.last_error, result: row.result,
    lagMs: Math.max(0, at.getTime() - new Date(row.scheduled_for).getTime()),
  };
}

export class SchedulingService {
  readonly #sql: postgres.Sql;
  readonly #analytics: AnalyticsService;
  readonly #accounts: AccountLifecycleService;
  /** 수집 어댑터는 워커에만 있다. API 프로세스는 이 자리를 비운 채 돈다. */
  readonly #ingest: JobIngestService | null;
  readonly #overrides: Partial<Record<ScheduledJobKey, (at: Date) => Promise<Record<string, unknown>>>>;

  constructor(sql: postgres.Sql, dependencies: {
    analytics?: AnalyticsService;
    accounts?: AccountLifecycleService;
    ingest?: JobIngestService | null;
    overrides?: Partial<Record<ScheduledJobKey, (at: Date) => Promise<Record<string, unknown>>>>;
  } = {}) {
    this.#sql = sql;
    this.#analytics = dependencies.analytics ?? new AnalyticsService(sql);
    this.#accounts = dependencies.accounts ?? new AccountLifecycleService(sql);
    this.#ingest = dependencies.ingest ?? null;
    this.#overrides = dependencies.overrides ?? {};
  }

  async scheduleDue(at = new Date()) {
    return this.#sql.begin(async (transaction) => {
      const definitions = await transaction<DefinitionRow[]>`
        select * from scheduled_job_definition where next_run_at <= ${at}
        order by next_run_at, job_key for update skip locked
      `;
      const runIds: string[] = [];
      for (const definition of definitions) {
        const scheduledFor = new Date(definition.next_run_at);
        const run = (await transaction<{ id: string }[]>`
          insert into scheduled_job_run (job_key, scheduled_for)
          values (${definition.job_key}, ${scheduledFor})
          on conflict (job_key, scheduled_for) do nothing returning id
        `)[0] ?? (await transaction<{ id: string }[]>`
          select id from scheduled_job_run where job_key = ${definition.job_key} and scheduled_for = ${scheduledFor}
        `)[0];
        let next = scheduledFor.getTime();
        do next += definition.interval_seconds * 1_000; while (next <= at.getTime());
        await transaction`update scheduled_job_definition set next_run_at = ${new Date(next)} where job_key = ${definition.job_key}`;
        if (run) {
          runIds.push(run.id);
          await addOutboxEvent(transaction, {
            topic: "scheduled.execute", payload: { scheduledRunId: run.id, jobKey: definition.job_key }, idempotencyKey: `scheduled-run:${run.id}`,
          });
        }
      }
      return { scheduled: runIds };
    });
  }

  async process(runId: string, at = new Date()) {
    const run = await this.#sql.begin(async (transaction) => {
      const row = (await transaction<RunRow[]>`select * from scheduled_job_run where id = ${runId} for update`)[0];
      if (!row) throw new Error("scheduled run not found");
      if (row.status === "succeeded" || row.status === "running") return null;
      await transaction`update scheduled_job_run set status = 'running', attempts = attempts + 1, started_at = ${at}, finished_at = null, last_error = null where id = ${runId}`;
      await transaction`update scheduled_job_definition set last_started_at = ${at} where job_key = ${row.job_key}`;
      return { ...row, status: "running" as const, attempts: row.attempts + 1 };
    });
    if (!run) return this.getRun(runId, at);
    try {
      const result = await this.#execute(run.job_key, at);
      await this.#sql.begin(async (transaction) => {
        await transaction`update scheduled_job_run set status = 'succeeded', finished_at = ${at}, result = ${transaction.json(result as never)} where id = ${runId}`;
        await transaction`update scheduled_job_definition set last_finished_at = ${at}, last_status = 'succeeded', failure_count = 0 where job_key = ${run.job_key}`;
      });
    } catch (error) {
      const summary = error instanceof Error ? error.name.slice(0, 100) : "UnknownError";
      await this.#sql.begin(async (transaction) => {
        await transaction`update scheduled_job_run set status = 'failed', finished_at = ${at}, last_error = ${summary} where id = ${runId}`;
        await transaction`update scheduled_job_definition set last_finished_at = ${at}, last_status = 'failed', failure_count = failure_count + 1 where job_key = ${run.job_key}`;
      });
      throw error;
    }
    return this.getRun(runId, at);
  }

  async #execute(key: ScheduledJobKey, at: Date): Promise<Record<string, unknown>> {
    const override = this.#overrides[key];
    if (override) return override(at);
    if (key === "saved_searches") {
      const rows = await this.#sql<{ id: string }[]>`update saved_search set last_run_at = ${at} where notify and (last_run_at is null or last_run_at < ${at}) returning id`;
      return { updated: rows.length };
    }
    if (key === "expire_postings") {
      const rows = await this.#sql<{ id: string }[]>`
        update interest set stage = 'closed' from job_posting
        where job_posting.id = interest.job_posting_id and job_posting.expires_at <= ${at} and interest.stage <> 'closed'
        returning interest.id
      `;
      return { closed: rows.length };
    }
    if (key === "notification_batch") {
      const rows = await this.#sql<{ id: string; user_id: string }[]>`
        select id, user_id from notification where delivery_status in ('queued', 'failed') and next_attempt_at <= ${at} order by next_attempt_at, id limit 100
      `;
      for (const row of rows) await addOutboxEvent(this.#sql, {
        topic: "notification.deliver", payload: { notificationId: row.id, userId: row.user_id }, idempotencyKey: `notification-deliver:${row.id}`,
      });
      return { queued: rows.length };
    }
    if (key === "analytics_daily") {
      const date = new Date(at.getTime() - 86_400_000).toISOString().slice(0, 10);
      const deployments = await this.#sql<{ id: string }[]>`select id from deployment order by id`;
      for (const deployment of deployments) await this.#analytics.aggregateDay(deployment.id, date);
      return { date, deployments: deployments.length };
    }
    if (key === "job_ingest") {
      // 어댑터 없이 도는 프로세스에서 이 잡이 잡히면 조용히 아무것도 안 하는
      // 대신 그렇다고 적는다 — "모았다"는 빈 결과와 구분돼야 한다.
      if (!this.#ingest) return { skipped: "ingest service is not wired" };
      return this.#ingest.run(at) as unknown as Record<string, unknown>;
    }
    /*
     * 수집과 나눠 둔 이유는 성질이 달라서다. 수집은 HTTP 몇 번이고 이건 공고
     * 하나당 모델 한 번이다. 한 잡에 묶여 있으면 모델이 죽은 날 공고 목록도
     * 갱신되지 않는다.
     */
    if (key === "posting_facts") {
      if (!this.#ingest) return { skipped: "ingest service is not wired" };
      return this.#ingest.readPendingFacts(undefined, at) as unknown as Record<string, unknown>;
    }
    if (key === "deletion_grace") return this.#accounts.purgeExpired(at);
    const records = await this.#sql<{ id: string }[]>`delete from record where purge_after <= ${at} returning id`;
    const redirects = await this.#sql<{ id: string }[]>`delete from deployment_slug_redirect where expires_at <= ${at} returning id`;
    const receipts = await this.#sql<{ event_id: string }[]>`delete from analytics_event_receipt where received_at < ${new Date(at.getTime() - 90 * 86_400_000)} returning event_id`;
    return { records: records.length, redirects: redirects.length, analyticsReceipts: receipts.length };
  }

  async getRun(id: string, at = new Date()) {
    const row = (await this.#sql<RunRow[]>`select * from scheduled_job_run where id = ${id}`)[0];
    if (!row) throw new Error("scheduled run not found");
    return runDto(row, at);
  }

  async status(at = new Date()) {
    const definitions = await this.#sql<DefinitionRow[]>`select * from scheduled_job_definition order by job_key`;
    return definitions.map((row) => ({
      jobKey: row.job_key, nextRunAt: iso(row.next_run_at)!, lastStartedAt: iso(row.last_started_at),
      lastFinishedAt: iso(row.last_finished_at), lastStatus: row.last_status, failureCount: row.failure_count,
      lagMs: Math.max(0, at.getTime() - new Date(row.next_run_at).getTime()),
    }));
  }
}
