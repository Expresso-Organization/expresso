import { randomUUID } from "node:crypto";
import type { SqlTag } from "../../src/platform/mysql.js";
import { createMysqlResource } from "../../src/platform/mysql.js";

import { migrate } from "@expresso/database";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../../src/api/build-app.js";
import type { RuntimeConfig } from "../../src/config/runtime-config.js";
import { AnalyticsService } from "../../src/modules/analytics/service.js";
import { IdentityService } from "../../src/modules/identity/service.js";
import { PublishingService } from "../../src/modules/publishing/service.js";
import { OutboxDispatcher } from "../../src/platform/outbox.js";
import { createReliableQueue } from "../../src/platform/queue.js";
import { createQueueWorker } from "../../src/worker/create-queue-worker.js";
import { createAnalyticsProcessor } from "../../src/worker/processors/analytics.js";

const rootDatabaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL;
const describeWithInfrastructure = rootDatabaseUrl && redisUrl ? describe : describe.skip;
interface IdRow { id: string }

async function waitUntil(read: () => Promise<boolean>) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await read()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("publish analytics E2E timeout");
}

describeWithInfrastructure("publish visit aggregate insight rollback vertical slice", () => {
  const databaseName = `expresso_publish_e2e_${randomUUID().replaceAll("-", "")}`;
  const queuePrefix = `expresso-${databaseName}`;
  const jobs = createReliableQueue<Record<string, unknown>>("domain-jobs", redisUrl!, queuePrefix);
  let admin: SqlTag;
  let sql: SqlTag;
  let app: ReturnType<typeof buildApi>;
  let worker: ReturnType<typeof createQueueWorker<Record<string, unknown>, Record<string, unknown>>>;
  let dispatcher: OutboxDispatcher;
  let origin = "";
  let token = "";
  let userId = "";
  let portfolioId = "";
  let blockId = "";

  beforeAll(async () => {
    const root = new URL(rootDatabaseUrl!);
    const adminUrl = new URL(root); adminUrl.pathname = "/mysql";
    admin = createMysqlResource(adminUrl.toString()).sql;
    await admin.unsafe(`create database \`${databaseName}\``);
    const isolated = new URL(root); isolated.pathname = `/${databaseName}`;
    await migrate({ databaseUrl: isolated.toString() });
    sql = createMysqlResource(isolated.toString()).sql;
    const planId = (await sql<IdRow[]>`select id from plan where code = 'pro'`)[0]?.id;
    const templateId = (await sql<IdRow[]>`select id from template where code = 'clarity'`)[0]?.id;
    if (!planId || !templateId) throw new Error("publish E2E plan/template missing");
    userId = (await sql<IdRow[]>`
      insert into \`user\` (email, display_name, plan_id) values ('publish-e2e@example.com', 'Publish E2E', ${planId}) returning id
    `)[0]?.id ?? "";
    const identity = new IdentityService(sql);
    token = (await identity.issueSession({ userId })).accessToken;
    const companyId = (await sql<IdRow[]>`insert into company (name, dedupe_key) values ('Publish E2E', ${databaseName}) returning id`)[0]?.id;
    const postingId = companyId && (await sql<IdRow[]>`
      insert into job_posting (company_id, source, title, description_raw, requirements, dedupe_hash)
      values (${companyId}, 'user_input', 'Engineer', ${"p".repeat(250)}, '{}', ${databaseName}) returning id
    `)[0]?.id;
    const analysisId = postingId && (await sql<IdRow[]>`insert into job_analysis (user_id, job_posting_id, input_type, status) values (${userId}, ${postingId}, 'paste', 'done') returning id`)[0]?.id;
    const brewId = analysisId && (await sql<IdRow[]>`insert into brew (user_id, job_analysis_id, length_preset, status) values (${userId}, ${analysisId}, 'single', 'done') returning id`)[0]?.id;
    if (!brewId) throw new Error("publish E2E domain seed missing");
    portfolioId = (await sql<IdRow[]>`insert into portfolio (user_id, brew_id, template_id, title) values (${userId}, ${brewId}, ${templateId}, 'Published evidence') returning id`)[0]?.id ?? "";
    const sectionId = (await sql<IdRow[]>`insert into portfolio_section (user_id, portfolio_id, order_no) values (${userId}, ${portfolioId}, 0) returning id`)[0]?.id;
    blockId = (sectionId && (await sql<IdRow[]>`insert into block (user_id, portfolio_section_id, kind, content) values (${userId}, ${sectionId}, 'paragraph', ${sql.json({ text: "version one" })}) returning id`)[0]?.id) ?? "";
    if (!blockId) throw new Error("publish E2E portfolio missing");
    const publishing = new PublishingService(sql, "publish-e2e-signing-secret");
    const analytics = new AnalyticsService(sql, { visitorSalt: "publish-e2e-visitor-salt", minimumSample: 5 });
    const config: RuntimeConfig = {
      nodeEnv: "test", host: "127.0.0.1", port: 0, logLevel: "silent",
      databaseUrl: isolated.toString(), redisUrl: redisUrl!, outboxPollIntervalMs: 1_000,
      outboxBatchSize: 25, outboxMaxAttempts: 5, queuePrefix,
    };
    app = buildApi({ config, identityService: identity, publishingService: publishing, analyticsService: analytics });
    origin = await app.listen({ host: "127.0.0.1", port: 0 });
    worker = createQueueWorker({
      queueName: "domain-jobs", redisUrl: redisUrl!, prefix: queuePrefix, concurrency: 1,
      deadLetterQueue: jobs.deadLetterQueue, processor: createAnalyticsProcessor(analytics),
    });
    dispatcher = new OutboxDispatcher({ sql, queue: jobs.queue });
  }, 30_000);

  afterAll(async () => {
    if (worker) await worker.close();
    await Promise.allSettled([jobs.queue.obliterate({ force: true }), jobs.deadLetterQueue.obliterate({ force: true })]);
    await jobs.close();
    if (app) await app.close();
    if (sql) await sql.end({ timeout: 5 });
    if (admin) {
      await admin.unsafe(`drop database if exists \`${databaseName}\``);
      await admin.end({ timeout: 5 });
    }
  }, 30_000);

  async function api(path: string, options: { method?: string; body?: unknown; anonymous?: boolean } = {}) {
    return fetch(`${origin}${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...(options.anonymous ? {} : { authorization: `Bearer ${token}` }),
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  }

  it("publishes, collects anonymous traffic, aggregates through Redis, explains, and rolls back", async () => {
    const firstSlug = `publish-v1-${randomUUID()}`;
    const secondSlug = `publish-v2-${randomUUID()}`;
    const publishOne = await api(`/v1/portfolios/${portfolioId}/deployments`, { method: "POST", body: { slug: firstSlug } });
    expect(publishOne.status).toBe(201);
    const first = (await publishOne.json()) as { data: { id: string } };
    for (let index = 0; index < 5; index += 1) {
      const collected = await api("/v1/analytics/events", {
        method: "POST", anonymous: true,
        body: {
          eventId: randomUUID(), slug: firstSlug, sessionId: `publish-visitor-${index}-0001`,
          type: "visit", occurredAt: "2026-08-09T10:00:00.000Z",
          referrer: "https://jobs.example.com/private-candidate-path",
        },
      });
      expect(collected.status).toBe(202);
    }
    const aggregate = await api(`/v1/deployments/${first.data.id}/analytics/aggregate`, { method: "POST", body: { date: "2026-08-09" } });
    expect(aggregate.status).toBe(202);
    expect((await dispatcher.pollOnce()).published).toBe(1);
    // 하루치 집계는 지표 일곱 줄이다 — 방문 · 완독 · 연락처 · 내려받기 · 링크 · 섹션 조회 · 섹션 체류.
    await waitUntil(async () => Number((await sql<{ count: number }[]>`select count(*) as count from metric_daily where deployment_id = ${first.data.id}`)[0]?.count ?? 0) === 7);
    const insight = await api(`/v1/deployments/${first.data.id}/analytics/insight?start=2026-08-09&end=2026-08-09`);
    expect(insight.status).toBe(200);
    expect(await insight.json()).toMatchObject({ data: { visibility: "visible", sampleSize: 5, evidenceMetrics: ["visits", "completes"] } });

    await sql`update block set content = ${sql.json({ text: "version two draft" })} where id = ${blockId}`;
    const publishTwo = await api(`/v1/portfolios/${portfolioId}/deployments`, { method: "POST", body: { slug: secondSlug } });
    expect(publishTwo.status).toBe(201);
    const redirected = await api(`/v1/public/portfolios/${firstSlug}`, { anonymous: true });
    expect(await redirected.json()).toMatchObject({ data: { kind: "redirect", to: secondSlug } });
    const rollback = await api(`/v1/portfolios/${portfolioId}/deployments/${first.data.id}/rollback`, { method: "POST" });
    expect(rollback.status).toBe(200);
    const restored = await api(`/v1/public/portfolios/${firstSlug}`, { anonymous: true });
    expect(JSON.stringify(await restored.json())).toContain("version one");
    expect((await api(`/v1/public/portfolios/${secondSlug}`, { anonymous: true })).status).toBe(404);
  }, 30_000);
});
