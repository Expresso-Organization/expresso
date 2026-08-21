import type { SqlTag } from "../../platform/mysql.js";

import { AccountLifecycleService } from "../account-lifecycle/service.js";
import { AnalyticsService } from "../analytics/service.js";
import type { JobIngestService } from "../jobs/ingest/service.js";
import { addOutboxEvent } from "../../platform/outbox.js";

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
  readonly #sql: SqlTag;
  readonly #analytics: AnalyticsService;
  readonly #accounts: AccountLifecycleService;
  /** 수집 어댑터는 워커에만 있다. API 프로세스는 이 자리를 비운 채 돈다. */
  readonly #ingest: JobIngestService | null;
  readonly #overrides: Partial<Record<ScheduledJobKey, (at: Date) => Promise<Record<string, unknown>>>>;

  constructor(sql: SqlTag, dependencies: {
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
          insert ignore into scheduled_job_run (job_key, scheduled_for)
          values (${definition.job_key}, ${scheduledFor})
            returning id
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
      // 두 표를 함께 보는 갱신은 MySQL 에서 join 으로 적는다. 몇 줄이 닫혔는지는
      // 고치기 전에 세어 둔다.
      const targets = await this.#sql<{ id: string }[]>`
        select interest.id from interest
        join job_posting on job_posting.id = interest.job_posting_id
        where job_posting.expires_at <= ${at} and interest.stage <> 'closed'
      `;
      if (targets.length > 0) {
        await this.#sql`
          update interest set stage = 'closed' where id in ${this.#sql(targets.map(({ id }) => id))}
        `;
      }
      return { closed: targets.length };
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
    if (key === "retention") {
      const records = await this.#sql<{ id: string }[]>`delete from record where purge_after <= ${at} returning id`;
      const redirects = await this.#sql<{ id: string }[]>`delete from deployment_slug_redirect where expires_at <= ${at} returning id`;
      const receipts = await this.#sql<{ event_id: string }[]>`delete from analytics_event_receipt where received_at < ${new Date(at.getTime() - 90 * 86_400_000)} returning event_id`;
      return { records: records.length, redirects: redirects.length, analyticsReceipts: receipts.length };
    }

    /*
     * 모르는 키는 **크게 실패한다.**
     *
     * 여기는 원래 조건 없는 폴스루였고, 그래서 모르는 키가 오면 retention의
     * `delete` 세 개를 돌리고 성공했다고 적었다. 2026-08-13에 실제로 그 일이
     * 일어났다 — 마이그레이션이 `posting_facts`를 심은 직후, 아직 재시작하지
     * 않은 옛 워커가 그 키를 집어 남의 잡을 실행했다.
     *
     * 배포 중에는 언제든 새 키와 옛 코드가 만난다. 그때 지우는 쪽으로
     * 넘어가지 않는 것이 중요하다.
     */
    throw new Error(`unknown scheduled job key: ${key}`);
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
