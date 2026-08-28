import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { mongoCollections, type OutboxEventDoc } from "@expresso/database";
import type { MongoContext } from "./mongodb.js";
import type { MongoTransaction } from "./mongo-transaction.js";
import type { OutboxEvent, OutboxEventInput, QueuePublisher } from "./outbox.js";

export interface MongoOutboxEventInput extends OutboxEventInput { userId: string | null }

export class OutboxIdempotencyConflict extends Error {
  constructor() { super("Outbox idempotency key already has different input"); }
}

export async function addMongoOutboxEvent(tx: MongoTransaction, input: MongoOutboxEventInput): Promise<OutboxEvent> {
  const now = new Date();
  // SQL JSON과 같은 JSON 값만 저장하며 입력 객체를 변형하지 않습니다.
  const payload = JSON.parse(JSON.stringify(input.payload)) as OutboxEventDoc["payload"];
  const row = await mongoCollections(tx.db).outboxEvents.findOneAndUpdate(
    { idempotencyKey: input.idempotencyKey },
    { $setOnInsert: {
      _id: randomUUID(), userId: input.userId, topic: input.topic, payload,
      idempotencyKey: input.idempotencyKey, state: "pending", attempts: 0,
      availableAt: now, createdAt: now, updatedAt: now,
    } },
    { upsert: true, returnDocument: "after", session: tx.session },
  );
  if (!row) throw new Error("Outbox event was not persisted");
  if (row.topic !== input.topic || (row.userId ?? null) !== input.userId || !isDeepStrictEqual(row.payload, payload)) {
    throw new OutboxIdempotencyConflict();
  }
  return { id: row._id, topic: row.topic, payload: row.payload, idempotencyKey: row.idempotencyKey, state: row.state, attempts: row.attempts };
}

export interface MongoOutboxDispatcherOptions {
  context: MongoContext;
  queue: QueuePublisher;
  batchSize?: number;
  maxAttempts?: number;
  lockTimeoutSeconds?: number;
}

export class MongoOutboxDispatcher {
  readonly #options: Required<MongoOutboxDispatcherOptions>;

  constructor(options: MongoOutboxDispatcherOptions) {
    this.#options = { batchSize: 25, maxAttempts: 5, lockTimeoutSeconds: 60, ...options };
    for (const value of [this.#options.batchSize, this.#options.maxAttempts, this.#options.lockTimeoutSeconds]) {
      if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError("Outbox limits must be positive integers");
    }
  }

  async pollOnce(): Promise<{ published: number; retried: number; deadLettered: number }> {
    const { context, queue, batchSize, maxAttempts, lockTimeoutSeconds } = this.#options;
    const events = mongoCollections(context.db).outboxEvents;
    const result = { published: 0, retried: 0, deadLettered: 0 };
    for (let i = 0; i < batchSize; i++) {
      const now = new Date();
      const token = randomUUID();
      const event = await events.findOneAndUpdate(
        { availableAt: { $lte: now }, $or: [{ state: "pending" }, { state: "publishing", leaseUntil: { $lte: now } }] },
        { $set: { state: "publishing", leaseToken: token, leaseUntil: new Date(now.getTime() + lockTimeoutSeconds * 1_000), lockedAt: now, updatedAt: now } },
        { returnDocument: "after", sort: { availableAt: 1, createdAt: 1, _id: 1 } },
      );
      if (!event) break;
      const owner = { _id: event._id, state: "publishing" as const, leaseToken: token };
      try {
        await queue.add(event.topic, event.payload, {
          jobId: event._id, attempts: maxAttempts, backoff: { type: "exponential", delay: 1_000 },
          removeOnComplete: { age: 86_400, count: 10_000 }, removeOnFail: false,
        });
      } catch (error) {
        const attempts = event.attempts + 1;
        const terminal = attempts >= maxAttempts;
        const code = error instanceof Error ? (error as Error & { code?: unknown }).code : undefined;
        const name = error instanceof Error ? error.name : "UnknownError";
        const lastError = typeof code === "string" && /^[A-Za-z0-9_]{1,64}$/.test(code) ? `${name}:${code}` : name;
        const failed = await events.updateOne(owner, { $set: {
          state: terminal ? "dead_letter" : "pending", attempts, lastError,
          availableAt: new Date(Date.now() + Math.min(2 ** attempts, 300) * 1_000),
          leaseToken: null, leaseUntil: null, lockedAt: null, updatedAt: new Date(),
        } });
        if (failed.matchedCount) result[terminal ? "deadLettered" : "retried"] += 1;
        continue;
      }
      // 큐 발행 후 DB 오류는 큐 실패로 바꾸지 않습니다. lease 만료 후 같은 jobId로 재전달합니다.
      const published = await events.updateOne(owner, { $set: {
        state: "published", publishedAt: new Date(), updatedAt: new Date(), lastError: null,
        leaseToken: null, leaseUntil: null, lockedAt: null,
      } });
      if (published.matchedCount) result.published += 1;
    }
    return result;
  }
}
