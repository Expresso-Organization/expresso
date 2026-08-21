import { randomUUID } from "node:crypto";
import { createMysqlResource } from "../../platform/mysql.js";

import { migrate } from "@expresso/database";
import type { SqlTag } from "../../platform/mysql.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SCHEDULED_JOB_KEYS, SchedulingService, type ScheduledJobKey } from "./service.js";

const rootDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = rootDatabaseUrl ? describe : describe.skip;

describeWithDatabase("scheduled job leases and observability", () => {
  const databaseName = `expresso_scheduler_${randomUUID().replaceAll("-", "")}`;
  let admin: SqlTag;
  let sql: SqlTag;
  let service: SchedulingService;
  let retentionCalls = 0;

  beforeAll(async () => {
    const root = new URL(rootDatabaseUrl!);
    const adminUrl = new URL(root); adminUrl.pathname = "/mysql";
    admin = createMysqlResource(adminUrl.toString()).sql;
    await admin.unsafe(`create database \`${databaseName}\``);
    const isolated = new URL(root); isolated.pathname = `/${databaseName}`;
    await migrate({ databaseUrl: isolated.toString() });
    sql = createMysqlResource(isolated.toString()).sql;
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
      await admin.unsafe(`drop database if exists \`${databaseName}\``);
      await admin.end({ timeout: 5 });
    }
  }, 30_000);

  it("DB가 허용하는 잡 키를 코드가 전부 안다", async () => {
    /*
     * 2026-08-13에 어긋났던 자리다. 마이그레이션이 `posting_facts`를 심은
     * 직후, 아직 재시작하지 않은 워커가 그 키를 집어 **남의 잡(retention)의
     * `delete`를 돌리고 성공했다고 적었다.** 지금은 모르는 키에서 throw하지만,
     * 애초에 어긋나지 않게 여기서 잡는다.
     */
    const rows = await sql<{ key: string }[]>`
      select job_key as \`key\` from scheduled_job_definition order by job_key
    `;
    expect(rows.length).toBeGreaterThan(0);
    const known = new Set<string>(SCHEDULED_JOB_KEYS);
    expect(rows.filter(({ key }) => !known.has(key))).toEqual([]);
  });

  it("creates one run per due slot under concurrent scheduler ticks", async () => {
    const now = new Date("2026-08-09T01:00:00Z");
    /*
     * 세는 것은 **슬롯 하나에 실행 하나**이지 잡이 몇 개인가가 아니다.
     * 정의 수를 DB에서 읽어 기준으로 삼는다 — 잡이 늘 때마다 이 숫자를 고치게
     * 두면, 고치는 사람이 무엇을 확인하는 시험인지 잊는다.
     */
    const definitions = (await sql<{ count: number }[]>`
      select count(*) as count from scheduled_job_definition
    `)[0]?.count ?? 0;
    expect(definitions).toBeGreaterThan(0);

    const ticks = await Promise.all(Array.from({ length: 20 }, () => service.scheduleDue(now)));
    expect(new Set(ticks.flatMap(({ scheduled }) => scheduled)).size).toBe(definitions);
    expect((await sql<{ count: number }[]>`select count(*) as count from scheduled_job_run`)[0]?.count).toBe(definitions);
    expect((await sql<{ count: number }[]>`select count(*) as count from platform_outbox where topic = 'scheduled.execute'`)[0]?.count).toBe(definitions);
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

