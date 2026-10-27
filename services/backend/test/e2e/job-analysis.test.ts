import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../../src/api/build-app.js";
import type { RuntimeConfig } from "../../src/config/runtime-config.js";
import { StubRequirementExtractor } from "../support/stub-extractor.js";
import { MongoCareerService } from "../../src/modules/career/index.js";
import { MongoIdentityService } from "../../src/modules/identity/index.js";
import { MongoJobAnalysisService } from "../../src/modules/job-analysis/index.js";
import { MongoJobMarketService } from "../../src/modules/jobs/index.js";
import { MongoOutboxDispatcher } from "../../src/platform/mongo-outbox.js";
import { createReliableQueue } from "../../src/platform/queue.js";
import { createQueueWorker } from "../../src/worker/create-queue-worker.js";
import { createJobAnalysisProcessor } from "../../src/worker/processors/job-analysis.js";
import { ISOLATED_DATABASE_TIMEOUT_MS } from "../support/timeouts.js";
import { createMongoFixture } from "../support/mongodb.js";
import { mongoCollections } from "@expresso/database";

const redisUrl = process.env.TEST_REDIS_URL;

async function waitUntil(
  condition: () => Promise<boolean>,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("timed out waiting for E2E state");
}

const describeWithMongoInfrastructure = process.env.TEST_MONGODB_URL && redisUrl ? describe : describe.skip;

describeWithMongoInfrastructure("MongoDB job submission and analysis vertical slice", () => {
  const queuePrefix = `expresso-mongo-jobs-e2e-${randomUUID()}`;
  const jobs = createReliableQueue<Record<string, unknown>>("domain-jobs", redisUrl ?? "redis://127.0.0.1:1", queuePrefix);
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let app: ReturnType<typeof buildApi>;
  let worker: ReturnType<typeof createQueueWorker<Record<string, unknown>, Record<string, unknown>>>;
  let dispatcher: MongoOutboxDispatcher;
  let origin = "";
  let accessToken = "";
  let userId = "";
  let signalExtractionStarted: () => void = () => undefined;
  let releaseExtraction: () => void = () => undefined;
  const extractionStarted = new Promise<void>((resolve) => { signalExtractionStarted = resolve; });
  const extractionReleased = new Promise<void>((resolve) => { releaseExtraction = resolve; });

  beforeAll(async () => {
    fixture = await createMongoFixture("jobs-e2e");
    const identityService = new MongoIdentityService(fixture.resource);
    const careerService = new MongoCareerService(fixture.resource);
    const jobMarketService = new MongoJobMarketService(fixture.resource);
    const jobAnalysisService = new MongoJobAnalysisService(fixture.resource);
    const signup = await identityService.signup({ email: `jobs-e2e-${randomUUID()}@example.com`, displayName: "Jobs Vertical", password: "correct-horse-battery" });
    userId = signup.user.id;
    accessToken = signup.session.accessToken;
    const config: RuntimeConfig = {
      nodeEnv: "test", host: "127.0.0.1", port: 0, logLevel: "silent",
      databaseUrl: "mysql://127.0.0.1:1/unused", redisUrl: redisUrl!,
      outboxPollIntervalMs: 1_000, outboxBatchSize: 25, outboxMaxAttempts: 5, queuePrefix,
    };
    app = buildApi({ config, identityService, careerService, jobMarketService, jobAnalysisService });
    origin = await app.listen({ host: "127.0.0.1", port: 0 });
    const stubExtractor = new StubRequirementExtractor();
    worker = createQueueWorker({
      queueName: "domain-jobs", redisUrl: redisUrl!, prefix: queuePrefix, concurrency: 1,
      deadLetterQueue: jobs.deadLetterQueue,
      processor: createJobAnalysisProcessor(jobAnalysisService, { async extract(source) {
        signalExtractionStarted(); await extractionReleased; return stubExtractor.extract(source);
      } }),
    });
    dispatcher = new MongoOutboxDispatcher({ context: fixture.resource, queue: jobs.queue, batchSize: 25, maxAttempts: 5 });
  }, ISOLATED_DATABASE_TIMEOUT_MS);

  afterAll(async () => {
    releaseExtraction();
    if (worker) await worker.close();
    await Promise.allSettled([jobs.queue.obliterate({ force: true }), jobs.deadLetterQueue.obliterate({ force: true })]);
    await jobs.close();
    if (app) await app.close();
    await fixture?.dispose();
  }, ISOLATED_DATABASE_TIMEOUT_MS);

  async function api(path: string, options: { method?: string; headers?: Record<string, string>; body?: unknown } = {}) {
    return fetch(`${origin}${path}`, { method: options.method ?? "GET", headers: { authorization: `Bearer ${accessToken}`, ...(options.body === undefined ? {} : { "content-type": "application/json" }), ...options.headers }, ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }) });
  }

  it("runs HTTP submission through MongoDB outbox, Redis worker, evidence, coverage, and match", async () => {
    const categories = await (await api("/v1/career/categories")).json() as { data: Array<{ id: string; key: string }> };
    const categoryId = categories.data.find(({ key }) => key === "experience")?.id;
    if (!categoryId) throw new Error("experience category missing");
    const sentences = ["TypeScript와 MongoDB를 사용하여 고가용성 backend API를 설계하고 운영합니다.", "AWS 환경에서 대규모 트래픽 장애를 분석하고 reliability를 개선합니다.", "제품 및 데이터 팀과 협업하여 고객 impact를 정량적으로 측정합니다.", "remote 협업 환경에서 기술 문서와 코드 리뷰로 품질을 높입니다."];
    const descriptionRaw = `${sentences.join(" ")} ${"원본 공고의 상세 업무와 자격 요건을 보존합니다. ".repeat(4)}`;
    for (const [index, bodyMd] of sentences.slice(0, 3).entries()) {
      expect((await api("/v1/career/records", { method: "POST", headers: { "idempotency-key": `mongo-jobs-record-${index}` }, body: { categoryId, title: `Evidence ${index}`, properties: {}, bodyMd } })).status).toBe(201);
    }
    const submittedResponse = await api("/v1/jobs/submissions", { method: "POST", headers: { "idempotency-key": "mongo-jobs-submission-0001" }, body: { companyName: "Mongo E2E", companyDomain: "mongo-e2e.example.com", title: "Backend Engineer", sourceUrl: "https://mongo-e2e.example.com/backend", descriptionRaw } });
    expect(submittedResponse.status).toBe(202);
    const submitted = await submittedResponse.json() as { data: { jobPostingId: string; jobAnalysisId: string } };
    expect(await dispatcher.pollOnce()).toEqual({ published: 1, retried: 0, deadLettered: 0 });
    await Promise.race([extractionStarted, new Promise((_, reject) => setTimeout(() => reject(new Error("worker did not start extraction")), 10_000))]);
    expect(await (await api(`/v1/job-analyses/${submitted.data.jobAnalysisId}`)).json()).toMatchObject({ data: { analysis: { status: "running", attempts: 1 } } });
    releaseExtraction();
    await waitUntil(async () => (await (await api(`/v1/job-analyses/${submitted.data.jobAnalysisId}`)).json() as { data: { analysis: { status: string } } }).data.analysis.status === "done");
    const completed = await (await api(`/v1/job-analyses/${submitted.data.jobAnalysisId}`)).json() as { data: { requirements: Array<{ sourceSpan: { start: number; end: number; quote: string }; coveredBy: string[] }> } };
    expect(completed.data.requirements.length).toBeGreaterThanOrEqual(3);
    for (const requirement of completed.data.requirements) expect(Array.from(descriptionRaw).slice(requirement.sourceSpan.start, requirement.sourceSpan.end).join("")).toBe(requirement.sourceSpan.quote);
    expect(completed.data.requirements.some(({ coveredBy }) => coveredBy.length > 0)).toBe(true);
    const match = await (await api(`/v1/jobs/postings/${submitted.data.jobPostingId}/match`, { method: "POST" })).json() as { data: { total: number; required: number; covered: number } };
    expect(match.data.total).toBe(Math.round(100 * match.data.covered / match.data.required));
    const db = mongoCollections(fixture.resource.db);
    expect((await db.outboxEvents.findOne({ "payload.jobAnalysisId": submitted.data.jobAnalysisId }))?.state).toBe("published");
    expect(await db.jobPostingRequirements.countDocuments({ jobPostingId: submitted.data.jobPostingId })).toBe(completed.data.requirements.length);
    expect(await db.requirementCoverages.countDocuments({ userId })).toBe(completed.data.requirements.length);
  }, 30_000);
});
