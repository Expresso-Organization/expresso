import { randomUUID } from "node:crypto";
import { BrewJobStatusSchema, type BrewJobType } from "@expresso/contracts";
import { mongoCollections, type BrewJobDoc } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import { addMongoOutboxEvent } from "../../platform/mongo-outbox.js";
import { requireActiveUser } from "../identity/index.js";
import type { BrewJobApi } from "./index.js";
import { BrewJobError, type BrewJobRunner, type FailureClassifier } from "./public.js";

export class BrewJobService implements BrewJobApi {
  constructor(readonly context: MongoContext) {}
  async submit(userId: string, type: BrewJobType, idempotencyKey: string, input: { brewId: string }) {
    const id = await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const db = mongoCollections(tx.db); const options = { session: tx.session };
      if (!await db.brews.findOne({ _id: input.brewId, userId }, options)) throw new BrewJobError(404, "brew not found");
      const existing = await db.brewJobs.findOne({ userId, inputIdempotencyKey: idempotencyKey }, options);
      if (existing && (existing.input.brewId !== input.brewId || existing.type !== type)) throw new BrewJobError(409, "idempotency key reused for another brew or job type");
      const job: BrewJobDoc = existing ?? { _id: randomUUID(), userId, type, input: { brewId: input.brewId }, inputIdempotencyKey: idempotencyKey, status: "queued", stage: "queued", attempts: 0, createdAt: new Date(), updatedAt: new Date() };
      if (!existing) await db.brewJobs.insertOne(job, options);
      await addMongoOutboxEvent(tx, { userId, topic: type === "interview" ? "interview.draft" : "recipe.draft", payload: { brewJobId: job._id, userId }, idempotencyKey: `brew-job:${job._id}` });
      return job._id;
    });
    return this.getStatus(userId, id);
  }
  async getStatus(userId: string, jobId: string) {
    const job = await mongoCollections(this.context.db).brewJobs.findOne({ _id: jobId, userId });
    if (!job) throw new BrewJobError(404, "brew job not found");
    return BrewJobStatusSchema.parse({ jobId, type: job.type, status: job.status, stage: job.stage, attempts: job.attempts, resultId: job.resultId ?? null, failure: job.errorCode ? { code: job.errorCode, retryable: job.failureRetryable ?? false } : null });
  }
  async process(jobId: string, runner: BrewJobRunner, classify: FailureClassifier) {
    const job = await inTransaction(this.context, async (tx) => {
      const db = mongoCollections(tx.db); const options = { session: tx.session };
      const existing = await db.brewJobs.findOne({ _id: jobId }, options);
      if (!existing) throw new BrewJobError(404, "brew job not found");
      await requireActiveUser(tx, existing.userId);
      if (existing.status === "succeeded") return existing;
      const updated = await db.brewJobs.findOneAndUpdate({ _id: jobId, userId: existing.userId }, { $set: { status: "running", stage: "drafting", errorCode: null, failureRetryable: null, updatedAt: new Date() }, $inc: { attempts: 1 } }, { ...options, returnDocument: "after" });
      if (!updated) throw new BrewJobError(404, "brew job not found");
      return updated;
    });
    if (job.status === "succeeded") return this.getStatus(job.userId, jobId);
    try {
      if (typeof job.input.brewId !== "string") throw new Error("brew job input is missing brewId");
      const resultId = await runner.run({ userId: job.userId, brewId: job.input.brewId, idempotencyKey: `brew-job:${jobId}` });
      await inTransaction(this.context, async (tx) => {
        await requireActiveUser(tx, job.userId);
        await mongoCollections(tx.db).brewJobs.updateOne({ _id: jobId, userId: job.userId, status: "running", attempts: job.attempts }, { $set: { status: "succeeded", stage: "done", resultId, updatedAt: new Date() } }, { session: tx.session });
      });
    } catch (error) {
      const { code, retryable } = classify(error);
      await inTransaction(this.context, async (tx) => {
        await requireActiveUser(tx, job.userId);
        await mongoCollections(tx.db).brewJobs.updateOne({ _id: jobId, userId: job.userId, status: "running", attempts: job.attempts }, { $set: { status: "failed", stage: "failed", errorCode: code, failureRetryable: retryable, updatedAt: new Date() } }, { session: tx.session });
      }).catch(() => undefined);
      throw error;
    }
    return this.getStatus(job.userId, jobId);
  }
}

export { BrewJobService as MongoBrewJobService };
