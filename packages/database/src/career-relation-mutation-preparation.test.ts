import { randomUUID } from "node:crypto";
import { MongoClient, type Document } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateMongo } from "./mongo-migrate.js";
import { loadMongoMigrations } from "./mongo-migrations.js";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const url = process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL;
it("registers the forward-only relation mutation storage preparation", async () => {
  const migration = (await loadMongoMigrations()).find(migration => migration.version === "0029");
  expect(migration?.name).toBe("career_relation_property_mutation_preparation");
});
describe.skipIf(!url)("relation generation backups on disposable Mongo", () => {
  const name = `ex_test_b2_relation_${randomUUID().replaceAll("-", "")}`;
  const client = new MongoClient(url ?? "mongodb://127.0.0.1", { serverSelectionTimeoutMS: 3_000 });
  const db = client.db(name), ledger = db.collection<Document & { _id: string }>("career_relation_property_tombstones");
  beforeAll(async () => { await client.connect(); await migrateMongo({ databaseUrl: url!, databaseName: name }); }, 60_000);
  afterAll(async () => { try { await db.dropDatabase(); } finally { await client.close(); } });
  const now = new Date("2026-10-09T00:00:00Z");
  const edge = { _id: id(101), userId: id(1), sourceRecordId: id(4), sourcePropertyId: id(3), targetRecordId: id(5), cardinality: "multiple", deletePolicy: "restrict", createdBy: "ai", createdAt: now, updatedAt: now };
  const backup = { _id: id(10), userId: id(1), categoryId: id(2), propertyId: id(3), recordId: id(4), deletionMutationId: id(6), definitionVersion: 2, deletedAt: now.toISOString(), categoryVersion: 2, schemaVersion: 2, config: { targetCategoryId: id(7), inversePropertyId: null, cardinality: "multiple", deletePolicy: "restrict" }, sourceRecordVersion: 2, forwardEdges: [edge], inverseEdges: [], inverseDefinitionBindings: [], inverseRecordVersions: { [id(5)]: 1 }, inverseRecordReferenceVersions: { [id(5)]: 0 }, createdAt: now };
  async function requireLedger() { expect(await db.listCollections({ name: ledger.collectionName }).next()).not.toBeNull(); }
  it("creates dedicated binary current-generation uniqueness and preserves exact raw edges", async () => {
    await requireLedger();
    expect(await ledger.listIndexes().toArray()).toContainEqual(expect.objectContaining({ name: "career_relation_tombstone_current_generation", key: { userId: 1, recordId: 1, propertyId: 1 }, unique: true }));
    await ledger.insertOne(backup);
    expect(await ledger.findOne({ _id: backup._id })).toEqual(backup);
    expect((await ledger.findOne({ _id: backup._id }))!.forwardEdges[0]).not.toHaveProperty("inversePropertyId");
    await expect(ledger.insertOne({ ...backup, _id: id(11), deletionMutationId: id(8) })).rejects.toMatchObject({ code: 11000 });
    await ledger.insertOne({ ...backup, _id: id(12), userId: id(9), forwardEdges: [{ ...edge, userId: id(9), inversePropertyId: null }] });
    expect((await ledger.findOne({ _id: id(12) }))!.forwardEdges[0].inversePropertyId).toBeNull();
  });
  it("rejects malformed provenance and foreign edge owners without option or business writes", async () => {
    await requireLedger();
    for (const invalid of [
      { ...backup, _id: id(13), recordId: id(13), sourceRecordVersion: 0 },
      { ...backup, _id: id(14), recordId: id(14), forwardEdges: [{ ...edge, userId: id(9) }] },
      { ...backup, _id: id(15), recordId: id(15), inverseRecordVersions: { invalid: 1 } },
      { ...backup, _id: id(17), recordId: id(17), inverseRecordReferenceVersions: { [id(5)]: -1 } },
      { ...backup, _id: id(16), recordId: id(16), inverseDefinitionBindings: [{ recordId: id(5), categoryId: id(7), categoryVersion: 1, schemaVersion: 1, definitionId: id(20), version: 0, config: {} }] },
    ]) await expect(ledger.insertOne(invalid)).rejects.toMatchObject({ code: 121 });
    expect(await ledger.countDocuments()).toBe(2);
    expect(await db.collection("career_records").countDocuments()).toBe(0);
    expect(await db.collection("career_record_relations").countDocuments()).toBe(0);
  });
  it("accepts an immutable restoration receipt journal and scalar receipts stay unchanged", async () => {
    await requireLedger();
    const receipt = { _id: id(30), userId: id(1), mutationId: id(31), recordId: id(4), operationFingerprint: "a".repeat(64), response: { _id: id(4), userId: id(1), categoryId: id(2), title: "record", status: "draft", propertyValues: [], version: 3, updatedAt: now }, changed: true, createdAt: now };
    const journal = { deletionMutationId: id(6), propertyId: id(3), forwardEdges: [edge], inverseEdges: [] };
    await db.collection<Document & { _id: string }>("career_property_mutation_receipts").insertOne({ ...receipt, relationRestoration: journal });
    expect(await db.collection<Document & { _id: string }>("career_property_mutation_receipts").findOne({ _id: id(30) } as never)).toEqual({ ...receipt, relationRestoration: journal });
    await expect(db.collection<Document & { _id: string }>("career_property_mutation_receipts").insertOne({ ...receipt, _id: id(32), mutationId: id(33), relationRestoration: { ...journal, forwardEdges: [{ ...edge, userId: id(9) }] } })).rejects.toMatchObject({ code: 121 });
    await db.collection<Document & { _id: string }>("career_property_mutation_receipts").insertOne({ ...receipt, _id: id(34), mutationId: id(35) });
    expect(await db.collection<Document & { _id: string }>("career_property_mutation_receipts").findOne({ _id: id(34) } as never)).toEqual({ ...receipt, _id: id(34), mutationId: id(35) });
  });
});