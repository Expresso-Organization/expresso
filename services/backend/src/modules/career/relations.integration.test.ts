import { randomUUID } from "node:crypto";

import { mongoCollections } from "@expresso/database";
import type { CareerPropertyDefinitionV2, CareerPropertyValueV2 } from "@expresso/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoIdentityService } from "../identity/index.js";
import { CareerService } from "./service.js";

const value = (type: CareerPropertyDefinitionV2["type"], raw: unknown) => ({ type, value: raw } as CareerPropertyValueV2);
const definition = (id: string, key: string, type: CareerPropertyDefinitionV2["type"], config: Record<string, unknown> = {}): CareerPropertyDefinitionV2 => ({ id, key, name: key, type, required: false, system: false, config, order: 0, version: 1, deletedAt: null });
const legacy = (label: string, type: "text" | "number" | "tags") => ({ label, type, required: false, system: false });

describe.skipIf(!(process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL))("career relations and category moves in a replica set", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let service: CareerService;
  let userId: string;
  let otherUserId: string;
  let sourceCategoryId: string;
  let targetCategoryId: string;
  let relationId: string;
  let inverseRelationId: string;
  let singleRelationId: string;
  let sourceRecordId: string;
  let targetRecordIds: string[];
  let lostPropertyId: string;

  beforeAll(async () => {
    fixture = await createMongoFixture("careerrelations");
    service = new CareerService(fixture.resource);
    const identity = new MongoIdentityService(fixture.resource);
    userId = (await identity.signup({ email: `relations-${randomUUID()}@example.com`, password: "correct-horse-battery", displayName: "관계" })).user.id;
    otherUserId = (await identity.signup({ email: `relations-other-${randomUUID()}@example.com`, password: "correct-horse-battery", displayName: "다른 관계" })).user.id;
    const source = await service.createCategory(userId, { key: `source_${randomUUID().replaceAll("-", "")}`, name: "원본", icon: "folder", defaultView: "table", propertySchema: { exact: legacy("exact", "text"), numberText: legacy("numberText", "text"), tags: legacy("tags", "tags"), lost: legacy("lost", "text") } });
    const target = await service.createCategory(userId, { key: `target_${randomUUID().replaceAll("-", "")}`, name: "대상", icon: "folder", defaultView: "table", propertySchema: { exact: legacy("exact", "text"), numberText: legacy("numberText", "number"), tags: legacy("tags", "text") } });
    sourceCategoryId = source.id; targetCategoryId = target.id;
    relationId = randomUUID(); inverseRelationId = randomUUID(); singleRelationId = randomUUID(); lostPropertyId = randomUUID();
    const exactId = randomUUID(); const numberId = randomUUID(); const tagsId = randomUUID();
    const targetExactId = randomUUID(); const targetNumberId = randomUUID(); const targetTagsId = randomUUID();
    const db = mongoCollections(fixture.resource.db);
    await db.careerCategories.updateOne({ _id: sourceCategoryId }, { $set: { schemaVersion: 1, propertySchemaV2: [
      definition(exactId, "exact", "text"), definition(numberId, "numberText", "text"), definition(tagsId, "tags", "multi_select"), definition(lostPropertyId, "lost", "text"),
      definition(relationId, "related", "relation", { targetCategoryId, inversePropertyId: inverseRelationId, cardinality: "multiple", deletePolicy: "restrict" }),
      definition(singleRelationId, "singleRelated", "relation", { targetCategoryId, inversePropertyId: null, cardinality: "single", deletePolicy: "restrict" }),
    ] } });
    await db.careerCategories.updateOne({ _id: targetCategoryId }, { $set: { schemaVersion: 1, propertySchemaV2: [
      definition(targetExactId, "exact", "text"), definition(targetNumberId, "numberText", "number"), definition(targetTagsId, "tags", "select"),
      definition(inverseRelationId, "back", "relation", { targetCategoryId: sourceCategoryId, inversePropertyId: relationId, cardinality: "multiple", deletePolicy: "restrict" }),
    ] } });
    const optionA = randomUUID(); const optionB = randomUUID();
    const sourceRecord = await service.createRecord(userId, randomUUID(), { categoryId: sourceCategoryId, title: "본문 보존", properties: { exact: value("text", "같음"), numberText: value("text", "42"), tags: value("multi_select", [optionA, optionB]), lost: value("text", "남겨 둠") }, bodyMd: "# 본문은 이동해도 남는다" });
    sourceRecordId = sourceRecord.record.id;
    targetRecordIds = await Promise.all(["대상 A", "대상 B"].map(async (title) => (await service.createRecord(userId, randomUUID(), { categoryId: targetCategoryId, title, properties: {}, bodyMd: "" })).record.id));
  }, 60_000);

  afterAll(async () => { await fixture?.dispose(); });

  it("atomically replaces forward and inverse edges, rejects cardinality and stale/cross-user writes", async () => {
    const first = await service.replaceTargets(userId, sourceRecordId, relationId, [targetRecordIds[0]!, targetRecordIds[0]!, targetRecordIds[1]!], 1);
    expect(first.version).toBe(2);
    const db = mongoCollections(fixture.resource.db);
    expect(await db.careerRecordRelations.countDocuments({ userId, sourceRecordId, sourcePropertyId: relationId })).toBe(2);
    expect(await db.careerRecordRelations.countDocuments({ userId, targetRecordId: sourceRecordId, sourcePropertyId: inverseRelationId })).toBe(2);
    expect(await service.listRelationTargets(userId, sourceRecordId, relationId)).toEqual(expect.arrayContaining([{ recordId: targetRecordIds[0]!, title: "대상 A" }, { recordId: targetRecordIds[1]!, title: "대상 B" }]));
    await expect(service.listRelationTargets(otherUserId, sourceRecordId, relationId)).rejects.toMatchObject({ statusCode: 404 });
    expect((await service.replaceTargets(userId, sourceRecordId, relationId, targetRecordIds, 2)).version).toBe(2);
    await expect(service.replaceTargets(userId, sourceRecordId, singleRelationId, targetRecordIds, 2)).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.replaceTargets(otherUserId, sourceRecordId, relationId, [], 2)).rejects.toMatchObject({ statusCode: 404 });
    const race = await Promise.allSettled([[targetRecordIds[0]!], [targetRecordIds[1]!]].map((ids) => service.replaceTargets(userId, sourceRecordId, relationId, ids, 2)));
    expect(race.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(race.filter((item) => item.status === "rejected")[0]).toMatchObject({ reason: { statusCode: 412 } });
  });

  it("keeps relation edges through soft-delete/restore but forbids a deleted target", async () => {
    const current = await service.getRecord(userId, sourceRecordId);
    await service.trashRecord(userId, targetRecordIds[0]!);
    await expect(service.replaceTargets(userId, sourceRecordId, relationId, [targetRecordIds[0]!], current.version)).rejects.toMatchObject({ statusCode: 404 });
    expect(await service.listRelationTargets(userId, sourceRecordId, relationId)).not.toContainEqual({ recordId: targetRecordIds[0]!, title: "대상 A" });
    await service.restoreRecord(userId, targetRecordIds[0]!);
    expect(await mongoCollections(fixture.resource.db).careerRecordRelations.countDocuments({ userId, sourceRecordId, sourcePropertyId: relationId })).toBeGreaterThan(0);
  });

  it("previews exact/safe/lossy/unmapped conversions and commits without touching body or relation ledger", async () => {
    const before = await service.getRecord(userId, sourceRecordId);
    const edgeCount = await mongoCollections(fixture.resource.db).careerRecordRelations.countDocuments({ userId, $or: [{ sourceRecordId }, { targetRecordId: sourceRecordId }] });
    const preview = await service.previewCategoryMove(userId, sourceRecordId, targetCategoryId);
    expect(preview.conversions.map((conversion) => conversion.kind)).toEqual(expect.arrayContaining(["exact", "safe", "lossy", "unmapped"]));
    const moved = await service.commitCategoryMove(userId, sourceRecordId, { recordId: sourceRecordId, targetCategoryId, previewToken: preview.previewToken, expectedVersion: before.version, discardUnmappedPropertyIds: [] });
    expect(moved).toMatchObject({ categoryId: targetCategoryId, bodyMd: "# 본문은 이동해도 남는다" });
    const stored = await mongoCollections(fixture.resource.db).careerRecords.findOne({ _id: sourceRecordId });
    expect(stored?.properties).toMatchObject({ exact: value("text", "같음"), numberText: value("number", 42), tags: value("select", expect.any(String)) });
    expect(stored?.unmappedProperties?.[lostPropertyId]).toEqual(value("text", "남겨 둠"));
    expect(await mongoCollections(fixture.resource.db).careerRecordRelations.countDocuments({ userId, $or: [{ sourceRecordId }, { targetRecordId: sourceRecordId }] })).toBe(edgeCount);
  });

  it("rejects a move token after target schema drift", async () => {
    const record = (await service.createRecord(userId, randomUUID(), { categoryId: sourceCategoryId, title: "드리프트", properties: { exact: value("text", "x") }, bodyMd: "본문" })).record;
    const preview = await service.previewCategoryMove(userId, record.id, targetCategoryId);
    await mongoCollections(fixture.resource.db).careerCategories.updateOne({ _id: targetCategoryId }, { $inc: { schemaVersion: 1, version: 1 } });
    await expect(service.commitCategoryMove(userId, record.id, { recordId: record.id, targetCategoryId, previewToken: preview.previewToken, expectedVersion: record.version, discardUnmappedPropertyIds: [] })).rejects.toMatchObject({ statusCode: 409 });
  });
});
