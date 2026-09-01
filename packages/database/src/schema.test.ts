import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, Decimal128, Binary } from "mongodb";
import { migrateMongo } from "./mongo-migrate.js";
import { mongoCollections } from "./collections.js";
const mongoUrl = process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL;
describe.skipIf(!mongoUrl)("MongoDB schema", () => {
  const databaseName = `expresso_test_schema_${randomUUID().replaceAll("-", "")}`;
  const client = new MongoClient(mongoUrl ?? "mongodb://127.0.0.1", { serverSelectionTimeoutMS: 3_000 });
  const mongo = client.db(databaseName);
  const collections = mongoCollections(mongo);
  beforeAll(async () => {
    await migrateMongo({ databaseUrl: mongoUrl!, databaseName });
  }, 60_000);
  afterAll(async () => { try { await mongo.dropDatabase(); } finally { await client.close(); } });

  it("creates every product collection and preserves the seeded IDs and all 30 additional designs", async () => {
    expect(await mongo.listCollections({}, { nameOnly: true }).toArray()).toHaveLength(82);
    expect(await collections.plans.countDocuments()).toBe(3);
    expect((await collections.plans.findOne({ code: "free" }))?._id).toBe("aa09f35f-bde6-4e18-b9cd-7b32759bf43b");
    expect(await collections.careerCategories.countDocuments({ isSystem: true })).toBe(7);
    expect(await collections.scheduledJobDefinitions.countDocuments()).toBe(8);
    expect(await collections.templates.countDocuments()).toBe(33);
    for (let i = 1; i <= 30; i++) {
      expect(await collections.templates.findOne({ _id: `d3510000-0000-4000-8000-${String(i).padStart(12, "0")}` })).not.toBeNull();
    }
  });

  it("reruns without replacing existing seed changes", async () => {
    await collections.plans.updateOne({ code: "free" }, { $set: { generationQuota: 17 } });
    const result = await migrateMongo({ databaseUrl: mongoUrl!, databaseName });
    expect(result.applied).toEqual([]);
    expect(result.existing).toEqual(["0001_initial_collections", "0002_generation_ledger_amount_constraint", "0003_analytics_rate_and_notification_preferences", "0004_job_import_metadata", "0005_job_source_ats_providers", "0006_career_record_editor", "0007_job_source_boards", "0008_career_view_configurations"]);
    expect((await collections.plans.findOne({ code: "free" }))?.generationQuota).toBe(17);
  });

  it("enforces required fields, enums and accent/case insensitive email uniqueness", async () => {
    const user = { _id: randomUUID(), email: "Café@example.com", displayName: "Tester", planId: "aa09f35f-bde6-4e18-b9cd-7b32759bf43b", createdAt: new Date() };
    await collections.users.insertOne(user);
    await expect(collections.users.insertOne({ ...user, _id: randomUUID(), email: "CAFE@example.com" })).rejects.toMatchObject({ code: 11000 });
    await expect(mongo.collection("plans").insertOne({ _id: randomUUID() as never, code: "invalid", generationQuota: 0, features: {}, isPublicListed: true })).rejects.toMatchObject({ code: 121 });
    await expect(mongo.collection("users").insertOne({ _id: randomUUID() as never })).rejects.toMatchObject({ code: 121 });
  });

  it("keeps generation usage ledger amounts as signed integers", async () => {
    const base = { userId: randomUUID(), generationJobId: randomUUID(), reason: "success", createdAt: new Date() };
    await collections.generationUsageLedger.insertOne({ _id: randomUUID(), ...base, amount: 1 });
    await collections.generationUsageLedger.insertOne({ _id: randomUUID(), ...base, generationJobId: randomUUID(), amount: -1 });
    await expect(mongo.collection("generation_usage_ledger").insertOne({ _id: randomUUID() as never, ...base, generationJobId: randomUUID(), amount: 2 })).rejects.toMatchObject({ code: 121 });
    await expect(mongo.collection("generation_usage_ledger").insertOne({ _id: randomUUID() as never, ...base, generationJobId: randomUUID(), amount: "1" })).rejects.toMatchObject({ code: 121 });
  });

  it("distinguishes missing, null and empty values in nullable composite uniqueness", async () => {
    const posting = { companyId: randomUUID(), source: "api" as const, title: "Role", descriptionRaw: "Details", requirements: {}, createdAt: new Date(), duties: [], preferred: [], hiringProcess: [] };
    const insert = (externalId?: string | null) => collections.jobPostings.insertOne({ ...posting, _id: randomUUID(), dedupeHash: randomUUID(), ...(externalId !== undefined ? { externalId } : {}) });
    await insert(); await insert(); await insert(null); await insert(null);
    await insert("");
    await expect(insert("")).rejects.toMatchObject({ code: 11000 });
    await insert("Case"); await insert("case");
  });

  it("enforces system category uniqueness independently of user category keys", async () => {
    const category = await collections.careerCategories.findOne({ key: "experience", isSystem: true });
    expect(category).not.toBeNull();
    await expect(collections.careerCategories.insertOne({ ...category!, _id: randomUUID() })).rejects.toMatchObject({ code: 11000 });
    const userId = randomUUID();
    await collections.careerCategories.insertOne({ ...category!, _id: randomUUID(), isSystem: false, userId });
    await collections.careerCategories.insertOne({ ...category!, _id: randomUUID(), isSystem: false, userId: randomUUID() });
    await expect(collections.careerCategories.insertOne({ ...category!, _id: randomUUID(), isSystem: false, userId })).rejects.toMatchObject({ code: 11000 });
  });

  it("round trips BSON Date and Decimal128 while retaining date-only strings", async () => {
    const metric = { _id: randomUUID(), userId: randomUUID(), deploymentId: randomUUID(), date: "2026-08-29", metricKey: "visit", value: Decimal128.fromString("0.123456"), sampleSize: 1 };
    await collections.metricsDaily.insertOne(metric);
    const loaded = await collections.metricsDaily.findOne({ _id: metric._id });
    expect(loaded?.date).toBe("2026-08-29");
    expect(loaded?.value.toString()).toBe("0.123456");
    const category = await collections.careerCategories.findOne({ key: "experience", isSystem: true });
    expect(category?.updatedAt).toBeInstanceOf(Date);
  });

  it("validates arbitrary record properties and only reserves ranks for selected sources", async () => {
    const record = { _id: randomUUID(), userId: randomUUID(), categoryId: "475106fc-bf88-4a73-9c27-66c648733936", title: "Work", status: "draft" as const, origin: "manual" as const, properties: { organization: "Team", metrics: ["25%"], years: 2 }, bodyMd: "# Work", version: 1, updatedAt: new Date() };
    await collections.careerRecords.insertOne(record);
    await expect(mongo.collection("career_records").updateOne({ _id: record._id as never }, { $set: { properties: [] } })).rejects.toMatchObject({ code: 121 });
    await expect(collections.careerRecords.updateOne({ _id: record._id }, { $set: { version: 0 } })).rejects.toMatchObject({ code: 121 });
    const source = { userId: record.userId, brewId: randomUUID(), rank: 1, selectedBy: "auto" as const, score: 50, reasonText: "Relevant", isSelected: false, excludedReason: "not_selected", updatedAt: new Date() };
    const first = { ...source, _id: randomUUID(), recordId: randomUUID() };
    const second = { ...source, _id: randomUUID(), recordId: randomUUID() };
    await collections.brewSources.insertMany([first, second]);
    await collections.brewSources.updateOne({ _id: first._id }, { $set: { isSelected: true, excludedReason: null } });
    await expect(collections.brewSources.updateOne({ _id: second._id }, { $set: { isSelected: true, excludedReason: null } })).rejects.toMatchObject({ code: 11000 });
    await collections.brewSources.updateOne({ _id: first._id }, { $set: { isSelected: false, excludedReason: "not_selected" } });
    expect(await collections.brewSources.countDocuments({ brewId: source.brewId, isSelected: true })).toBe(0);
  });

  it("creates the editor ledger with exact indexes and bounded, non-TTL history", async () => {
    const names = ["career_document_snapshots", "career_document_updates", "career_record_revisions", "career_record_relations", "career_ai_proposals"];
    const listed = await mongo.listCollections({ name: { $in: names } }, { nameOnly: false }).toArray();
    expect(listed).toHaveLength(5);
    const indexes = async (name: string) => (await mongo.collection(name).listIndexes().toArray()).map((entry) => ({ key: entry.key, unique: entry.unique, expireAfterSeconds: entry.expireAfterSeconds }));
    expect(await indexes("career_document_snapshots")).toContainEqual({ key: { recordId: 1, version: -1 }, unique: undefined, expireAfterSeconds: undefined });
    expect(await indexes("career_document_updates")).toContainEqual({ key: { recordId: 1, clientId: 1, clientSequence: 1 }, unique: true, expireAfterSeconds: undefined });
    expect(await indexes("career_document_updates")).toContainEqual({ key: { recordId: 1, serverSequence: 1 }, unique: undefined, expireAfterSeconds: undefined });
    expect(await indexes("career_record_relations")).toContainEqual({ key: { userId: 1, sourceRecordId: 1, sourcePropertyId: 1, targetRecordId: 1 }, unique: true, expireAfterSeconds: undefined });
    expect((await indexes("career_record_revisions")).every((entry) => entry.expireAfterSeconds === undefined)).toBe(true);
    expect(await indexes("career_ai_proposals")).toContainEqual({ key: { userId: 1, _id: 1 }, unique: true, expireAfterSeconds: undefined });
    expect(await indexes("career_ai_proposals")).toContainEqual({ key: { expiresAt: 1 }, unique: undefined, expireAfterSeconds: 0 });
    const update = { _id: randomUUID(), recordId: randomUUID(), userId: randomUUID(), clientId: "test", clientSequence: 1, serverSequence: 1, update: new Binary(Buffer.alloc(0)), byteLength: 1_048_577, updateHash: "a".repeat(64), actor: "user" as const, receivedAt: new Date(), compactedAt: null };
    await expect(collections.careerDocumentUpdates.insertOne(update)).rejects.toMatchObject({ code: 121 });
    const category = await collections.careerCategories.findOne({ key: "experience", isSystem: true });
    expect(category).not.toBeNull();
    const ids = Object.fromEntries(Object.entries(category!.propertySchema).map(([key, value]) => [key, value.id]));
    expect(Object.values(ids).every((value) => typeof value === "string")).toBe(true);
    await migrateMongo({ databaseUrl: mongoUrl!, databaseName });
    const rerunCategory = await collections.careerCategories.findOne({ _id: category!._id });
    expect(Object.fromEntries(Object.entries(rerunCategory!.propertySchema).map(([key, value]) => [key, value.id]))).toEqual(ids);
  });
});
