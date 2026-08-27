import { randomUUID } from "node:crypto";
import type { SqlTag } from "../../src/platform/mysql.js";
import { createMysqlResource } from "../../src/platform/mysql.js";

import { loadMigrations, migrate } from "@expresso/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../../src/api/build-app.js";
import type { RuntimeConfig } from "../../src/config/runtime-config.js";

import { createRedisResource } from "../../src/platform/redis.js";
import { ISOLATED_DATABASE_TIMEOUT_MS } from "../support/timeouts.js";

const rootDatabaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL;
const describeWithInfrastructure = rootDatabaseUrl && redisUrl ? describe : describe.skip;

describeWithInfrastructure("full release fresh-environment smoke", () => {
  const databaseName = `expresso_release_${randomUUID().replaceAll("-", "")}`;
  let admin: SqlTag;
  let sql: SqlTag;
  let app: ReturnType<typeof buildApi>;
  let closeResources: () => Promise<void>;

  beforeAll(async () => {
    const root = new URL(rootDatabaseUrl!); const adminUrl = new URL(root); adminUrl.pathname = "/mysql";
    admin = createMysqlResource(adminUrl.toString()).sql; await admin.unsafe(`create database \`${databaseName}\``);
    const isolated = new URL(root); isolated.pathname = `/${databaseName}`;
    const migrated = await migrate({ databaseUrl: isolated.toString() });
    // 빈 데이터베이스이므로 저장된 모든 마이그레이션이 한 번에 적용되어야 한다.
    expect(migrated.applied).toHaveLength((await loadMigrations()).length);
    expect(migrated.existing).toHaveLength(0);
    sql = createMysqlResource(isolated.toString()).sql;
    const databaseResource = createMysqlResource(isolated.toString());
    const redisResource = createRedisResource(redisUrl!);
    const config: RuntimeConfig = { nodeEnv: "test", host: "127.0.0.1", port: 0, logLevel: "silent", databaseUrl: isolated.toString(), redisUrl: redisUrl!, outboxPollIntervalMs: 1_000, outboxBatchSize: 25, outboxMaxAttempts: 5, queuePrefix: `release-${randomUUID()}`.slice(0, 30) };
    app = buildApi({ config, readinessChecks: [databaseResource.readinessCheck, redisResource.readinessCheck] });
    await app.ready();
    closeResources = async () => { await Promise.allSettled([databaseResource.close(), redisResource.close()]); };
  }, ISOLATED_DATABASE_TIMEOUT_MS);

  afterAll(async () => {
    if (app) await app.close(); if (closeResources) await closeResources(); if (sql) await sql.end({ timeout: 5 });
    if (admin) { await admin.unsafe(`drop database if exists \`${databaseName}\``); await admin.end({ timeout: 5 }); }
  }, ISOLATED_DATABASE_TIMEOUT_MS);

  it("boots with all canonical seeds and live dependencies", async () => {
    expect((await app.inject({ method: "GET", url: "/health/live" })).json()).toEqual({ status: "alive" });
    const ready = await app.inject({ method: "GET", url: "/health/ready" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({ status: "ready" });
    const counts = (await sql<{ migrations: number; categories: number; templates: number; schedules: number }[]>`
      select
        (select count(*) from schema_migration) as migrations,
        (select count(*) from category where is_system) as categories,
        (select count(*) from template where is_active) as templates,
        (select count(*) from scheduled_job_definition) as schedules
    `)[0];
    expect(counts).toEqual({
      migrations: (await loadMigrations()).length,
      categories: 7,
      // 기존 3종은 보존하고 0016의 디자인 카탈로그 30종을 추가한다.
      templates: 33,
      // job_ingest에서 posting_facts를 떼어 내 8개가 됐다(0054).
      schedules: 8,
    });
  });

  it("has no failed delivery state in a pristine release environment", async () => {
    const audit = (await sql<{ dead_outbox: number; failed_runs: number; charged_without_ledger: number }[]>`
      select
        (select count(*) from platform_outbox where state = 'dead_letter') as dead_outbox,
        (select count(*) from scheduled_job_run where status = 'failed') as failed_runs,
        (select count(*) from generation_job where usage_charged and not exists (
          select 1 from generation_usage_ledger where generation_usage_ledger.generation_job_id = generation_job.id
        )) as charged_without_ledger
    `)[0];
    expect(audit).toEqual({ dead_outbox: 0, failed_runs: 0, charged_without_ledger: 0 });
  });
});

