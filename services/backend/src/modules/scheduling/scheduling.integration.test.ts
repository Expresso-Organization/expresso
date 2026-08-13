import { randomUUID } from "node:crypto";

import { migrate } from "@expresso/database";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SchedulingService, type ScheduledJobKey } from "./service.js";

const rootDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = rootDatabaseUrl ? describe : describe.skip;

describeWithDatabase("scheduled job leases and observability", () => {
  const databaseName = `expresso_scheduler_${randomUUID().replaceAll("-", "")}`;
  let admin: postgres.Sql;
  let sql: postgres.Sql;
  let service: SchedulingService;
  let retentionCalls = 0;

  beforeAll(async () => {
    const root = new URL(rootDatabaseUrl!);
    const adminUrl = new URL(root); adminUrl.pathname = "/postgres";
    admin = postgres(adminUrl.toString(), { max: 1 });
    await admin.unsafe(`create database "${databaseName}"`);
    const isolated = new URL(root); isolated.pathname = `/${databaseName}`;
    await migrate({ databaseUrl: isolated.toString() });
    sql = postgres(isolated.toString(), { max: 20 });
    service = new SchedulingService(sql, { overrides: {
      retention: async () => {
        retentionCalls += 1;
        if (retentionCalls === 1) throw new Error("retention fixture failure");
        return { retained: true };
      },
    } });
    await sql`update scheduled_job_definition set next_run_at = '2026-08-09T00:00:00Z'`;
  }, 30_000);

  afterAll(async () => {
    if (sql) await sql.end({ timeout: 5 });
    if (admin) {
      await admin`select pg_terminate_backend(pid) from pg_stat_activity where datname = ${databaseName} and pid <> pg_backend_pid()`;
      await admin.unsafe(`drop database if exists "${databaseName}"`);
      await admin.end({ timeout: 5 });
    }
  }, 30_000);

  it("creates one run per due slot under concurrent scheduler ticks", async () => {
    const now = new Date("2026-08-09T01:00:00Z");
    /*
     * 세는 것은 **슬롯 하나에 실행 하나**이지 잡이 몇 개인가가 아니다.
     * 정의 수를 DB에서 읽어 기준으로 삼는다 — 잡이 늘 때마다 이 숫자를 고치게
     * 두면, 고치는 사람이 무엇을 확인하는 시험인지 잊는다.
     */
    const definitions = (await sql<{ count: number }[]>`
      select count(*)::integer as count from scheduled_job_definition
    `)[0]?.count ?? 0;
    expect(definitions).toBeGreaterThan(0);

    const ticks = await Promise.all(Array.from({ length: 20 }, () => service.scheduleDue(now)));
    expect(new Set(ticks.flatMap(({ scheduled }) => scheduled)).size).toBe(definitions);
    expect((await sql<{ count: number }[]>`select count(*)::integer as count from scheduled_job_run`)[0]?.count).toBe(definitions);
    expect((await sql<{ count: number }[]>`select count(*)::integer as count from platform_outbox where topic = 'scheduled.execute'`)[0]?.count).toBe(definitions);
    const status = await service.status(now);
    expect(status).toHaveLength(definitions);
    expect(status.every(({ nextRunAt }) => new Date(nextRunAt) > now)).toBe(true);
  });

  it("runs every scheduled operation once and exposes failure, retry, lag, and next execution", async () => {
    const runs = await sql<{ id: string; job_key: ScheduledJobKey }[]>`select id, job_key from scheduled_job_run order by job_key`;
    const retention = runs.find(({ job_key }) => job_key === "retention");
    if (!retention) throw new Error("retention run missing");
    for (const run of runs.filter(({ id }) => id !== retention.id)) {
      const results = await Promise.all(Array.from({ length: 5 }, () => service.process(run.id, new Date("2026-08-09T01:00:01Z"))));
      expect(results.some(({ status }) => status === "succeeded")).toBe(true);
      expect((await service.getRun(run.id)).attempts).toBe(1);
    }
    await expect(service.process(retention.id, new Date("2026-08-09T01:00:01Z"))).rejects.toThrow(/fixture/);
    expect(await service.getRun(retention.id, new Date("2026-08-09T01:00:02Z"))).toMatchObject({ status: "failed", attempts: 1, lastError: "Error", lagMs: 3_602_000 });
    expect((await service.status(new Date("2026-08-09T01:00:02Z"))).find(({ jobKey }) => jobKey === "retention"))
      .toMatchObject({ lastStatus: "failed", failureCount: 1, nextRunAt: "2026-08-10T00:00:00.000Z" });
    await expect(service.process(retention.id, new Date("2026-08-09T01:00:03Z"))).resolves.toMatchObject({ status: "succeeded", attempts: 2, result: { retained: true } });
    await service.process(retention.id, new Date("2026-08-09T01:00:04Z"));
    expect(retentionCalls).toBe(2);
    expect((await service.status()).find(({ jobKey }) => jobKey === "retention")).toMatchObject({ lastStatus: "succeeded", failureCount: 0 });
  }, 30_000);
});

