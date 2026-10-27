import { randomUUID } from "node:crypto";

import { mongoCollections, type ScheduledJobRunDoc } from "@expresso/database";

import type { MongoContext } from "../../platform/mongodb.js";
import { addMongoOutboxEvent } from "../../platform/mongo-outbox.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import { MongoAccountLifecycleService } from "../account-lifecycle/index.js";
import { MongoAnalyticsService } from "../analytics/index.js";
import { MongoEngagementService } from "../engagement/index.js";
import type { JobIngestApi } from "../jobs/ingest/index.js";
import { SCHEDULED_JOB_KEYS, type ScheduledJobKey } from "./public.js";

const iso = (value?: Date | null) => value?.toISOString() ?? null;
/** 마감 알림을 보내는 창. 관심 공고 마감이 이 안에 들어오면 한 번 알린다. */
const DEADLINE_WINDOW_MS = 72 * 3_600_000;
type DeadlineNotifier = { notify(userId: string, kind: "deadline", targetUrl: string, dedupeKey: string, at?: Date, subject?: string | null): Promise<{ created: boolean }> };

const runDto = (row: ScheduledJobRunDoc, at = new Date()) => ({ id: row._id, jobKey: row.jobKey as ScheduledJobKey, scheduledFor: iso(row.scheduledFor)!, status: row.status, attempts: row.attempts, startedAt: iso(row.startedAt), finishedAt: iso(row.finishedAt), lastError: row.lastError ?? null, result: row.result ?? null, lagMs: Math.max(0, at.getTime() - row.scheduledFor.getTime()) });

export class SchedulingService {
  readonly #analytics: { aggregateDay(deploymentId: string, date: string): Promise<Record<string, number>> }; readonly #accounts: { purgeExpired(at?: Date, limit?: number): Promise<{ purged: string[] }> }; readonly #ingest: JobIngestApi | null; readonly #notifications: DeadlineNotifier;
  readonly #overrides: Partial<Record<ScheduledJobKey, (at: Date) => Promise<Record<string, unknown>>>>;
  constructor(readonly context: MongoContext, dependencies: { analytics?: { aggregateDay(deploymentId: string, date: string): Promise<Record<string, number>> }; accounts?: { purgeExpired(at?: Date, limit?: number): Promise<{ purged: string[] }> }; ingest?: JobIngestApi | null; notifications?: DeadlineNotifier; overrides?: Partial<Record<ScheduledJobKey, (at: Date) => Promise<Record<string, unknown>>>> } = {}) {
    this.#analytics = dependencies.analytics ?? new MongoAnalyticsService(context); this.#accounts = dependencies.accounts ?? new MongoAccountLifecycleService(context); this.#ingest = dependencies.ingest ?? null; this.#notifications = dependencies.notifications ?? new MongoEngagementService(context); this.#overrides = dependencies.overrides ?? {};
  }

  async scheduleDue(at = new Date()) {
    return inTransaction(this.context, async (tx) => {
      const db = mongoCollections(tx.db); const options = { session: tx.session }; const definitions = await db.scheduledJobDefinitions.find({ nextRunAt: { $lte: at } }, options).sort({ nextRunAt: 1, _id: 1 }).toArray(); const runIds: string[] = [];
      for (const definition of definitions) {
        const scheduledFor = definition.nextRunAt; const id = randomUUID();
        const inserted = await db.scheduledJobRuns.updateOne({ jobKey: definition._id, scheduledFor }, { $setOnInsert: { _id: id, jobKey: definition._id, scheduledFor, status: "queued", attempts: 0, createdAt: at } }, { ...options, upsert: true });
        let next = scheduledFor.getTime(); do next += definition.intervalSeconds * 1000; while (next <= at.getTime());
        await db.scheduledJobDefinitions.updateOne({ _id: definition._id, nextRunAt: scheduledFor }, { $set: { nextRunAt: new Date(next) } }, options);
        if (inserted.upsertedCount) { runIds.push(id); await addMongoOutboxEvent(tx, { userId: null, topic: "scheduled.execute", payload: { scheduledRunId: id, jobKey: definition._id }, idempotencyKey: `scheduled-run:${id}` }); }
      }
      return { scheduled: runIds };
    });
  }

  async process(runId: string, at = new Date()) {
    const stale = new Date(at.getTime() - 5 * 60_000); const db = mongoCollections(this.context.db);
    const claimed = await db.scheduledJobRuns.findOneAndUpdate({ _id: runId, $or: [{ status: { $in: ["queued", "failed"] } }, { status: "running", startedAt: { $lt: stale } }] }, { $set: { status: "running", startedAt: at, finishedAt: null, lastError: null }, $inc: { attempts: 1 } }, { returnDocument: "after" });
    if (!claimed) { const existing = await db.scheduledJobRuns.findOne({ _id: runId }); if (!existing) throw new Error("scheduled run not found"); return runDto(existing, at); }
    await db.scheduledJobDefinitions.updateOne({ _id: claimed.jobKey as ScheduledJobKey }, { $set: { lastStartedAt: at } });
    try {
      const result = await this.#execute(claimed.jobKey as ScheduledJobKey, at);
      await inTransaction(this.context, async (tx) => { const collections = mongoCollections(tx.db); const options = { session: tx.session }; await collections.scheduledJobRuns.updateOne({ _id: runId, status: "running", attempts: claimed.attempts }, { $set: { status: "succeeded", finishedAt: at, result: JSON.parse(JSON.stringify(result)), lastError: null } }, options); await collections.scheduledJobDefinitions.updateOne({ _id: claimed.jobKey as ScheduledJobKey }, { $set: { lastFinishedAt: at, lastStatus: "succeeded", failureCount: 0 } }, options); });
    } catch (error) {
      const summary = error instanceof Error ? error.name.slice(0, 100) : "UnknownError";
      await inTransaction(this.context, async (tx) => { const collections = mongoCollections(tx.db); const options = { session: tx.session }; await collections.scheduledJobRuns.updateOne({ _id: runId, status: "running", attempts: claimed.attempts }, { $set: { status: "failed", finishedAt: at, lastError: summary } }, options); await collections.scheduledJobDefinitions.updateOne({ _id: claimed.jobKey as ScheduledJobKey }, { $set: { lastFinishedAt: at, lastStatus: "failed" }, $inc: { failureCount: 1 } }, options); }); throw error;
    }
    return this.getRun(runId, at);
  }

  async #execute(key: ScheduledJobKey, at: Date): Promise<Record<string, unknown>> {
    const override = this.#overrides[key]; if (override) return override(at); const db = mongoCollections(this.context.db);
    if (key === "saved_searches") { const result = await db.savedSearches.updateMany({ notify: true, $or: [{ lastRunAt: null }, { lastRunAt: { $lt: at } }] }, { $set: { lastRunAt: at } }); return { updated: result.modifiedCount }; }
    if (key === "expire_postings") { const postingIds = (await db.jobPostings.find({ expiresAt: { $lte: at } }).project({ _id: 1 }).toArray()).map(({ _id }) => _id); const result = await db.interests.updateMany({ jobPostingId: { $in: postingIds }, stage: { $ne: "closed" } }, { $set: { stage: "closed" } }); return { closed: result.modifiedCount }; }
    if (key === "notification_batch") { const rows = await db.notifications.find({ deliveryStatus: { $in: ["queued", "failed"] }, nextAttemptAt: { $lte: at } }).sort({ nextAttemptAt: 1, _id: 1 }).limit(100).toArray(); for (const row of rows) await inTransaction(this.context, (tx) => addMongoOutboxEvent(tx, { userId: row.userId, topic: "notification.deliver", payload: { notificationId: row._id, userId: row.userId }, idempotencyKey: `notification-deliver:${row._id}` })); return { queued: rows.length }; }
    if (key === "analytics_daily") { const date = new Date(at.getTime() - 86_400_000).toISOString().slice(0, 10); const deployments = await db.deployments.find().project({ _id: 1 }).toArray(); for (const deployment of deployments) await this.#analytics.aggregateDay(deployment._id, date); return { date, deployments: deployments.length }; }
    if (key === "job_ingest") return this.#ingest ? this.#ingest.run(at) as unknown as Record<string, unknown> : { skipped: "ingest service is not wired" };
    if (key === "posting_facts") return this.#ingest ? this.#ingest.readPendingFacts(undefined, at) as unknown as Record<string, unknown> : { skipped: "ingest service is not wired" };
    if (key === "deadline_reminders") return this.#deadlineReminders(at);
    if (key === "deletion_grace") return this.#accounts.purgeExpired(at);
    if (key === "retention") { const [records, redirects, receipts] = await Promise.all([db.careerRecords.deleteMany({ purgeAfter: { $lte: at } }), db.deploymentSlugRedirects.deleteMany({ expiresAt: { $lte: at } }), db.analyticsEventReceipts.deleteMany({ receivedAt: { $lt: new Date(at.getTime() - 90 * 86_400_000) } })]); return { records: records.deletedCount, redirects: redirects.deletedCount, analyticsReceipts: receipts.deletedCount }; }
    throw new Error(`unsupported scheduled job key: ${key satisfies never}`);
  }

  /**
   * 저장한 관심 공고의 마감(사용자가 적은 마감, 없으면 공고 마감)이 72시간 안에
   * 들어오면 공고당 한 번 알린다. `notify()`의 중복 막기는 하루 단위라 매일 돌면
   * 같은 공고를 사흘 알리게 된다. 그래서 날짜와 관계없이 같은 키가 있으면 넘긴다.
   * 탈퇴 중인 사용자처럼 한 줄이 실패해도 나머지는 계속 만든다.
   */
  async #deadlineReminders(at: Date) {
    const db = mongoCollections(this.context.db);
    const rows = await db.interests.aggregate<{ userId: string; postingId: string; title: string; company: string | null }>([
      { $match: { stage: "saved" } },
      { $lookup: { from: db.jobPostings.collectionName, localField: "jobPostingId", foreignField: "_id", as: "posting" } },
      { $unwind: "$posting" },
      { $set: { deadline: { $ifNull: ["$deadlineAt", "$posting.expiresAt"] } } },
      { $match: { deadline: { $gt: at, $lte: new Date(at.getTime() + DEADLINE_WINDOW_MS) } } },
      { $lookup: { from: db.companies.collectionName, localField: "posting.companyId", foreignField: "_id", as: "company" } },
      { $project: { _id: 0, userId: 1, postingId: "$posting._id", title: "$posting.title", company: { $ifNull: [{ $first: "$company.name" }, null] } } },
    ]).toArray();
    let created = 0; let skipped = 0; let failed = 0;
    for (const row of rows) {
      const dedupeKey = `deadline:${row.postingId}`;
      if (await db.notifications.findOne({ userId: row.userId, dedupeKey }, { projection: { _id: 1 } })) { skipped += 1; continue; }
      try {
        const subject = row.company ? `${row.company} · ${row.title}` : row.title;
        const result = await this.#notifications.notify(row.userId, "deadline", `/jobs/${row.postingId}`, dedupeKey, at, subject);
        if (result.created) created += 1; else skipped += 1;
      } catch (error) {
        failed += 1;
        console.error(JSON.stringify({ level: "warn", event: "deadline_reminder.failed", postingId: row.postingId, message: error instanceof Error ? error.message : String(error) }));
      }
    }
    return { candidates: rows.length, created, skipped, failed };
  }

  async getRun(id: string, at = new Date()) { const row = await mongoCollections(this.context.db).scheduledJobRuns.findOne({ _id: id }); if (!row) throw new Error("scheduled run not found"); return runDto(row, at); }
  async status(at = new Date()) { const definitions = await mongoCollections(this.context.db).scheduledJobDefinitions.find().sort({ _id: 1 }).toArray(); return definitions.map((definition) => ({ jobKey: definition._id, nextRunAt: definition.nextRunAt.toISOString(), lastStartedAt: iso(definition.lastStartedAt), lastFinishedAt: iso(definition.lastFinishedAt), lastStatus: definition.lastStatus ?? null, failureCount: definition.failureCount, lagMs: Math.max(0, at.getTime() - definition.nextRunAt.getTime()) })); }
}

export { SCHEDULED_JOB_KEYS, type ScheduledJobKey };

export { SchedulingService as MongoSchedulingService };
