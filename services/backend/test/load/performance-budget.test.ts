import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { mongoCollections } from "@expresso/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApi } from "../../src/api/build-app.js";
import type { RuntimeConfig } from "../../src/config/runtime-config.js";
import { MongoAnalyticsService } from "../../src/modules/analytics/service.js";
import { MongoCareerService } from "../../src/modules/career/service.js";
import { MongoEngagementService } from "../../src/modules/engagement/service.js";
import { MongoIdentityService } from "../../src/modules/identity/service.js";
import { MongoJobBoardService } from "../../src/modules/jobs/board-service.js";
import { inTransaction } from "../../src/platform/mongo-transaction.js";
import { readSnapshot, writeSnapshot } from "../../src/platform/snapshot-payload.js";
import { createMongoFixture } from "../support/mongodb.js";

const suite = process.env.EXPRESSO_LOAD_TEST === "1" && process.env.TEST_MONGODB_URL ? describe : describe.skip;
const percentile = (values: number[], ratio: number) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * ratio) - 1)] ?? 0;

suite("MongoDB release performance and backpressure budget", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>; let app: ReturnType<typeof buildApi>; let token = ""; let categoryId = ""; let deploymentId = ""; let slug = ""; let userId = "";
  beforeAll(async () => {
    fixture = await createMongoFixture("load"); const identity = new MongoIdentityService(fixture.resource); const authSession = await identity.signup({ email: `load-${randomUUID()}@example.com`, displayName: "Load", password: "correct-horse-battery" }); token = authSession.session.accessToken; userId = authSession.user.id;
    const career = new MongoCareerService(fixture.resource); categoryId = (await career.listCategories(userId)).find(({ key }) => key === "experience")!.id;
    const db = mongoCollections(fixture.resource.db); const portfolioId = randomUUID(); deploymentId = randomUUID(); const sectionId = randomUUID(); slug = `load-${randomUUID()}`; const now = new Date();
    await db.portfolios.insertOne({ _id: portfolioId, userId, brewId: randomUUID(), templateId: randomUUID(), currentDeploymentId: deploymentId, title: "Load portfolio", status: "published", createdAt: now, updatedAt: now, styleOverrides: {} });
    await db.deployments.insertOne({ _id: deploymentId, userId, portfolioId, version: 1, subdomain: slug, seoIndexable: false, contactVisibility: "hidden", publishedAt: now, hasUnpublishedChanges: false, snapshot: { kind: "inline", value: { sections: [{ id: sectionId }] } }, seo: {} });
    const analytics = new MongoAnalyticsService(fixture.resource, { visitorSalt: "load-test-visitor-salt", rateLimit: 10 }); const config: RuntimeConfig = { nodeEnv: "test", host: "127.0.0.1", port: 0, logLevel: "silent", mongodbUrl: process.env.TEST_MONGODB_URL!, mongodbDatabase: fixture.resource.db.databaseName, redisUrl: "redis://127.0.0.1:1", outboxPollIntervalMs: 1_000, outboxBatchSize: 25, outboxMaxAttempts: 5, queuePrefix: "load-test" };
    app = buildApi({ config, identityService: identity, careerService: career, engagementService: new MongoEngagementService(fixture.resource), analyticsService: analytics }); await app.ready();
  }, 30_000);
  afterAll(async () => { await app?.close(); await fixture?.dispose(); }, 30_000);
  async function timed(request: Parameters<typeof app.inject>[0]) { const started = performance.now(); const response = await app.inject(request); return { response, ms: performance.now() - started }; }
  it("keeps read, write, event and queue registration p95 within budgets", async () => {
    const auth = { authorization: `Bearer ${token}` }; const reads = await Promise.all(Array.from({ length: 100 }, () => timed({ method: "GET", url: "/v1/home", headers: auth }))); const writes = [];
    for (let index = 0; index < 40; index += 1) writes.push(await timed({ method: "POST", url: "/v1/career/records", headers: { ...auth, "idempotency-key": `load-record-${String(index).padStart(8, "0")}` }, payload: { categoryId, title: `Load ${index}`, properties: {}, bodyMd: "Measured write" } }));
    const events = []; for (let index = 0; index < 60; index += 1) events.push(await timed({ method: "POST", url: "/v1/analytics/events", payload: { eventId: randomUUID(), slug, sessionId: `load-session-${String(index).padStart(4, "0")}`, type: "visit", occurredAt: "2026-08-09T00:00:00.000Z" } }));
    const queues = []; for (let index = 0; index < 40; index += 1) queues.push(await timed({ method: "POST", url: `/v1/deployments/${deploymentId}/analytics/aggregate`, headers: auth, payload: { date: "2026-08-09" } }));
    const statusCodes = (samples: Array<{ response: { statusCode: number } }>) => [...new Set(samples.map(({ response }) => response.statusCode))];
    expect(statusCodes(reads), "read response status codes").toEqual([200]);
    expect(statusCodes(writes), "write response status codes").toEqual([201]);
    expect(statusCodes(events), "event response status codes").toEqual([202]);
    expect(statusCodes(queues), "queue response status codes").toEqual([202]);
    const result = { readP95Ms: percentile(reads.map(({ ms }) => ms), .95), writeP95Ms: percentile(writes.map(({ ms }) => ms), .95), eventP95Ms: percentile(events.map(({ ms }) => ms), .95), queueRegistrationP95Ms: percentile(queues.map(({ ms }) => ms), .95) }; console.info(JSON.stringify({ performanceBudget: result })); expect(result.readP95Ms).toBeLessThan(300); expect(result.writeP95Ms).toBeLessThan(300); expect(result.eventP95Ms).toBeLessThan(150); expect(result.queueRegistrationP95Ms).toBeLessThan(200);
  }, 60_000);
  it("keeps 1,000-record query bounded and limits a hot visitor", async () => {
    const db = mongoCollections(fixture.resource.db); const now = new Date(); await db.careerRecords.insertMany(Array.from({ length: 1_000 }, (_, index) => ({ _id: randomUUID(), userId, categoryId, title: `Scale ${String(index).padStart(4, "0")}`, status: "draft" as const, origin: "manual" as const, properties: {}, bodyMd: "scale", periodStart: null, periodEnd: null, deletedAt: null, purgeAfter: null, createdAt: now, updatedAt: now, version: 1 })));
    const explanation = await db.careerRecords.find({ userId, deletedAt: null }).sort({ updatedAt: -1, _id: -1 }).limit(50).explain("executionStats"); expect(explanation.executionStats.totalDocsExamined).toBeLessThanOrEqual(1_050);
    const responses = []; for (let index = 0; index < 20; index += 1) responses.push(await app.inject({ method: "POST", url: "/v1/analytics/events", payload: { eventId: randomUUID(), slug, sessionId: "hot-session-00000001", type: "visit", occurredAt: "2026-08-09T01:00:00.000Z" } })); expect(responses.filter(({ statusCode }) => statusCode === 202)).toHaveLength(10); expect(responses.filter(({ statusCode }) => statusCode === 429)).toHaveLength(10);
  }, 60_000);
  it("measures a 1,000-posting board, a chunked snapshot and generation completion guards", async () => {
    const db = mongoCollections(fixture.resource.db); const companyId = randomUUID(); const now = new Date();
    await db.companies.insertOne({ _id: companyId, name: "Load Company", brandColors: [] });
    await db.jobPostings.insertMany(Array.from({ length: 1_000 }, (_, index) => ({
      _id: randomUUID(), companyId, source: "api" as const, externalId: `load-${index}`, title: `Backend ${String(index).padStart(4, "0")}`,
      descriptionRaw: "Measured posting", requirements: { technologies: ["Node.js"], impacts: [], roles: [], conditions: [] },
      dedupeHash: `load-dedupe-${index}`, createdAt: new Date(now.getTime() - index * 1_000), normalizedAt: now,
      locationRegion: index % 2 ? "서울" : null, jobFamily: index % 2 ? "Backend" : "Frontend", experienceMinYears: index % 3 ? 3 : null,
      duties: [], preferred: [], hiringProcess: [],
    })));
    const boardStarted = performance.now(); const board = await new MongoJobBoardService(fixture.resource).list(userId, { family: "Backend", experience: 5, sort: "recent", page: 1, limit: 20 }); const boardMs = performance.now() - boardStarted;
    const jobPlan = await db.jobPostings.find({ jobFamily: "Backend", locationRegion: "서울" }).limit(50).explain("executionStats");
    expect(board.data).toHaveLength(20); expect(board.summary.total).toBe(500); expect(jobPlan.executionStats.totalDocsExamined).toBeLessThanOrEqual(500);

    const largeValue = { body: "x".repeat(9 * 1024 * 1024) }; const snapshotWriteStarted = performance.now();
    const ref = await inTransaction(fixture.resource, (tx) => writeSnapshot(tx, userId, largeValue)); const snapshotWriteMs = performance.now() - snapshotWriteStarted;
    expect(ref.kind).toBe("chunks"); const snapshotReadStarted = performance.now(); const restored = await readSnapshot(fixture.resource, ref); const snapshotReadMs = performance.now() - snapshotReadStarted; expect(restored.body).toBe(largeValue.body);

    const generationJobId = randomUUID(); await db.generationJobs.insertOne({ _id: generationJobId, userId, brewId: randomUUID(), recipeId: randomUUID(), templateId: randomUUID(), status: "running", usageCharged: false, stage: "materializing", attempts: 1, runToken: "load-run-token", createdAt: now, updatedAt: now, styleOverrides: {} });
    const generationPlan = await db.generationJobs.find({ _id: generationJobId, userId, status: "running", attempts: 1, runToken: "load-run-token" }).explain("executionStats");
    expect(generationPlan.executionStats.totalDocsExamined).toBeLessThanOrEqual(1);
    const result = { boardMs, boardDocsExamined: jobPlan.executionStats.totalDocsExamined, boardKeysExamined: jobPlan.executionStats.totalKeysExamined, snapshotWriteMs, snapshotReadMs, snapshotParts: ref.kind === "chunks" ? ref.parts : 0, generationDocsExamined: generationPlan.executionStats.totalDocsExamined, generationKeysExamined: generationPlan.executionStats.totalKeysExamined };
    console.info(JSON.stringify({ releaseScaleEvidence: result })); expect(boardMs).toBeLessThan(3_000); expect(snapshotWriteMs).toBeLessThan(3_000); expect(snapshotReadMs).toBeLessThan(3_000);
  }, 120_000);
});
