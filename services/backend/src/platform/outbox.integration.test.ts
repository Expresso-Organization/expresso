import { randomUUID } from "node:crypto";

import { migrate } from "@expresso/database";
import type { SqlTag } from "./mysql.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addOutboxEvent, OutboxDispatcher } from "./outbox.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase("platform outbox integration", () => {
  const databaseName = `expresso_outbox_${randomUUID().replaceAll("-", "")}`;
  let admin: SqlTag;
  let sql: SqlTag;

  beforeAll(async () => {
    const rootUrl = new URL(databaseUrl ?? "postgres://127.0.0.1:1/unused");
    const adminUrl = new URL(rootUrl);
    adminUrl.pathname = "/postgres";
    admin = postgres(adminUrl.toString(), { max: 1 });
    await admin.unsafe(`create database "${databaseName}"`);
    const isolatedUrl = new URL(rootUrl);
    isolatedUrl.pathname = `/${databaseName}`;
    await migrate({ databaseUrl: isolatedUrl.toString() });
    sql = postgres(isolatedUrl.toString(), { max: 2 });
  }, 30_000);

  afterAll(async () => {
    if (sql) await sql.end({ timeout: 5 });
    if (admin) {
      await admin`
        select pg_terminate_backend(pid) from pg_stat_activity
        where datname = ${databaseName} and pid <> pg_backend_pid()
      `;
      await admin.unsafe(`drop database if exists "${databaseName}"`);
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
      update platform_outbox set available_at = now() where id = ${event.id}
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
