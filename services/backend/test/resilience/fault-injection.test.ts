import { randomUUID } from "node:crypto";
import { createMysqlResource } from "../../src/platform/mysql.js";

import { migrate } from "@expresso/database";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addOutboxEvent, OutboxDispatcher } from "../../src/platform/outbox.js";
import { OperationTimeoutError, withTimeout } from "../../src/platform/timeouts.js";

const rootDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = rootDatabaseUrl ? describe : describe.skip;

describeWithDatabase("release fault injection audit", () => {
  const databaseName = `expresso_fault_${randomUUID().replaceAll("-", "")}`;
  let admin: postgres.Sql;
  let sql: postgres.Sql;

  beforeAll(async () => {
    const root = new URL(rootDatabaseUrl!); const adminUrl = new URL(root); adminUrl.pathname = "/postgres";
    admin = createMysqlResource(adminUrl.toString().sql, { max: 1 }); await admin.unsafe(`create database "${databaseName}"`);
    const isolated = new URL(root); isolated.pathname = `/${databaseName}`; await migrate({ databaseUrl: isolated.toString() });
    sql = createMysqlResource(isolated.toString().sql, { max: 4 });
  }, 30_000);

  afterAll(async () => {
    if (sql) await sql.end({ timeout: 5 });
    if (admin) { await admin`select pg_terminate_backend(pid) from pg_stat_activity where datname = ${databaseName} and pid <> pg_backend_pid()`; await admin.unsafe(`drop database if exists "${databaseName}"`); await admin.end({ timeout: 5 }); }
  }, 30_000);

  it("rolls back domain state and its outbox atomically on DB failure", async () => {
    await expect(sql.begin(async (transaction) => {
      await addOutboxEvent(transaction, { topic: "fault.test", payload: { safe: true }, idempotencyKey: "fault-rollback-0001" });
      throw new Error("forced transaction failure");
    })).rejects.toThrow(/forced/);
    expect((await sql<{ count: number }[]>`select count(*) as count from platform_outbox where idempotency_key = 'fault-rollback-0001'`)[0]?.count).toBe(0);
  });

  it("preserves an outbox event across a disconnected queue and publishes once after recovery", async () => {
    const event = await addOutboxEvent(sql, { topic: "fault.redis", payload: { id: "safe" }, idempotencyKey: "fault-redis-0001" });
    const disconnected = new OutboxDispatcher({ sql, maxAttempts: 3, queue: { async add() { throw Object.assign(new Error("connection refused with secret"), { code: "ECONNREFUSED" }); } } });
    await expect(disconnected.pollOnce()).resolves.toMatchObject({ retried: 1 });
    expect((await sql<{ state: string; attempts: number; last_error: string }[]>`select state, attempts, last_error from platform_outbox where id = ${event.id}`)[0]).toEqual({ state: "pending", attempts: 1, last_error: "Error:ECONNREFUSED" });
    await sql`update platform_outbox set available_at = now() where id = ${event.id}`;
    const published: string[] = [];
    const recovered = new OutboxDispatcher({ sql, queue: { async add(_name, _payload, options) { published.push(String(options.jobId)); } } });
    await expect(recovered.pollOnce()).resolves.toMatchObject({ published: 1 });
    await expect(recovered.pollOnce()).resolves.toMatchObject({ published: 0 });
    expect(published).toEqual([event.id]);
  });

  it("turns a hung dependency into a typed timeout without leaking late results", async () => {
    await expect(withTimeout(new Promise<never>(() => undefined), 5, "provider call")).rejects.toBeInstanceOf(OperationTimeoutError);
    await expect(withTimeout(Promise.resolve("ok"), 100, "provider call")).resolves.toBe("ok");
  });
});

