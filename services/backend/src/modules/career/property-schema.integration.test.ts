import { randomUUID } from "node:crypto";

import { mongoCollections } from "@expresso/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoIdentityService } from "../identity/index.js";
import { CareerService } from "./service.js";

describe.skipIf(!(process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL))("career property schema Mongo transaction behavior", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let service: CareerService;
  let userId: string;
  let otherUserId: string;
  let categoryId: string;
  let propertyId: string;
  let formulaId: string;
  let recordIds: string[];

  beforeAll(async () => {
    fixture = await createMongoFixture("propertyschema");
    service = new CareerService(fixture.resource);
    const identity = new MongoIdentityService(fixture.resource);
    userId = (await identity.signup({ email: `schema-${randomUUID()}@example.com`, password: "correct-horse-battery", displayName: "스키마" })).user.id;
    otherUserId = (await identity.signup({ email: `schema-${randomUUID()}@example.com`, password: "correct-horse-battery", displayName: "다른 사용자" })).user.id;
    propertyId = randomUUID();
    formulaId = randomUUID();
    const category = await service.createCategory(userId, {
      key: `schema_${randomUUID().replaceAll("-", "")}`, name: "스키마", icon: "folder", defaultView: "table",
      propertySchema: { score: { id: propertyId, label: "점수", type: "text", required: false, system: false } },
    });
    categoryId = category.id;
    const db = mongoCollections(fixture.resource.db);
    await db.careerCategories.updateOne({ _id: categoryId }, { $set: { schemaVersion: 1, propertySchemaV2: [
      { id: propertyId, key: "score", name: "점수", type: "text", required: false, system: false, config: {}, order: 0, version: 1, deletedAt: null },
      { id: formulaId, key: "formula", name: "수식", type: "formula", required: false, system: false, config: { source: `prop("${propertyId}")`, ast: { expression: { propertyId } }, diagnostics: [] }, order: 1, version: 1, deletedAt: null },
      { id: randomUUID(), key: "rollup", name: "롤업", type: "rollup", required: false, system: false, config: { targetPropertyId: propertyId }, order: 2, version: 1, deletedAt: null },
    ] } });
    const first = await service.createRecord(userId, randomUUID(), { categoryId, title: "첫째", properties: { score: "42" }, bodyMd: "" });
    const second = await service.createRecord(userId, randomUUID(), { categoryId, title: "둘째", properties: { score: "7" }, bodyMd: "" });
    recordIds = [first.record.id, second.record.id];
    await db.careerViews.insertOne({ _id: randomUUID(), userId, categoryId, name: "점수 보기", viewType: "table", filters: [], sorts: [], visibleProperties: [propertyId], sortOrder: 0, createdAt: new Date() });
  }, 60_000);

  afterAll(async () => { await fixture?.dispose(); });

  it("previews dependencies, applies a bounded conversion, and replays idempotently", async () => {
    const change = { kind: "type-change" as const, propertyId, type: "number" as const };
    const preview = await service.previewChange(userId, categoryId, change);
    expect(preview.impact).toMatchObject({ affectedRecordCount: 2, convertibleCount: 2 });
    expect(preview.impact.dependentViews).toHaveLength(1);
    expect(preview.impact.dependentFormulas).toHaveLength(1);
    expect(preview.impact.dependentRollups).toHaveLength(1);
    const key = "schema.key.with.dots";
    const input = { change, previewToken: preview.previewToken, confirmLossy: false };
    const applied = await service.applyChange(userId, categoryId, 1, key, input);
    expect(applied).toMatchObject({ version: 2, schemaVersion: 2 });
    expect(applied.propertySchemaV2?.find((item) => item.id === propertyId)?.type).toBe("number");
    expect(await service.applyChange(userId, categoryId, 1, key, input)).toEqual(applied);
    const rows = await mongoCollections(fixture.resource.db).careerRecords.find({ _id: { $in: recordIds } }).toArray();
    expect(rows.map((row) => row.properties.score)).toEqual(expect.arrayContaining([{ type: "number", value: 7 }, { type: "number", value: 42 }]));
    await expect(service.applyChange(userId, categoryId, 1, "another-key", input)).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.previewChange(otherUserId, categoryId, change)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("previews and atomically updates a validated computed configuration", async () => {
    const config = { source: `prop("${propertyId}") + 1`, ast: null, diagnostics: [] };
    const change = { kind: "configure" as const, propertyId: formulaId, config };
    const preview = await service.previewChange(userId, categoryId, change);
    expect(preview.impact.affectedRecordCount).toBe(2);
    const applied = await service.applyChange(userId, categoryId, 2, randomUUID(), { change, previewToken: preview.previewToken, confirmLossy: false });
    expect(applied.version).toBe(3);
    expect(applied.propertySchemaV2?.find((item) => item.id === formulaId)?.config).toEqual(config);
    expect(await mongoCollections(fixture.resource.db).outboxEvents.countDocuments({ topic: "career.computation", "payload.changedPropertyIds": formulaId, "payload.sourcePropertyVersions": { [formulaId]: 2 } })).toBe(2);
    const invalid = { kind: "configure" as const, propertyId: formulaId, config: { source: "1 + true", ast: null, diagnostics: [{ code: "invalid_operator", message: "오류", severity: "error", start: 0, end: 8 }] } };
    const invalidPreview = await service.previewChange(userId, categoryId, invalid);
    await expect(service.applyChange(userId, categoryId, 3, randomUUID(), { change: invalid, previewToken: invalidPreview.previewToken, confirmLossy: false })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("tombstones values on delete and restores the same property ID and values", async () => {
    const deletion = { kind: "delete" as const, propertyId };
    const preview = await service.previewChange(userId, categoryId, deletion);
    await expect(service.applyChange(userId, categoryId, 3, randomUUID(), { change: deletion, previewToken: preview.previewToken, confirmLossy: false })).rejects.toMatchObject({ statusCode: 409 });
    const deleted = await service.applyChange(userId, categoryId, 3, randomUUID(), { change: deletion, previewToken: preview.previewToken, confirmLossy: true });
    expect(deleted).toMatchObject({ version: 4, schemaVersion: 4 });
    const afterDelete = await mongoCollections(fixture.resource.db).careerRecords.findOne({ _id: recordIds[0]! });
    expect(afterDelete?.properties.score).toBeUndefined();
    expect(afterDelete?.propertyValueTombstones?.[propertyId]).toBeDefined();
    const restoration = { kind: "restore" as const, propertyId };
    const restorePreview = await service.previewChange(userId, categoryId, restoration);
    const restored = await service.applyChange(userId, categoryId, 4, randomUUID(), { change: restoration, previewToken: restorePreview.previewToken, confirmLossy: false });
    expect(restored).toMatchObject({ version: 5, schemaVersion: 5 });
    const rows = await mongoCollections(fixture.resource.db).careerRecords.find({ _id: { $in: recordIds } }).toArray();
    expect(rows.map((row) => row.properties.score)).toEqual(expect.arrayContaining([{ type: "number", value: 7 }, { type: "number", value: 42 }]));
    expect(rows.every((row) => row.propertyValueTombstones?.[propertyId] === undefined)).toBe(true);
  });
});
