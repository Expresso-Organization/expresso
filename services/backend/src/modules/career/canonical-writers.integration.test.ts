import { randomUUID } from "node:crypto";
import { mongoCollections, type CareerPropertyValueDoc } from "@expresso/database";
import { Decimal128 } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoIdentityService } from "../identity/index.js";
import { CareerService } from "./service.js";
import { MongoCareerPropertyMutationService } from "./property-mutation.js";

describe.skipIf(!(process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL))("canonical property writers", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let service: CareerService;
  let userId: string;
  beforeAll(async () => {
    fixture = await createMongoFixture("writers", { migrationTargetVersion: "0011" });
    service = new CareerService(fixture.resource);
    userId = (await new MongoIdentityService(fixture.resource).signup({ email: randomUUID() + "@example.com", password: "correct-horse-battery", displayName: "회귀" })).user.id;
  }, 60_000);
  afterAll(async () => { await fixture?.dispose(); });

  async function setup(options: { empty?: boolean; legacy?: boolean; missing?: boolean } = {}) {
    const target = randomUUID(), precise = randomUUID(), tail = randomUUID();
    const category = await service.createCategory(userId, { key: "writer_" + randomUUID().replaceAll("-", ""), name: "회귀", icon: "folder", defaultView: "table", propertySchema: {
      target: { id: target, label: "대상", type: "text", required: false, system: false },
      precise: { id: precise, label: "정밀", type: "number", required: false, system: false },
      tail: { id: tail, label: "뒤", type: "text", required: false, system: false },
    } });
    const record = (await service.createRecord(userId, randomUUID(), { categoryId: category.id, title: "회귀", properties: {}, bodyMd: "" })).record;
    const preserved: CareerPropertyValueDoc[] = [
      { propertyDefinitionId: precise, type: "number", value: Decimal128.fromString("12345678901234567890.123400") },
      { propertyDefinitionId: tail, type: "text", value: "canonical tail" },
    ];
    const values: CareerPropertyValueDoc[] = options.empty ? [] : [preserved[0]!, ...(options.missing ? [] : [{ propertyDefinitionId: target, type: "text" as const, value: "42" }]), preserved[1]!];
    const db = mongoCollections(fixture.resource.db);
    await db.careerRecords.updateOne({ _id: record.id }, {
      $set: { properties: options.legacy ? { target: "42", tail: "legacy tail" } : { target: "stale", tail: "stale tail" }, ...(options.legacy ? {} : { propertyValues: values }) },
      ...(options.legacy ? { $unset: { propertyValues: "" as const } } : {}),
    });
    const read = () => db.careerRecords.findOne({ _id: record.id });
    const definition = async (type: "text" | "number", deleted = false) => {
      const row = (await db.careerCategories.findOne({ _id: category.id }))!;
      await db.careerCategories.updateOne({ _id: category.id }, { $set: { propertyDefinitions: row.propertyDefinitions!.map(d => d.id === target ? { ...d, type, deletedAt: deleted ? new Date().toISOString() : null } : d) } });
    };
    const worker = (topic: "career.property-default" | "career.property-conversion" | "career.property-deletion" | "career.property-restoration") => new MongoCareerPropertyMutationService(fixture.resource).run(topic, {
      userId, categoryId: category.id, propertyId: target, propertyKey: "target", definitionVersion: 1,
      sourceType: "text", targetType: "number", allowLossy: false, defaultValue: { type: "text", value: "default" },
    });
    return { db, category, record, target, preserved, values, read, definition, worker };
  }

  it.each(["default", "conversion", "deletion", "restoration"] as const)("worker %s preserves unrelated BSON values and order", async (kind) => {
    const f = await setup({ missing: kind === "default" || kind === "restoration" });
    if (kind === "conversion") await f.definition("number");
    if (kind === "deletion") await f.definition("text", true);
    if (kind === "restoration") await f.db.careerRecords.updateOne({ _id: f.record.id }, { $set: { ["propertyValueTombstones." + f.target]: { type: "text", value: "restored" } } });
    const before = await f.read();
    expect(await f.worker(("career.property-" + kind) as Parameters<typeof f.worker>[0])).toEqual({ processed: 1 });
    const after = (await f.read())!;
    const targetValue = { propertyDefinitionId: f.target, type: kind === "conversion" ? "number" : "text", value: kind === "conversion" ? 42 : kind === "default" ? "default" : "restored" };
    expect(after.propertyValues).toEqual(kind === "deletion" ? f.preserved : kind === "conversion" ? [f.preserved[0], targetValue, f.preserved[1]] : [...f.preserved, targetValue]);
    expect(after.referenceVersion).toBe(before!.referenceVersion);
    expect(after.version).toBe(2);
    if (kind === "deletion") expect(after.propertyValueTombstones?.[f.target]).toEqual(f.values[1]);
    if (kind === "restoration") expect(after.propertyValueTombstones?.[f.target]).toBeUndefined();
  });

  it("worker default respects canonical empty even with stale legacy target", async () => {
    const f = await setup({ empty: true });
    expect(await f.worker("career.property-default")).toEqual({ processed: 1 });
    expect((await f.read())!.propertyValues).toEqual([{ propertyDefinitionId: f.target, type: "text", value: "default" }]);
  });
  it.each(["conversion", "deletion"] as const)("worker %s ignores stale legacy when canonical is empty", async kind => {
    const f = await setup({ empty: true });
    await f.definition(kind === "conversion" ? "number" : "text", kind === "deletion");
    const before = await f.read();
    expect(await f.worker(("career.property-" + kind) as Parameters<typeof f.worker>[0])).toEqual({ processed: 0 });
    expect(await f.read()).toEqual(before);
  });
  it("worker keeps legacy-only conversion, delete and restore compatibility", async () => {
    const f = await setup({ legacy: true });
    await f.definition("number");
    expect(await f.worker("career.property-conversion")).toEqual({ processed: 1 });
    expect((await f.read())!.propertyValues).toContainEqual({ propertyDefinitionId: f.target, type: "number", value: 42 });
    await f.definition("number", true);
    await f.worker("career.property-deletion");
    await f.definition("number");
    await f.worker("career.property-restoration");
    expect((await f.read())!.propertyValues).toContainEqual({ propertyDefinitionId: f.target, type: "number", value: 42 });
  });
  it("legacy schema removal is rejected even for canonical-only values and preserves unrelated BSON", async () => {
    const f = await setup();
    await f.db.careerRecords.updateOne({ _id: f.record.id }, { $unset: { "properties.target": "" } });
    const before = await f.read();
    const schema = { ...f.category.propertySchema }; delete schema.target;
    await expect(service.updatePropertySchema(userId, f.category.id, 1, schema, false)).rejects.toMatchObject({ statusCode: 409 });
    expect(await f.read()).toEqual(before);
    await expect(service.updatePropertySchema(userId, f.category.id, 1, schema, true)).rejects.toMatchObject({ statusCode: 409 });
    expect(await f.read()).toEqual(before);
    await expect(service.getRecord(userId, f.record.id)).resolves.toMatchObject({ id: f.record.id });
  });
  it.each(["type-change", "delete"] as const)("schema %s previews and mutates canonical-only candidates", async kind => {
    const f = await setup();
    await f.db.careerRecords.updateOne({ _id: f.record.id }, { $unset: { "properties.target": "" } });
    const change = kind === "type-change" ? { kind, propertyId: f.target, type: "number" as const } : { kind, propertyId: f.target };
    const preview = await service.previewChange(userId, f.category.id, change);
    expect(preview.impact.affectedRecordCount).toBe(1);
    expect(preview.impact.convertibleCount).toBe(1);
    await service.applyChange(userId, f.category.id, 1, randomUUID(), { change, previewToken: preview.previewToken, confirmLossy: true });
    expect((await f.read())!.propertyValues).toEqual(kind === "delete" ? f.preserved : [f.preserved[0], { propertyDefinitionId: f.target, type: "number", value: 42 }, f.preserved[1]]);
    await expect(service.getRecord(userId, f.record.id)).resolves.toMatchObject({ id: f.record.id });
    if (kind === "delete") {
      const restore = { kind: "restore" as const, propertyId: f.target };
      const p = await service.previewChange(userId, f.category.id, restore);
      expect(p.impact.affectedRecordCount).toBe(1);
      await service.applyChange(userId, f.category.id, 2, randomUUID(), { change: restore, previewToken: p.previewToken, confirmLossy: false });
      expect((await f.read())!.propertyValues).toEqual([...f.preserved, f.values[1]]);
    }
  });
  it("inline default adds only the new property beside precise canonical values", async () => {
    const f = await setup();
    const id = randomUUID();
    const change = { kind: "create" as const, property: { id, key: "new_value", name: "새 값", type: "text" as const, required: false, system: false, config: { defaultValue: { type: "text", value: "new" } } } };
    const preview = await service.previewChange(userId, f.category.id, change);
    expect(preview.impact.affectedRecordCount).toBe(1);
    await service.applyChange(userId, f.category.id, 1, randomUUID(), { change, previewToken: preview.previewToken, confirmLossy: false });
    expect((await f.read())!.propertyValues).toEqual([...f.values, { propertyDefinitionId: id, type: "text", value: "new" }]);
  });
  it("failed inline conversion rolls back definition, records and outbox", async () => {
    const f = await setup();
    await f.db.careerRecords.updateOne({ _id: f.record.id }, { $set: { propertyValues: [...f.preserved, { propertyDefinitionId: f.target, type: "text", value: "invalid" }] } });
    const before = await f.read(), category = await f.db.careerCategories.findOne({ _id: f.category.id });
    const outbox = await f.db.outboxEvents.countDocuments({ userId });
    const change = { kind: "type-change" as const, propertyId: f.target, type: "number" as const };
    const preview = await service.previewChange(userId, f.category.id, change);
    await expect(service.applyChange(userId, f.category.id, 1, randomUUID(), { change, previewToken: preview.previewToken, confirmLossy: true })).rejects.toMatchObject({ statusCode: 409 });
    expect(await f.read()).toEqual(before);
    expect(await f.db.careerCategories.findOne({ _id: f.category.id })).toEqual(category);
    expect(await f.db.outboxEvents.countDocuments({ userId })).toBe(outbox);
  });
  it.each(["worker", "inline"] as const)("%s round-trips a Decimal128 tombstone without changing other values", async mode => {
    const f = await setup();
    await f.definition("number");
    const number: CareerPropertyValueDoc = { propertyDefinitionId: f.target, type: "number", value: Decimal128.fromString("98765432109876543210.123400") };
    await f.db.careerRecords.updateOne({ _id: f.record.id }, { $set: { propertyValues: [...f.preserved, number] } });
    if (mode === "worker") {
      await f.definition("number", true);
      await f.worker("career.property-deletion");
      expect((await f.read())!.propertyValueTombstones?.[f.target]).toEqual(number);
      await f.definition("number");
      await f.worker("career.property-restoration");
    } else {
      for (const [version, kind] of [[1, "delete"], [2, "restore"]] as const) {
        const change = { kind, propertyId: f.target };
        const preview = await service.previewChange(userId, f.category.id, change);
        expect(preview.impact.affectedRecordCount).toBe(1);
        await service.applyChange(userId, f.category.id, version, randomUUID(), { change, previewToken: preview.previewToken, confirmLossy: true });
      }
    }
    expect((await f.read())!.propertyValues).toEqual([...f.preserved, number]);
    expect((await f.read())!.propertyValueTombstones?.[f.target]).toBeUndefined();
  });
  it("deferred conversion visits 101 canonical-only rows and replays without mutations", async () => {
    const f = await setup();
    await f.db.careerRecords.updateOne({ _id: f.record.id }, { $unset: { "properties.target": "" } });
    const template = (await f.read())!;
    await f.db.careerRecords.insertMany(Array.from({ length: 100 }, () => ({ ...template, _id: randomUUID(), createIdempotencyKey: randomUUID() })));
    const change = { kind: "type-change" as const, propertyId: f.target, type: "number" as const };
    const preview = await service.previewChange(userId, f.category.id, change);
    expect(preview.impact.affectedRecordCount).toBe(101);
    await service.applyChange(userId, f.category.id, 1, randomUUID(), { change, previewToken: preview.previewToken, confirmLossy: false });
    const event = (await f.db.outboxEvents.findOne({ topic: "career.property-conversion", "payload.categoryId": f.category.id }))!;
    const worker = new MongoCareerPropertyMutationService(fixture.resource);
    expect(await worker.run("career.property-conversion", event.payload)).toEqual({ processed: 101 });
    const rows = await f.db.careerRecords.find({ categoryId: f.category.id }).sort({ _id: 1 }).toArray();
    for (const row of rows) expect(row.propertyValues).toEqual([f.preserved[0], { propertyDefinitionId: f.target, type: "number", value: 42 }, f.preserved[1]]);
    expect(await worker.run("career.property-conversion", event.payload)).toEqual({ processed: 0 });
    expect(await f.db.careerRecords.find({ categoryId: f.category.id }).sort({ _id: 1 }).toArray()).toEqual(rows);
  });
  it("worker conversion failure keeps every row and outbox unchanged", async () => {
    const f = await setup();
    const before = (await f.read())!;
    await f.db.careerRecords.insertOne({ ...before, _id: randomUUID(), createIdempotencyKey: randomUUID(), propertyValues: [...f.preserved, { propertyDefinitionId: f.target, type: "text", value: "invalid" }] });
    await f.definition("number");
    const rows = await f.db.careerRecords.find({ categoryId: f.category.id }).sort({ _id: 1 }).toArray();
    const outbox = await f.db.outboxEvents.countDocuments({ userId });
    await expect(f.worker("career.property-conversion")).rejects.toMatchObject({ statusCode: 409 });
    expect(await f.db.careerRecords.find({ categoryId: f.category.id }).sort({ _id: 1 }).toArray()).toEqual(rows);
    expect(await f.db.outboxEvents.countDocuments({ userId })).toBe(outbox);
  });
  it("inline legacy-only conversion remains compatible while legacy schema removal is rejected", async () => {
    const f = await setup({ legacy: true });
    const change = { kind: "type-change" as const, propertyId: f.target, type: "number" as const };
    const preview = await service.previewChange(userId, f.category.id, change);
    expect(preview.impact.affectedRecordCount).toBe(1);
    await service.applyChange(userId, f.category.id, 1, randomUUID(), { change, previewToken: preview.previewToken, confirmLossy: false });
    expect((await f.read())!.propertyValues).toContainEqual({ propertyDefinitionId: f.target, type: "number", value: 42 });
    const other = await setup({ legacy: true });
    const schema = { ...other.category.propertySchema }; delete schema.target;
    const beforeRemoval = await other.read();
    await expect(service.updatePropertySchema(userId, other.category.id, 1, schema, true)).rejects.toMatchObject({ statusCode: 409 });
    expect(await other.read()).toEqual(beforeRemoval);
  });
});
