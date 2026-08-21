import { randomUUID } from "node:crypto";
import { createMysqlResource } from "../../src/platform/mysql.js";
import { migrate } from "@expresso/database";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApi } from "../../src/api/build-app.js";
import type { RuntimeConfig } from "../../src/config/runtime-config.js";
import { GenerationService } from "../../src/modules/generation/service.js";
import { StubSentenceWriter } from "../support/stub-writer.js";
import { IdentityService } from "../../src/modules/identity/service.js";
import { PortfolioEditingService } from "../../src/modules/portfolio-editing/service.js";
import { OutboxDispatcher } from "../../src/platform/outbox.js";
import { createReliableQueue } from "../../src/platform/queue.js";
import { createQueueWorker } from "../../src/worker/create-queue-worker.js";
import { createGenerationProcessor } from "../../src/worker/processors/generation.js";

const rootDatabaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL;
const describeWithInfrastructure = rootDatabaseUrl && redisUrl ? describe : describe.skip;
interface IdRow { id: string }
async function waitUntil(read: () => Promise<boolean>) { const end = Date.now() + 10000; while (Date.now() < end) { if (await read()) return; await new Promise((resolve) => setTimeout(resolve, 25)); } throw new Error("generation E2E timeout"); }

describeWithInfrastructure("generation edit restore vertical slice", () => {
  const databaseName = `expresso_generation_e2e_${randomUUID().replaceAll("-", "")}`;
  const prefix = `expresso-${databaseName}`;
  const queue = createReliableQueue<Record<string, unknown>>("domain-jobs", redisUrl!, prefix);
  let admin: postgres.Sql; let sql: postgres.Sql; let app: ReturnType<typeof buildApi>;
  let worker: ReturnType<typeof createQueueWorker<Record<string, unknown>, Record<string, unknown>>>;
  let dispatcher: OutboxDispatcher; let origin = ""; let token = "";
  let generation: GenerationService;

  beforeAll(async () => {
    const root = new URL(rootDatabaseUrl!); const adminUrl = new URL(root); adminUrl.pathname = "/postgres";
    admin = createMysqlResource(adminUrl.toString().sql, { max: 1 }); await admin.unsafe(`create database "${databaseName}"`);
    const isolated = new URL(root); isolated.pathname = `/${databaseName}`; await migrate({ databaseUrl: isolated.toString() });
    sql = createMysqlResource(isolated.toString().sql, { max: 6 });
    const planId = (await sql<IdRow[]>`select id from plan where code = 'free'`)[0]?.id;
    const categoryId = (await sql<IdRow[]>`select id from category where key = 'experience' and is_system`)[0]?.id;
    const templateId = (await sql<IdRow[]>`select id from template where code = 'clarity'`)[0]?.id;
    if (!planId || !categoryId || !templateId) throw new Error("generation E2E seed missing");
    const userId = (await sql<IdRow[]>`insert into \`user\` (email, display_name, plan_id) values ('generation-e2e@example.com', 'Generation E2E', ${planId}) returning id`)[0]?.id;
    if (!userId) throw new Error("generation E2E user missing");
    const identity = new IdentityService(sql); token = (await identity.issueSession({ userId })).accessToken;
    const companyId = (await sql<IdRow[]>`insert into company (name, dedupe_key) values ('Generation E2E', ${databaseName}) returning id`)[0]?.id;
    const postingId = companyId && (await sql<IdRow[]>`insert into job_posting (company_id, source, title, description_raw, requirements, dedupe_hash) values (${companyId}, 'user_input', 'Engineer', 'Grounded source', '{}', ${databaseName}) returning id`)[0]?.id;
    const analysisId = postingId && (await sql<IdRow[]>`insert into job_analysis (user_id, job_posting_id, input_type) values (${userId}, ${postingId}, 'paste') returning id`)[0]?.id;
    const recordId = (await sql<IdRow[]>`insert into record (user_id, category_id, title, status, origin, properties, body_md) values (${userId}, ${categoryId}, 'Grounded record', 'organized', 'manual', '{}', 'Grounded record') returning id`)[0]?.id;
    if (!analysisId || !recordId) throw new Error("generation E2E domain missing");
    const brewId = (await sql<IdRow[]>`insert into brew (user_id, job_analysis_id, length_preset) values (${userId}, ${analysisId}, 'single') returning id`)[0]?.id;
    if (!brewId) throw new Error("generation E2E brew missing");
    await sql`insert into brew_source (user_id, brew_id, record_id, rank, selected_by, score, reason_text, is_selected) values (${userId}, ${brewId}, ${recordId}, 0, 'auto', 10, 'fixture', true)`;
    const recipeId = (await sql<IdRow[]>`insert into recipe (user_id, brew_id, version, completeness) values (${userId}, ${brewId}, 1, 100) returning id`)[0]?.id;
    if (!recipeId) throw new Error("generation E2E recipe missing");
    for (let index = 0; index < 3; index += 1) {
      const text = `Grounded record ${index}`;
      const sectionId = (await sql<IdRow[]>`insert into recipe_section (user_id, recipe_id, order_no, title, purpose, target_length) values (${userId}, ${recipeId}, ${index}, ${`Section ${index}`}, 'Evidence', 300) returning id`)[0]?.id;
      const itemId = sectionId && (await sql<IdRow[]>`insert into recipe_item (user_id, recipe_section_id, order_no, point_text, evidence, edited_by) values (${userId}, ${sectionId}, 0, ${text}, ${sql.json([{ sourceType: 'record', sourceId: recordId }])}, 'ai') returning id`)[0]?.id;
      if (!itemId) throw new Error("generation E2E item missing");
      await sql`insert into recipe_evidence_path (user_id, recipe_id, recipe_item_id, source_type, source_id, source_label, target_path) values (${userId}, ${recipeId}, ${itemId}, 'record', ${recordId}, ${text}, ${`sections[${index}].items[0]`})`;
    }
    generation = new GenerationService(sql); const editing = new PortfolioEditingService(sql);
    const config: RuntimeConfig = { nodeEnv: 'test', host: '127.0.0.1', port: 0, logLevel: 'silent', databaseUrl: isolated.toString(), redisUrl: redisUrl!, outboxPollIntervalMs: 1000, outboxBatchSize: 25, outboxMaxAttempts: 5, queuePrefix: prefix };
    app = buildApi({ config, identityService: identity, generationService: generation, portfolioEditingService: editing }); origin = await app.listen({ host: '127.0.0.1', port: 0 });
    worker = createQueueWorker({ queueName: 'domain-jobs', redisUrl: redisUrl!, prefix, concurrency: 1, deadLetterQueue: queue.deadLetterQueue, processor: createGenerationProcessor(generation, new StubSentenceWriter()) });
    dispatcher = new OutboxDispatcher({ sql, queue: queue.queue });
    (globalThis as unknown as { generationFixture: { recipeId: string; templateId: string } }).generationFixture = { recipeId, templateId };
  }, 30000);

  afterAll(async () => { if (worker) await worker.close(); await Promise.allSettled([queue.queue.obliterate({ force: true }), queue.deadLetterQueue.obliterate({ force: true })]); await queue.close(); if (app) await app.close(); if (sql) await sql.end({ timeout: 5 }); if (admin) { await admin`select pg_terminate_backend(pid) from pg_stat_activity where datname = ${databaseName} and pid <> pg_backend_pid()`; await admin.unsafe(`drop database if exists "${databaseName}"`); await admin.end({ timeout: 5 }); } }, 30000);
  async function api(path: string, options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) { return fetch(`${origin}${path}`, { method: options.method ?? 'GET', headers: { authorization: `Bearer ${token}`, ...(options.body === undefined ? {} : { 'content-type': 'application/json' }), ...options.headers }, ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }) }); }

  it("generates through Redis, charges once, rejects a locked rewrite, and restores", async () => {
    const fixture = (globalThis as unknown as { generationFixture: { recipeId: string; templateId: string } }).generationFixture;
    const submit = await api('/v1/generation-jobs', { method: 'POST', headers: { 'idempotency-key': 'generation-e2e-submit-001' }, body: fixture });
    const jobId = ((await submit.json()) as { data: { generationJobId: string } }).data.generationJobId;
    expect((await dispatcher.pollOnce()).published).toBe(1);
    await waitUntil(async () => ((await (await api(`/v1/generation-jobs/${jobId}`)).json()) as { data: { status: string } }).data.status === 'done');
    const status = (await (await api(`/v1/generation-jobs/${jobId}`)).json()) as { data: { portfolioId: string } };
    const portfolioId = status.data.portfolioId;
    const blockId = (await sql<IdRow[]>`select block.id from block join portfolio_section on portfolio_section.id = block.portfolio_section_id where portfolio_section.portfolio_id = ${portfolioId} order by portfolio_section.order_no limit 1`)[0]?.id;
    const snapshotId = (await sql<IdRow[]>`select id from portfolio_snapshot where portfolio_id = ${portfolioId} and kind = 'initial_generation'`)[0]?.id;
    if (!blockId || !snapshotId) throw new Error("generation E2E artifact missing");
    const preview = await api(`/v1/portfolios/${portfolioId}/blocks/${blockId}/edit-preview`, { method: 'POST', body: { operation: 'update_text', text: 'Locked user sentence' } });
    const proposalId = ((await preview.json()) as { data: { id: string } }).data.id;
    await api(`/v1/portfolio-edit-proposals/${proposalId}/apply`, { method: 'POST' });
    await sql`update generation_job set status = 'queued', stage = 'queued' where id = ${jobId}`;
    await expect(generation.process(jobId, new StubSentenceWriter())).rejects.toThrow(/locked block/);
    expect((await sql<{ used: number }[]>`select used from usage_counter limit 1`)[0]?.used).toBe(1);
    const restore = await api(`/v1/portfolios/${portfolioId}/restore`, { method: 'POST', body: { snapshotId, confirm: true } });
    expect(restore.status).toBe(200);
    expect((await sql<{ text: string; locked: boolean }[]>`select content ->> '$.text' as text, locked from block where id = ${blockId}`)[0]).toEqual({ text: 'Grounded record 0', locked: false });
    expect((await sql<{ count: number }[]>`select count(*) as count from generation_sentence_evidence where generation_job_id = ${jobId}`)[0]?.count).toBe(3);
  }, 30000);
});
