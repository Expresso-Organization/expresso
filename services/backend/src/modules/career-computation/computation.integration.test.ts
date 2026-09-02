import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";

import { mongoCollections } from "@expresso/database";
import type { CareerPropertyDefinitionV2 } from "@expresso/contracts";
import { Queue, QueueEvents } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongoFixture } from "../../../test/support/mongodb.js";
import { createQueueWorker } from "../../worker/create-queue-worker.js";
import { createCareerComputationProcessor } from "../../worker/processors/career-computation.js";
import { MongoIdentityService } from "../identity/index.js";
import { CareerService } from "../career/service.js";
import { MongoCareerComputationService } from "./service.js";

const definition = (id: string, key: string, type: CareerPropertyDefinitionV2["type"], config: Record<string, unknown> = {}, order = 0): CareerPropertyDefinitionV2 => ({ id, key, name: key, type, required: false, system: false, config, order, version: 1, deletedAt: null });
const legacy = (label: string, type: "number" | "text") => ({ label, type, required: false, system: false });

describe.skipIf(!(process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL))("career computation MongoDB and BullMQ", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let career: CareerService;
  let service: MongoCareerComputationService;
  let userId: string;
  let sourceCategoryId: string;
  let targetCategoryId: string;
  let scoreId: string;
  let targetScoreId: string;
  let relationId: string;
  let formulaId: string;
  let rollupId: string;
  let sourceRecordId: string;
  let targetRecordIds: string[];

  beforeAll(async () => {
    fixture = await createMongoFixture("careercompute");
    career = new CareerService(fixture.resource); service = new MongoCareerComputationService(fixture.resource);
    const identity = new MongoIdentityService(fixture.resource);
    userId = (await identity.signup({ email: `compute-${randomUUID()}@example.com`, password: "correct-horse-battery", displayName: "계산" })).user.id;
    const source = await career.createCategory(userId, { key: `compute_source_${randomUUID().replaceAll("-", "")}`, name: "계산 원본", icon: "folder", defaultView: "table", propertySchema: { score: legacy("score", "number") } });
    const target = await career.createCategory(userId, { key: `compute_target_${randomUUID().replaceAll("-", "")}`, name: "계산 대상", icon: "folder", defaultView: "table", propertySchema: { score: legacy("score", "number") } });
    sourceCategoryId = source.id; targetCategoryId = target.id;
    scoreId = randomUUID(); targetScoreId = randomUUID(); relationId = randomUUID(); formulaId = randomUUID(); rollupId = randomUUID();
    const db = mongoCollections(fixture.resource.db);
    await db.careerCategories.updateOne({ _id: sourceCategoryId }, { $set: { schemaVersion: 1, propertySchemaV2: [
      definition(scoreId, "score", "number", {}, 0),
      definition(relationId, "targets", "relation", { targetCategoryId, inversePropertyId: null, cardinality: "multiple", deletePolicy: "restrict" }, 1),
      definition(formulaId, "doubleScore", "formula", { source: `prop("${scoreId}") * 2` }, 2),
      definition(rollupId, "targetTotal", "rollup", { relationPropertyId: relationId, targetPropertyId: targetScoreId, aggregation: "sum" }, 3),
    ] } });
    await db.careerCategories.updateOne({ _id: targetCategoryId }, { $set: { schemaVersion: 1, propertySchemaV2: [definition(targetScoreId, "score", "number")] } });
    const sourceRecord = await career.createRecord(userId, randomUUID(), { categoryId: sourceCategoryId, title: "원본", properties: { score: { type: "number", value: 3 } }, bodyMd: "" });
    sourceRecordId = sourceRecord.record.id;
    targetRecordIds = await Promise.all([2, 5].map(async (score) => (await career.createRecord(userId, randomUUID(), { categoryId: targetCategoryId, title: `대상 ${score}`, properties: { score: { type: "number", value: score } }, bodyMd: "" })).record.id));
    await db.careerRecordRelations.insertMany(targetRecordIds.map((targetRecordId) => ({ _id: randomUUID(), userId, sourceRecordId, sourcePropertyId: relationId, targetRecordId, inversePropertyId: null, cardinality: "multiple" as const, deletePolicy: "restrict" as const, createdBy: "user" as const, createdAt: new Date(), updatedAt: new Date() })));
  }, 60_000);
  afterAll(async () => { await fixture?.dispose(); });

  it("orders formula before projection, computes rollups, deduplicates retry, rejects stale input and fans out relation targets", async () => {
    expect((await service.previewRollup(userId, { categoryId: sourceCategoryId, recordId: sourceRecordId, relationPropertyId: relationId, targetPropertyId: targetScoreId, aggregation: "sum" })).value).toMatchObject({ type: "rollup", value: 7 });
    expect((await service.previewRollup(userId, { categoryId: sourceCategoryId, relationPropertyId: relationId, targetPropertyId: targetScoreId, aggregation: "percent_checked" })).diagnostics.map((diagnostic) => diagnostic.code)).toContain("argument_type");
    expect((await service.previewFormula(userId, { categoryId: sourceCategoryId, propertyId: formulaId, source: `prop("${formulaId}") + 1` })).diagnostics.map((diagnostic) => diagnostic.code)).toContain("cycle");
    expect(await service.recompute({ eventId: "compute-1", userId, recordId: sourceRecordId, changedPropertyIds: [scoreId, relationId], sourceRecordVersion: 1 })).toBe("applied");
    let source = await mongoCollections(fixture.resource.db).careerRecords.findOne({ _id: sourceRecordId });
    expect(source?.version).toBe(2);
    expect(source?.computedProperties).toMatchObject({ doubleScore: { type: "formula", value: 6 }, targetTotal: { type: "rollup", value: 7 } });
    expect(await service.recompute({ eventId: "compute-1", userId, recordId: sourceRecordId, changedPropertyIds: [scoreId], sourceRecordVersion: 1 })).toBe("duplicate");
    expect(await service.recompute({ eventId: "compute-stale", userId, recordId: sourceRecordId, changedPropertyIds: [scoreId], sourceRecordVersion: 1 })).toBe("stale");
    expect(await service.recompute({ eventId: "compute-stale-coalesced", userId, recordId: sourceRecordId, changedPropertyIds: [relationId], sourceRecordVersion: 1 })).toBe("stale");
    const fresh = await mongoCollections(fixture.resource.db).outboxEvents.find({ topic: "career.computation", "payload.recordId": sourceRecordId, "payload.sourceRecordVersion": 2 }).toArray();
    expect(fresh).toHaveLength(1);
    expect(fresh[0]?.payload.changedPropertyIds).toEqual(expect.arrayContaining([scoreId, relationId]));

    const target = await mongoCollections(fixture.resource.db).careerRecords.findOne({ _id: targetRecordIds[0]! });
    await service.recompute({ eventId: "target-change", userId, recordId: targetRecordIds[0]!, changedPropertyIds: [targetScoreId], sourceRecordVersion: target!.version });
    expect(await mongoCollections(fixture.resource.db).outboxEvents.countDocuments({ topic: "career.computation", idempotencyKey: /career-computation-fanout/ })).toBeGreaterThan(0);
    source = await mongoCollections(fixture.resource.db).careerRecords.findOne({ _id: sourceRecordId });
    expect(source?.version).toBe(2);

    await mongoCollections(fixture.resource.db).careerCategories.updateOne({ _id: sourceCategoryId, "propertySchemaV2.id": formulaId }, { $inc: { "propertySchemaV2.$.version": 1 } });
    expect(await service.recompute({ eventId: "property-version-stale", userId, recordId: sourceRecordId, changedPropertyIds: [formulaId], sourceRecordVersion: source!.version, sourcePropertyVersions: { [formulaId]: 1 } })).toBe("stale");
    expect((await mongoCollections(fixture.resource.db).outboxEvents.findOne({ topic: "career.computation", "payload.recordId": sourceRecordId, "payload.sourceRecordVersion": source!.version }))?.payload.sourcePropertyVersions).toEqual({ [formulaId]: 2 });
  });

  it("writes cycle and deleted-dependency diagnostics without more than one version increment", async () => {
    const cycleA = randomUUID(); const cycleB = randomUUID();
    const db = mongoCollections(fixture.resource.db);
    await db.careerCategories.updateOne({ _id: sourceCategoryId }, { $push: { propertySchemaV2: {
      $each: [definition(cycleA, "cycleA", "formula", { source: `prop("${cycleB}") + 1` }, 4), definition(cycleB, "cycleB", "formula", { source: `prop("${cycleA}") + 1` }, 5)],
    } } });
    const source = await db.careerRecords.findOne({ _id: sourceRecordId });
    const result = await service.recompute({ eventId: "cycle", userId, recordId: sourceRecordId, changedPropertyIds: [cycleA], sourceRecordVersion: source!.version });
    expect(result).toBe("applied");
    const after = await db.careerRecords.findOne({ _id: sourceRecordId });
    expect(after?.version).toBe(source!.version + 1);
    expect(after?.computedProperties?.cycleA).toMatchObject({ diagnostics: [{ code: "cycle" }] });

    await db.careerCategories.updateOne({ _id: sourceCategoryId, "propertySchemaV2.id": scoreId }, { $set: { "propertySchemaV2.$.deletedAt": new Date().toISOString() } });
    const prior = await db.careerRecords.findOne({ _id: sourceRecordId });
    await service.recompute({ eventId: "deleted", userId, recordId: sourceRecordId, changedPropertyIds: [scoreId], sourceRecordVersion: prior!.version });
    const deleted = await db.careerRecords.findOne({ _id: sourceRecordId });
    expect(deleted?.version).toBe(prior!.version + 1);
    expect(deleted?.computedProperties?.doubleScore).toMatchObject({ diagnostics: [{ code: "unknown_property" }] });
  });

  it("enqueues stable property IDs and versions when a user edits an input value", async () => {
    await mongoCollections(fixture.resource.db).careerCategories.updateOne({ _id: sourceCategoryId, "propertySchemaV2.id": scoreId }, { $set: { "propertySchemaV2.$.deletedAt": null } });
    const created = (await career.createRecord(userId, randomUUID(), { categoryId: sourceCategoryId, title: "입력 변경", properties: { score: { type: "number", value: 1 } }, bodyMd: "" })).record;
    const updated = await career.updateRecord(userId, created.id, created.version, { properties: { score: { type: "number", value: 4 } } });
    const event = await mongoCollections(fixture.resource.db).outboxEvents.findOne({ topic: "career.computation", "payload.recordId": created.id, "payload.sourceRecordVersion": updated.version });
    expect(event?.payload).toMatchObject({ changedPropertyIds: [scoreId], sourcePropertyVersions: { [scoreId]: 1 } });
    expect(await service.recompute({ eventId: "record-edit", userId, recordId: created.id, changedPropertyIds: [scoreId], sourceRecordVersion: updated.version })).toBe("applied");
    expect((await mongoCollections(fixture.resource.db).careerRecords.findOne({ _id: created.id }))?.computedProperties?.doubleScore).toMatchObject({ value: 8 });
  });

  it.skipIf(!process.env.TEST_REDIS_URL)("processes 100 related records through BullMQ within the local 1s p95 budget", async () => {
    const db = mongoCollections(fixture.resource.db);
    await db.careerCategories.updateOne({ _id: sourceCategoryId, "propertySchemaV2.id": scoreId }, { $set: { "propertySchemaV2.$.deletedAt": null } });
    const source = (await career.createRecord(userId, randomUUID(), { categoryId: sourceCategoryId, title: "성능", properties: { score: { type: "number", value: 1 } }, bodyMd: "" })).record;
    const targets = await Promise.all(Array.from({ length: 100 }, (_, index) => career.createRecord(userId, randomUUID(), { categoryId: targetCategoryId, title: `성능 ${index}`, properties: { score: { type: "number", value: index + 1 } }, bodyMd: "" })));
    await db.careerRecordRelations.insertMany(targets.map(({ record }) => ({ _id: randomUUID(), userId, sourceRecordId: source.id, sourcePropertyId: relationId, targetRecordId: record.id, inversePropertyId: null, cardinality: "multiple" as const, deletePolicy: "restrict" as const, createdBy: "user" as const, createdAt: new Date(), updatedAt: new Date() })));
    const queueName = `career-compute-${randomUUID()}`; const prefix = `expresso-test-${randomUUID()}`; const redisUrl = process.env.TEST_REDIS_URL!;
    const queue = new Queue<Record<string, unknown>>(queueName, { connection: { url: redisUrl }, prefix });
    const events = new QueueEvents(queueName, { connection: { url: redisUrl }, prefix });
    const worker = createQueueWorker({ queueName, redisUrl, prefix, processor: createCareerComputationProcessor(service) });
    const durations: number[] = [];
    try {
      for (let index = 0; index < 5; index += 1) {
        const current = await db.careerRecords.findOne({ _id: source.id });
        const started = performance.now();
        const job = await queue.add("career.computation", { userId, recordId: source.id, changedPropertyIds: [relationId], sourceRecordVersion: current!.version });
        await job.waitUntilFinished(events, 10_000);
        durations.push(performance.now() - started);
      }
    } finally { await Promise.all([worker.close(), events.close(), queue.close()]); }
    const sorted = [...durations].sort((left, right) => left - right);
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]!;
    expect(p95).toBeLessThanOrEqual(1_000);
  }, 60_000);
});
