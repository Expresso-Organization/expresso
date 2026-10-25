import { randomUUID } from "node:crypto";
import { BrewJobStatusSchema, type BrewJobType } from "@expresso/contracts";
import { mongoCollections, type BrewJobDoc } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import { addMongoOutboxEvent } from "../../platform/mongo-outbox.js";
import { requireActiveUser } from "../identity/index.js";
import type { BrewJobApi } from "./index.js";
import { BrewJobError, type BrewJobRunner, type FailureClassifier } from "./public.js";

/**
 * 이 제출로 큐에 올릴 아웃박스 키. `null`이면 올리지 않고 지금 상태를 돌려준다.
 *
 * 재시도 가능한 실패만 다시 올린다. 키에 `attempts`를 붙이는 이유는 이미 발행된
 * 첫 키에 막히지 않기 위해서다. `attempts`는 실행될 때만 늘고 `failed`는 그 뒤에만
 * 기록되므로 재제출마다 키가 다르고, 같은 실패에 대한 두 번의 제출은 같은 키로 모인다.
 */
export function brewJobOutboxKey(job: Pick<BrewJobDoc, "_id" | "status" | "attempts" | "failureRetryable">, inserted: boolean): string | null {
  if (inserted) return `brew-job:${job._id}`;
  if (job.status === "failed" && job.failureRetryable === true) return `brew-job:${job._id}:${job.attempts}`;
  return null;
}

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
      const outboxKey = brewJobOutboxKey(job, !existing);
      if (!outboxKey) return job._id;
      // 실패한 같은 잡을 대기로 되돌린다. 화면은 같은 잡을 보고 다시 기다린다.
      if (existing) {
        const requeued = await db.brewJobs.updateOne({ _id: job._id, userId, status: "failed", failureRetryable: true, attempts: job.attempts }, { $set: { status: "queued", stage: "queued", errorCode: null, failureRetryable: null, updatedAt: new Date() } }, options);
        if (!requeued.matchedCount) return job._id;
      }
      await addMongoOutboxEvent(tx, { userId, topic: type === "interview" ? "interview.draft" : "recipe.draft", payload: { brewJobId: job._id, userId }, idempotencyKey: outboxKey });
      return job._id;
    });
    return this.getStatus(userId, id);
  }
  async getStatus(userId: string, jobId: string) {
    const job = await mongoCollections(this.context.db).brewJobs.findOne({ _id: jobId, userId });
    if (!job) throw new BrewJobError(404, "brew job not found");
    return BrewJobStatusSchema.parse({ jobId, type: job.type, status: job.status, stage: job.stage, attempts: job.attempts, resultId: job.resultId ?? null, failure: job.errorCode ? { code: job.errorCode, retryable: job.failureRetryable ?? false } : null });
  }
  async process(jobId: string, runner: BrewJobRunner, classify: FailureClassifier, { finalAttempt = true }: { finalAttempt?: boolean } = {}) {
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
      // 큐가 다시 돌릴 실패는 아직 끝난 게 아니다. `failed`로 두면 그 틈에 화면이
      // 버튼을 보여 주고, 누르면 같은 일을 하는 잡이 하나 더 생긴다.
      const outcome = retryable && !finalAttempt
        ? { status: "queued" as const, stage: "queued", errorCode: null, failureRetryable: null }
        : { status: "failed" as const, stage: "failed", errorCode: code, failureRetryable: retryable };
      await inTransaction(this.context, async (tx) => {
        await requireActiveUser(tx, job.userId);
        await mongoCollections(tx.db).brewJobs.updateOne({ _id: jobId, userId: job.userId, status: "running", attempts: job.attempts }, { $set: { ...outcome, updatedAt: new Date() } }, { session: tx.session });
      }).catch(() => undefined);
      throw error;
    }
    return this.getStatus(job.userId, jobId);
  }
}

export { BrewJobService as MongoBrewJobService };
