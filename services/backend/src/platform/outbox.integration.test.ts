import { randomUUID } from "node:crypto";
import { createMysqlResource } from "./legacy-mysql.js";

import { migrate } from "@expresso/database";
import type { SqlTag } from "./legacy-mysql.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mongoCollections } from "@expresso/database";
import { createMongoFixture } from "../../test/support/mongodb.js";
import { inTransaction } from "./mongo-transaction.js";
import { addMongoOutboxEvent, MongoOutboxDispatcher } from "./mongo-outbox.js";

import { addOutboxEvent, OutboxDispatcher } from "./legacy-mysql-outbox.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describe.skipIf(!process.env.TEST_MONGODB_URL && !process.env.TEST_MONGODB_ADMIN_URL)("MongoDB outbox integration", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  const input = { topic: "job.analysis", payload: { jobAnalysisId: randomUUID() }, idempotencyKey: "mongo-analysis", userId: null };
  beforeAll(async () => { fixture = await createMongoFixture("outbox"); }, 60_000);
  beforeEach(async () => { await mongoCollections(fixture.resource.db).outboxEvents.deleteMany({}); });
  afterAll(async () => { await fixture?.dispose(); });
  const add = () => inTransaction(fixture.resource, tx => addMongoOutboxEvent(tx, input));

  it("rolls back both domain changes and its outbox on callback failure", async () => {
    await expect(inTransaction(fixture.resource, async tx => {
      await mongoCollections(tx.db).plans.updateOne({ code: "free" }, { $set: { generationQuota: 999 } }, { session: tx.session });
      await addMongoOutboxEvent(tx, input);
      throw new Error("abort-domain-change");
    })).rejects.toThrow("abort-domain-change");
    expect(await mongoCollections(fixture.resource.db).outboxEvents.countDocuments()).toBe(0);
    expect((await mongoCollections(fixture.resource.db).plans.findOne({ code: "free" }))?.generationQuota).toBe(3);
  });

  it("deduplicates concurrent input and rejects another payload or owner for the same key", async () => {
    const [first, second] = await Promise.all([add(), add()]);
    expect(first.id).toBe(second.id);
    for (const changed of [{ ...input, payload: { different: true } }, { ...input, userId: randomUUID() }, { ...input, topic: "other" }]) {
      await expect(inTransaction(fixture.resource, tx => addMongoOutboxEvent(tx, changed))).rejects.toThrow("different input");
    }
    const published: string[] = [];
    const dispatcher = () => new MongoOutboxDispatcher({ context: fixture.resource, queue: { async add(_name, _payload, options) { published.push(String(options.jobId)); } } });
    const results = await Promise.all([dispatcher().pollOnce(), dispatcher().pollOnce()]);
    expect(results.reduce((sum, value) => sum + value.published, 0)).toBe(1);
    expect(published).toEqual([first.id]);
  });

  it("backs off sanitized errors and marks the terminal attempt as dead letter", async () => {
    const event = await add();
    const events = mongoCollections(fixture.resource.db).outboxEvents;
    const dispatcher = new MongoOutboxDispatcher({ context: fixture.resource, maxAttempts: 2, queue: { async add() { throw new Error("secret token must not be stored"); } } });
    expect(await dispatcher.pollOnce()).toEqual({ published: 0, retried: 1, deadLettered: 0 });
    const retry = await events.findOne({ _id: event.id });
    expect(retry?.lastError).toBe("Error");
    expect(retry!.availableAt.getTime()).toBeGreaterThan(Date.now());
    expect(await dispatcher.pollOnce()).toEqual({ published: 0, retried: 0, deadLettered: 0 });
    await events.updateOne({ _id: event.id }, { $set: { availableAt: new Date(0) } });
    expect(await dispatcher.pollOnce()).toEqual({ published: 0, retried: 0, deadLettered: 1 });
    expect((await events.findOne({ _id: event.id }))?.state).toBe("dead_letter");
  });

  it.each([false, true])("ignores the stale publisher's late outcome (failure=%s)", async fail => {
    const event = await add();
    let release!: () => void;
    let entered!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const old = new MongoOutboxDispatcher({ context: fixture.resource, queue: { async add() { entered(); await hold; if (fail) throw new Error("late failure"); } } });
    const oldResult = old.pollOnce();
    await started;
    const events = mongoCollections(fixture.resource.db).outboxEvents;
    await events.updateOne({ _id: event.id }, { $set: { leaseUntil: new Date(0) } });
    const replacement = new MongoOutboxDispatcher({ context: fixture.resource, queue: { async add() {} } });
    try { expect((await replacement.pollOnce()).published).toBe(1); } finally { release(); }
    expect(await oldResult).toEqual({ published: 0, retried: 0, deadLettered: 0 });
    expect((await events.findOne({ _id: event.id }))?.state).toBe("published");
  });

  it("redelivers with the same job ID after publishing succeeds but the DB update fails", async () => {
    const event = await add();
    const delivered: string[] = [];
    const db = fixture.resource.db;
    const brokenDb = new Proxy(db, { get(target, property) {
      if (property === "collection") return (name: string) => {
        const collection = target.collection(name);
        return new Proxy(collection, { get(targetCollection, member) {
          if (member === "updateOne" && name === "outbox_events") return () => { throw new Error("simulated lost DB acknowledgement"); };
          const value = Reflect.get(targetCollection, member);
          return typeof value === "function" ? value.bind(targetCollection) : value;
        } });
      };
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    } });
    const queue = { async add(_name: string, _payload: unknown, options: { jobId?: string }) { delivered.push(String(options.jobId)); } };
    await expect(new MongoOutboxDispatcher({ context: { ...fixture.resource, db: brokenDb }, queue }).pollOnce()).rejects.toThrow("lost DB acknowledgement");
    await mongoCollections(db).outboxEvents.updateOne({ _id: event.id }, { $set: { leaseUntil: new Date(0) } });
    expect((await new MongoOutboxDispatcher({ context: fixture.resource, queue }).pollOnce()).published).toBe(1);
    expect(delivered).toEqual([event.id, event.id]);
  });
});

describeWithDatabase("platform outbox integration", () => {
  const databaseName = `expresso_outbox_${randomUUID().replaceAll("-", "")}`;
  let admin: SqlTag;
  let sql: SqlTag;

  beforeAll(async () => {
    const rootUrl = new URL(databaseUrl ?? "mysql://127.0.0.1:1/unused");
    const adminUrl = new URL(rootUrl);
    adminUrl.pathname = "/mysql";
    admin = createMysqlResource(adminUrl.toString()).sql;
    await admin.unsafe(`create database \`${databaseName}\``);
    const isolatedUrl = new URL(rootUrl);
    isolatedUrl.pathname = `/${databaseName}`;
    await migrate({ databaseUrl: isolatedUrl.toString() });
    sql = createMysqlResource(isolatedUrl.toString()).sql;
  }, 30_000);

  afterAll(async () => {
    if (sql) await sql.end({ timeout: 5 });
    if (admin) {
      await admin.unsafe(`drop database if exists \`${databaseName}\``);
      await admin.end({ timeout: 5 });
    }
  }, 30_000);

  it("persists one event for repeated idempotency keys and publishes it once", async () => {
    const input = {
      topic: "job.analysis",
      payload: { jobAnalysisId: "11111111-1111-4111-8111-111111111111" },
      idempotencyKey: "analysis:1234567890",
    };
    const first = await addOutboxEvent(sql, input);
    const second = await addOutboxEvent(sql, input);
    const added: string[] = [];
    const dispatcher = new OutboxDispatcher({
      sql,
      queue: {
        async add(_name, _payload, options) {
          added.push(String(options.jobId));
        },
      },
    });

    expect(second.id).toBe(first.id);
    await expect(dispatcher.pollOnce()).resolves.toEqual({
      published: 1,
      retried: 0,
      deadLettered: 0,
    });
    await expect(dispatcher.pollOnce()).resolves.toEqual({
      published: 0,
      retried: 0,
      deadLettered: 0,
    });
    expect(added).toEqual([first.id]);

    const rows = await sql<{ state: string; attempts: number }[]>`
      select state, attempts from platform_outbox where id = ${first.id}
    `;
    expect(rows[0]).toEqual({ state: "published", attempts: 0 });
  });

  it("retries sanitized failures and moves terminal failures to dead letter", async () => {
    const event = await addOutboxEvent(sql, {
      topic: "job.generation",
      payload: { portfolioId: "22222222-2222-4222-8222-222222222222" },
      idempotencyKey: "generation:1234567890",
    });
    const dispatcher = new OutboxDispatcher({
      sql,
      maxAttempts: 2,
      queue: {
        async add() {
          throw new Error("password=secret-value");
        },
      },
    });

    await expect(dispatcher.pollOnce()).resolves.toEqual({
      published: 0,
      retried: 1,
      deadLettered: 0,
    });
    await sql`
      update platform_outbox set available_at = now(6) where id = ${event.id}
    `;
    await expect(dispatcher.pollOnce()).resolves.toEqual({
      published: 0,
      retried: 0,
      deadLettered: 1,
    });

    const rows = await sql<
      { state: string; attempts: number; last_error: string }[]
    >`
      select state, attempts, last_error
      from platform_outbox
      where id = ${event.id}
    `;
    expect(rows[0]).toEqual({
      state: "dead_letter",
      attempts: 2,
      last_error: "Error",
    });
    expect(JSON.stringify(rows[0])).not.toContain("secret-value");
  });
});
