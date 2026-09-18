import { randomUUID } from "node:crypto";

import { mongoCollections } from "@expresso/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoCareerService } from "../career/index.js";
import { MongoIdentityService } from "../identity/index.js";
import { MongoSchedulingService } from "./service.js";
import { SCHEDULED_JOB_KEYS, type ScheduledJobKey } from "./public.js";

describe.skipIf(!process.env.TEST_MONGODB_URL)("MongoDB scheduled jobs", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>; let service: MongoSchedulingService; let retentionCalls = 0;
  beforeAll(async () => {
    fixture = await createMongoFixture("scheduling"); service = new MongoSchedulingService(fixture.resource, { overrides: { retention: async () => { retentionCalls += 1; if (retentionCalls === 1) throw new Error("retention fixture failure"); return { retained: true }; } } });
    await mongoCollections(fixture.resource.db).scheduledJobDefinitions.updateMany({}, { $set: { nextRunAt: new Date("2026-08-09T00:00:00Z") } });
  });
  afterAll(async () => fixture?.dispose());

  it("keeps seed definitions aligned with code and schedules each due slot once", async () => {
    const db = mongoCollections(fixture.resource.db); const rows = await db.scheduledJobDefinitions.find().sort({ _id: 1 }).toArray(); const known = new Set<string>(SCHEDULED_JOB_KEYS);
    expect(rows.filter(({ _id }) => !known.has(_id))).toEqual([]);
    const now = new Date("2026-08-09T01:00:00Z"); const ticks = await Promise.all(Array.from({ length: 20 }, () => service.scheduleDue(now)));
    expect(new Set(ticks.flatMap(({ scheduled }) => scheduled)).size).toBe(rows.length); expect(await db.scheduledJobRuns.countDocuments()).toBe(rows.length); expect(await db.outboxEvents.countDocuments({ topic: "scheduled.execute" })).toBe(rows.length);
  });

  it("claims once, exposes failures, and retries a failed run", async () => {
    const db = mongoCollections(fixture.resource.db); const runs = await db.scheduledJobRuns.find().sort({ jobKey: 1 }).toArray(); const retention = runs.find(({ jobKey }) => jobKey === "retention"); if (!retention) throw new Error("retention run missing");
    for (const run of runs.filter(({ _id }) => _id !== retention._id)) { await Promise.all(Array.from({ length: 5 }, () => service.process(run._id, new Date("2026-08-09T01:00:01Z")))); expect((await service.getRun(run._id)).attempts).toBe(1); }
    await expect(service.process(retention._id, new Date("2026-08-09T01:00:01Z"))).rejects.toThrow(/fixture/); await expect(service.getRun(retention._id, new Date("2026-08-09T01:00:02Z"))).resolves.toMatchObject({ status: "failed", attempts: 1, lastError: "Error" });
    await expect(service.process(retention._id, new Date("2026-08-09T01:00:03Z"))).resolves.toMatchObject({ status: "succeeded", attempts: 2, result: { retained: true } }); await service.process(retention._id, new Date("2026-08-09T01:00:04Z")); expect(retentionCalls).toBe(2);
    const statuses = await service.status(); expect(statuses).toHaveLength(SCHEDULED_JOB_KEYS.length); expect(statuses.find(({ jobKey }) => jobKey === "retention")).toMatchObject({ lastStatus: "succeeded", failureCount: 0 });
  }, 30_000);

  it("purges only expired trashed career records through the safe cascade", async () => {
    const identity = new MongoIdentityService(fixture.resource);
    const career = new MongoCareerService(fixture.resource);
    const userId = (await identity.signup({ email: `retention-${randomUUID()}@example.com`, password: "correct-horse-battery", displayName: "보존" })).user.id;
    const categoryId = (await career.listCategories(userId)).find(({ key }) => key === "experience")!.id;
    const expired = (await career.createRecord(userId, randomUUID(), { categoryId, title: "만료", properties: {}, bodyMd: "" })).record;
    const future = (await career.createRecord(userId, randomUUID(), { categoryId, title: "유예", properties: {}, bodyMd: "" })).record;
    const active = (await career.createRecord(userId, randomUUID(), { categoryId, title: "활성", properties: {}, bodyMd: "" })).record;
    const db = mongoCollections(fixture.resource.db);
    const at = new Date("2026-09-18T00:00:00Z");
    await db.careerRecords.updateOne({ _id: expired.id }, { $set: { deletedAt: new Date("2026-08-01T00:00:00Z"), purgeAfter: at } });
    await db.careerRecords.updateOne({ _id: future.id }, { $set: { deletedAt: new Date("2026-09-01T00:00:00Z"), purgeAfter: new Date("2026-09-19T00:00:00Z") } });
    await db.careerRecords.updateOne({ _id: active.id }, { $set: { purgeAfter: at } });
    const sectionId = randomUUID(); const blockId = randomUUID();
    await db.portfolioSections.insertOne({ _id: sectionId, userId, portfolioId: randomUUID(), orderNo: 0, visible: true });
    await db.blocks.insertOne({ _id: blockId, userId, portfolioSectionId: sectionId, kind: "paragraph", content: { text: "보존 문장" }, style: {}, sourceRecordId: expired.id, syncState: "synced", locked: false, orderNo: 0 });
    await db.recordLinks.insertOne({ _id: randomUUID(), userId, fromRecordId: expired.id, toRecordId: future.id, relation: "related", createdBy: "user" });
    const runId = randomUUID();
    await db.scheduledJobRuns.insertOne({ _id: runId, jobKey: "retention", scheduledFor: at, status: "queued", attempts: 0, createdAt: at });

    await new MongoSchedulingService(fixture.resource).process(runId, at);

    expect(await db.careerRecords.findOne({ _id: expired.id })).toBeNull();
    expect(await db.careerRecords.findOne({ _id: future.id })).not.toBeNull();
    expect(await db.careerRecords.findOne({ _id: active.id })).not.toBeNull();
    expect(await db.blocks.findOne({ _id: blockId })).toMatchObject({ sourceRecordId: null, syncState: "detached" });
    expect(await db.recordLinks.countDocuments({ userId, $or: [{ fromRecordId: expired.id }, { toRecordId: expired.id }] })).toBe(0);
  }, 30_000);

  it("fails retention and rolls back a purge while the record is still quoted", async () => {
    const identity = new MongoIdentityService(fixture.resource);
    const career = new MongoCareerService(fixture.resource);
    const userId = (await identity.signup({ email: `retention-guard-${randomUUID()}@example.com`, password: "correct-horse-battery", displayName: "인용" })).user.id;
    const categoryId = (await career.listCategories(userId)).find(({ key }) => key === "experience")!.id;
    const record = (await career.createRecord(userId, randomUUID(), { categoryId, title: "인용 중", properties: {}, bodyMd: "" })).record;
    const db = mongoCollections(fixture.resource.db);
    const at = new Date("2026-09-20T00:00:00Z"); const blockId = randomUUID();
    await db.careerRecords.updateOne({ _id: record.id }, { $set: { deletedAt: new Date("2026-08-01T00:00:00Z"), purgeAfter: at } });
    await db.recordUsages.insertOne({ _id: randomUUID(), userId, recordId: record.id, blockId, quotedText: "인용", firstUsedAt: at });
    const beforePurge = await db.careerRecords.findOne({ _id: record.id });
    const runId = randomUUID();
    await db.scheduledJobRuns.insertOne({ _id: runId, jobKey: "retention", scheduledFor: at, status: "queued", attempts: 0, createdAt: at });

    await expect(new MongoSchedulingService(fixture.resource).process(runId, at)).rejects.toMatchObject({ statusCode: 409 });

    expect((await db.careerRecords.findOne({ _id: record.id }))?.referenceVersion).toBe(beforePurge?.referenceVersion);
    await expect(new MongoSchedulingService(fixture.resource).getRun(runId)).resolves.toMatchObject({ status: "failed", attempts: 1 });
  }, 30_000);
});
