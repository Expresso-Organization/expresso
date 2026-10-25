import { randomUUID } from "node:crypto";
import { mongoCollections } from "@expresso/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoOutboxDispatcher } from "../../platform/mongo-outbox.js";
import { MongoIdentityService } from "../identity/index.js";
import { MongoMaterialsService } from "../materials/service.js";
import { MongoBrewJobService } from "./service.js";

describe.skipIf(!process.env.TEST_MONGODB_URL)("MongoDB brew job resubmission", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let jobs: MongoBrewJobService;
  let materials: MongoMaterialsService;
  let owner: string;

  beforeAll(async () => {
    fixture = await createMongoFixture("brew-job-retry");
    jobs = new MongoBrewJobService(fixture.resource);
    materials = new MongoMaterialsService(fixture.resource);
    owner = (await new MongoIdentityService(fixture.resource).signup({ email: `brew-retry-${randomUUID()}@example.com`, displayName: "재시도", password: "correct-horse-battery" })).user.id;
  }, 60_000);
  afterAll(async () => { await fixture?.dispose(); });

  async function newBrew() {
    return (await materials.createFreeBrew(owner, { title: "재시도", brief: "실패 뒤 다시 누르기", lengthPreset: "single" })).brewId;
  }
  const outbox = (brewJobId: string) => mongoCollections(fixture.resource.db).outboxEvents.find({ "payload.brewJobId": brewJobId }).sort({ createdAt: 1 }).toArray();
  const failing = { async run(): Promise<string> { throw new Error("consent missing"); } };
  async function fail(jobId: string, retryable: boolean) {
    await expect(jobs.process(jobId, failing, () => ({ code: retryable ? "PROVIDER_FAILED" : "BREW_INPUT_REJECTED", retryable }))).rejects.toThrow("consent missing");
  }

  it("requeues a retryable failure under a new outbox event the worker receives, then succeeds", async () => {
    const brewId = await newBrew();
    const key = `recipe:${brewId}`;
    const first = await jobs.submit(owner, "recipe", key, { brewId });
    await fail(first.jobId, true);
    expect(await jobs.getStatus(owner, first.jobId)).toMatchObject({ status: "failed", failure: { code: "PROVIDER_FAILED", retryable: true } });

    const retried = await jobs.submit(owner, "recipe", key, { brewId });
    expect(retried).toMatchObject({ jobId: first.jobId, status: "queued", stage: "queued", failure: null, attempts: 1 });
    const events = await outbox(first.jobId);
    expect(events.map((event) => event.idempotencyKey)).toEqual([`brew-job:${first.jobId}`, `brew-job:${first.jobId}:1`]);

    const added: { name: string; jobId: unknown; payload: Record<string, unknown> }[] = [];
    const dispatcher = new MongoOutboxDispatcher({ context: fixture.resource, queue: { async add(name, payload, options) { added.push({ name, jobId: options.jobId, payload }); } } });
    await dispatcher.pollOnce();
    const queued = added.filter((job) => job.payload.brewJobId === first.jobId);
    expect(queued).toHaveLength(2);
    expect(queued.every((job) => job.name === "recipe.draft")).toBe(true);
    expect(new Set(queued.map((job) => job.jobId)).size).toBe(2);

    const resultId = randomUUID();
    expect(await jobs.process(first.jobId, { async run() { return resultId; } }, () => ({ code: "PROVIDER_FAILED", retryable: true }))).toMatchObject({ status: "succeeded", resultId, failure: null, attempts: 2 });
  });

  it("numbers each resubmission so a second failure is published again", async () => {
    const brewId = await newBrew();
    const key = `interview:${brewId}`;
    const job = await jobs.submit(owner, "interview", key, { brewId });
    await fail(job.jobId, true);
    await jobs.submit(owner, "interview", key, { brewId });
    await fail(job.jobId, true);
    expect(await jobs.submit(owner, "interview", key, { brewId })).toMatchObject({ status: "queued", attempts: 2 });
    expect((await outbox(job.jobId)).map((event) => [event.topic, event.idempotencyKey])).toEqual([
      ["interview.draft", `brew-job:${job.jobId}`],
      ["interview.draft", `brew-job:${job.jobId}:1`],
      ["interview.draft", `brew-job:${job.jobId}:2`],
    ]);
  });

  it("collapses concurrent resubmissions of one failure into one new event", async () => {
    const brewId = await newBrew();
    const key = `recipe:${brewId}`;
    const job = await jobs.submit(owner, "recipe", key, { brewId });
    await fail(job.jobId, true);
    const results = await Promise.all([jobs.submit(owner, "recipe", key, { brewId }), jobs.submit(owner, "recipe", key, { brewId })]);
    expect(results.map((result) => result.status)).toEqual(["queued", "queued"]);
    expect(await outbox(job.jobId)).toHaveLength(2);
  });

  it("replays a non-retryable failure without publishing", async () => {
    const brewId = await newBrew();
    const key = `recipe:${brewId}`;
    const job = await jobs.submit(owner, "recipe", key, { brewId });
    await fail(job.jobId, false);
    expect(await jobs.submit(owner, "recipe", key, { brewId })).toMatchObject({ jobId: job.jobId, status: "failed", failure: { code: "BREW_INPUT_REJECTED", retryable: false } });
    expect(await outbox(job.jobId)).toHaveLength(1);
  });

  it("replays a succeeded job without publishing", async () => {
    const brewId = await newBrew();
    const key = `recipe:${brewId}`;
    const job = await jobs.submit(owner, "recipe", key, { brewId });
    const resultId = randomUUID();
    await jobs.process(job.jobId, { async run() { return resultId; } }, () => ({ code: "PROVIDER_FAILED", retryable: true }));
    expect(await jobs.submit(owner, "recipe", key, { brewId })).toMatchObject({ jobId: job.jobId, status: "succeeded", resultId });
    expect(await outbox(job.jobId)).toHaveLength(1);
  });
});
