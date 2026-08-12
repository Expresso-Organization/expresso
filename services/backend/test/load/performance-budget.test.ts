import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import { migrate } from "@expresso/database";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../../src/api/build-app.js";
import type { RuntimeConfig } from "../../src/config/runtime-config.js";
import { AnalyticsService } from "../../src/modules/analytics/service.js";
import { CareerService } from "../../src/modules/career/service.js";
import { EngagementService } from "../../src/modules/engagement/service.js";
import { IdentityService } from "../../src/modules/identity/service.js";

const rootDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = rootDatabaseUrl ? describe : describe.skip;
interface IdRow { id: string }

function percentile(values: number[], ratio: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] ?? 0;
}

describeWithDatabase("release performance and backpressure budget", () => {
  const databaseName = `expresso_load_${randomUUID().replaceAll("-", "")}`;
  let admin: postgres.Sql;
  let sql: postgres.Sql;
  let app: ReturnType<typeof buildApi>;
  let token = "";
  let categoryId = "";
  let deploymentId = "";
  let slug = "";

  beforeAll(async () => {
    const root = new URL(rootDatabaseUrl!); const adminUrl = new URL(root); adminUrl.pathname = "/postgres";
    admin = postgres(adminUrl.toString(), { max: 1 }); await admin.unsafe(`create database "${databaseName}"`);
    const isolated = new URL(root); isolated.pathname = `/${databaseName}`; await migrate({ databaseUrl: isolated.toString() });
    sql = postgres(isolated.toString(), { max: 20 });
    const planId = (await sql<IdRow[]>`select id from plan where code = 'pro'`)[0]?.id;
    const templateId = (await sql<IdRow[]>`select id from template where code = 'clarity'`)[0]?.id;
    categoryId = (await sql<IdRow[]>`select id from category where key = 'experience' and is_system`)[0]?.id ?? "";
    if (!planId || !templateId || !categoryId) throw new Error("load seed missing");
    const userId = (await sql<IdRow[]>`insert into "user" (email, display_name, plan_id) values ('load@example.com', 'Load', ${planId}) returning id`)[0]?.id;
    if (!userId) throw new Error("load user missing");
    const identity = new IdentityService(sql); token = (await identity.issueSession({ userId })).accessToken;
    const companyId = (await sql<IdRow[]>`insert into company (name, dedupe_key) values ('Load', ${databaseName}) returning id`)[0]?.id;
    const postingId = companyId && (await sql<IdRow[]>`insert into job_posting (company_id, source, title, description_raw, requirements, dedupe_hash) values (${companyId}, 'user_input', 'Load', ${"l".repeat(250)}, '{}'::jsonb, ${databaseName}) returning id`)[0]?.id;
    const analysisId = postingId && (await sql<IdRow[]>`insert into job_analysis (user_id, job_posting_id, input_type, status) values (${userId}, ${postingId}, 'paste', 'done') returning id`)[0]?.id;
    const brewId = analysisId && (await sql<IdRow[]>`insert into brew (user_id, job_analysis_id, length_preset, status) values (${userId}, ${analysisId}, 'single', 'done') returning id`)[0]?.id;
    if (!brewId) throw new Error("load brew missing");
    const portfolioId = (await sql<IdRow[]>`insert into portfolio (user_id, brew_id, template_id, title) values (${userId}, ${brewId}, ${templateId}, 'Load portfolio') returning id`)[0]?.id;
    const sectionId = portfolioId && (await sql<IdRow[]>`insert into portfolio_section (user_id, portfolio_id, order_no) values (${userId}, ${portfolioId}, 0) returning id`)[0]?.id;
    if (!portfolioId || !sectionId) throw new Error("load portfolio missing");
    slug = `load-${randomUUID()}`;
    deploymentId = (await sql<IdRow[]>`insert into deployment (user_id, portfolio_id, version, subdomain, published_at, snapshot) values (${userId}, ${portfolioId}, 1, ${slug}, now(), ${sql.json({ sections: [{ id: sectionId }] })}) returning id`)[0]?.id ?? "";
    await sql`update portfolio set current_deployment_id = ${deploymentId}, status = 'published' where id = ${portfolioId}`;
    const analytics = new AnalyticsService(sql, { visitorSalt: "load-test-visitor-salt", rateLimit: 10 });
    const config: RuntimeConfig = { nodeEnv: "test", host: "127.0.0.1", port: 0, logLevel: "silent", databaseUrl: isolated.toString(), redisUrl: "redis://127.0.0.1:1", outboxPollIntervalMs: 1_000, outboxBatchSize: 25, outboxMaxAttempts: 5, queuePrefix: "load-test" };
    app = buildApi({ config, identityService: identity, careerService: new CareerService(sql), engagementService: new EngagementService(sql), analyticsService: analytics });
    await app.ready();
  }, 30_000);

  afterAll(async () => {
    if (app) await app.close(); if (sql) await sql.end({ timeout: 5 });
    if (admin) { await admin`select pg_terminate_backend(pid) from pg_stat_activity where datname = ${databaseName} and pid <> pg_backend_pid()`; await admin.unsafe(`drop database if exists "${databaseName}"`); await admin.end({ timeout: 5 }); }
  }, 30_000);

  async function timed(request: Parameters<typeof app.inject>[0]) {
    const started = performance.now(); const response = await app.inject(request); return { response, ms: performance.now() - started };
  }

  it("keeps read/write/event/queue-registration p95 within release budgets", async () => {
    const auth = { authorization: `Bearer ${token}` };
    const reads = await Promise.all(Array.from({ length: 100 }, () => timed({ method: "GET", url: "/v1/home", headers: auth })));
    const writes = [];
    for (let index = 0; index < 40; index += 1) writes.push(await timed({ method: "POST", url: "/v1/career/records", headers: { ...auth, "idempotency-key": `load-record-create-${String(index).padStart(4, "0")}` }, payload: { categoryId, title: `Load ${index}`, properties: {}, bodyMd: "Measured write" } }));
    const events = [];
    for (let index = 0; index < 60; index += 1) events.push(await timed({ method: "POST", url: "/v1/analytics/events", payload: { eventId: randomUUID(), slug, sessionId: `load-session-${String(index).padStart(4, "0")}`, type: "visit", occurredAt: "2026-08-09T00:00:00.000Z" } }));
    const queueRegistrations = [];
    for (let index = 0; index < 40; index += 1) queueRegistrations.push(await timed({ method: "POST", url: `/v1/deployments/${deploymentId}/analytics/aggregate`, headers: auth, payload: { date: "2026-08-09" } }));
    expect(reads.every(({ response }) => response.statusCode === 200)).toBe(true);
    expect(writes.every(({ response }) => response.statusCode === 201)).toBe(true);
    expect(events.every(({ response }) => response.statusCode === 202)).toBe(true);
    expect(queueRegistrations.every(({ response }) => response.statusCode === 202)).toBe(true);
    const result = {
      readP95Ms: percentile(reads.map(({ ms }) => ms), 0.95),
      writeP95Ms: percentile(writes.map(({ ms }) => ms), 0.95),
      eventP95Ms: percentile(events.map(({ ms }) => ms), 0.95),
      queueRegistrationP95Ms: percentile(queueRegistrations.map(({ ms }) => ms), 0.95),
    };
    console.info(JSON.stringify({ performanceBudget: result }));
    expect(result.readP95Ms).toBeLessThan(300);
    expect(result.writeP95Ms).toBeLessThan(300);
    expect(result.eventP95Ms).toBeLessThan(150);
    expect(result.queueRegistrationP95Ms).toBeLessThan(200);
  }, 30_000);

  it("bounds a hot visitor at the configured rate limit", async () => {
    const responses = [];
    for (let index = 0; index < 20; index += 1) responses.push(await app.inject({ method: "POST", url: "/v1/analytics/events", payload: { eventId: randomUUID(), slug, sessionId: "hot-session-00000001", type: "visit", occurredAt: "2026-08-09T01:00:00.000Z" } }));
    expect(responses.filter(({ statusCode }) => statusCode === 202)).toHaveLength(10);
    expect(responses.filter(({ statusCode }) => statusCode === 429)).toHaveLength(10);
  });
});

