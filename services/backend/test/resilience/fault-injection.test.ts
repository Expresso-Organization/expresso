import { randomUUID } from "node:crypto";
import type { SqlTag } from "../../src/platform/mysql.js";
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
  let admin: SqlTag;
  let sql: SqlTag;

  beforeAll(async () => {
    const root = new URL(rootDatabaseUrl!); const adminUrl = new URL(root); adminUrl.pathname = "/mysql";
    admin = createMysqlResource(adminUrl.toString()).sql; await admin.unsafe(`create database \`${databaseName}\``);
    const isolated = new URL(root); isolated.pathname = `/${databaseName}`; await migrate({ databaseUrl: isolated.toString() });
    sql = createMysqlResource(isolated.toString()).sql;
  }, 30_000);

  afterAll(async () => {
    if (sql) await sql.end({ timeout: 5 });
    if (admin) {    const published: string[] = [];
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

