import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, type Db, type Document } from "mongodb";
import * as api from "./index.js";
import { migrateMongo } from "./mongo-migrate.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
interface OptionRow { _id: string; userId: string; categoryId: string; propertyId: string; optionId: string; rawLabel: string; version: number; createdAt: Date }
type Scope = { userId: string; categoryId: string; propertyId: string };
function register(db: Db, scope: Scope, label: string, input?: { optionId?: string; expectedVersion?: number }): Promise<OptionRow> {
  const fn = (api as unknown as { registerCareerPropertyOption?: typeof register }).registerCareerPropertyOption;
  expect(fn).toBeTypeOf("function"); return fn!(db, scope, label, input);
}
function read(db: Db, scope: Scope): Promise<OptionRow[]> {
  const fn = (api as unknown as { readCareerPropertyOptions?: typeof read }).readCareerPropertyOptions;
  expect(fn).toBeTypeOf("function"); return fn!(db, scope);
}
const url = process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL;
describe.skipIf(!url)("actor-scoped Career option ledger on disposable Mongo", () => {
  const name = `expresso_test_b2_options_${randomUUID().replaceAll("-", "")}`;
  const client = new MongoClient(url ?? "mongodb://127.0.0.1", { serverSelectionTimeoutMS: 3_000 });
  const db = client.db(name);
  const categories = db.collection<Document & { _id: string }>("career_categories");
  const users = db.collection<Document & { _id: string }>("users");
  const options = db.collection<Document & { _id: string }>("career_property_options");
  const scopeA = { userId: id(201), categoryId: id(200), propertyId: id(1) }, scopeB = { ...scopeA, userId: id(202) };
  const shared = { _id: id(200), userId: null, key: "option_test", isSystem: true, propertySchema: {}, propertySchemaV2: [{ id: id(1), key: "tags", name: "태그", type: "multi_select", required: false, system: false, config: { legacyFreeformTags: true, options: [] }, order: 0, version: 1, deletedAt: null }], schemaVersion: 4, sortOrder: 0, name: "공유", icon: "coffee", defaultView: "table", version: 7, updatedAt: new Date("2026-10-01T00:00:00Z") };
  beforeAll(async () => {
    await client.connect(); await migrateMongo({ databaseUrl: url!, databaseName: name });
    await users.insertMany([id(201), id(202)].map((userId, n) => ({ _id: userId, email: `options${n}@example.com`, displayName: `User${n}`, planId: "aa09f35f-bde6-4e18-b9cd-7b32759bf43b", createdAt: new Date(), deletionRequestedAt: null, lifecycleVersion: 0 })));
    await categories.insertMany([shared, { ...shared, _id: id(210), isSystem: false, userId: id(201), key: "private_option_test" }]);
  }, 60_000);
  afterAll(async () => { try { await db.dropDatabase(); } finally { await client.close(); } });

  it("creates strict BSON storage and binary natural-key and canonical-ID uniqueness", async () => {
    const info = await db.listCollections({ name: "career_property_options" }).next();
    expect(info).not.toBeNull();
    const indexes = await options.listIndexes().toArray();
    expect(indexes).toContainEqual(expect.objectContaining({ key: { userId: 1, categoryId: 1, propertyId: 1, rawLabel: 1 }, unique: true }));
    expect(indexes).toContainEqual(expect.objectContaining({ key: { userId: 1, categoryId: 1, propertyId: 1, optionId: 1 }, unique: true }));
    await expect(options.insertOne({ _id: id(900), ...scopeA, optionId: id(901), rawLabel: "x", version: 2, createdAt: new Date() })).rejects.toMatchObject({ code: 121 });
  });

  it("isolates A/B private labels and preserves case/whitespace/accent distinctions", async () => {
    const before = await categories.findOne({ _id: shared._id });
    const a = await register(db, scopeA, " React "); const b = await register(db, scopeB, "B private");
    expect(a.optionId).not.toBe(b.optionId); expect(a.userId).toBe(scopeA.userId);
    expect((await read(db, scopeA)).map(row => row.rawLabel)).toEqual([" React "]);
    expect((await read(db, scopeB)).map(row => row.rawLabel)).toEqual(["B private"]);
    for (const label of ["React", "react", "Café", "CAFE"]) await register(db, scopeA, label);
    expect(await options.countDocuments({ ...scopeA })).toBe(5);
    expect(await categories.findOne({ _id: shared._id })).toEqual(before);
  });

  it("serializes concurrent same-label registration and retries without replacing IDs or incrementing option versions", async () => {
    const result = await Promise.all(Array.from({ length: 8 }, () => register(db, scopeA, "concurrent", { expectedVersion: 0 })));
    expect(new Set(result.map(row => row.optionId)).size).toBe(1);
    expect(new Set(result.map(row => row._id)).size).toBe(1);
    expect(await options.countDocuments({ ...scopeA, rawLabel: "concurrent" })).toBe(1);
    expect(await register(db, scopeA, "concurrent", { expectedVersion: 1 })).toEqual(result[0]);
    await expect(register(db, scopeA, "concurrent", { expectedVersion: 2 })).rejects.toThrow("CAREER_OPTION_VERSION_CONFLICT");
    await expect(register(db, scopeA, "not yet present", { expectedVersion: 1 })).rejects.toThrow("CAREER_OPTION_VERSION_CONFLICT");
    expect(await options.countDocuments({ ...scopeA, rawLabel: "not yet present" })).toBe(0);
  });

  it("rejects owner mismatch, disabled/purged users, and arbitrary external canonical UUIDs", async () => {
    await expect(register(db, { ...scopeB, categoryId: id(210) }, "foreign")).rejects.toThrow("CAREER_OPTION_CATEGORY_OWNER_MISMATCH");
    await expect(read(db, { ...scopeB, categoryId: id(210) })).rejects.toThrow("CAREER_OPTION_CATEGORY_OWNER_MISMATCH");
    await users.updateOne({ _id: scopeA.userId }, { $set: { deletionRequestedAt: new Date() } });
    await expect(register(db, scopeA, "disabled")).rejects.toThrow("CAREER_OPTION_USER_NOT_ACTIVE");
    await users.updateOne({ _id: scopeA.userId }, { $set: { deletionRequestedAt: null } });
    await expect(register(db, { ...scopeA, userId: id(999) }, "purged")).rejects.toThrow("CAREER_OPTION_USER_NOT_ACTIVE");
    await expect(register(db, scopeA, "invented", { optionId: id(777) })).rejects.toThrow("CAREER_OPTION_UNVERIFIED_CANONICAL_ID");
    expect(await options.countDocuments({ rawLabel: { $in: ["foreign", "disabled", "purged", "invented"] } })).toBe(0);
  });

  it("automatically reuses a trusted common option UUID and rejects corrupt common mappings", async () => {
    const knownScope = { ...scopeA, categoryId: id(212) };
    await categories.insertOne({ ...shared, _id: knownScope.categoryId, key: "known_default_option", propertySchemaV2: [{ ...shared.propertySchemaV2[0], config: { legacyFreeformTags: true, options: [{ id: id(503), name: " known " }] } }] });
    const first = await register(db, knownScope, " known ");
    expect(first.optionId).toBe(id(503));
    expect(await register(db, knownScope, " known ")).toEqual(first);
    const corruptScope = { ...scopeA, categoryId: id(213) };
    await categories.insertOne({ ...shared, _id: corruptScope.categoryId, key: "corrupt_common_options", propertySchemaV2: [{ ...shared.propertySchemaV2[0], config: { legacyFreeformTags: true, options: [{ id: id(504), label: "collision" }, { id: id(505), label: "collision" }] } }] });
    await expect(register(db, corruptScope, "collision")).rejects.toThrow("CAREER_OPTION_MAPPING_CONFLICT");
    expect(await options.countDocuments({ categoryId: corruptScope.categoryId })).toBe(0);
  });
  it("preserves a verified existing canonical UUID independently for A/B", async () => {
    await categories.updateOne({ _id: shared._id }, { $set: { "propertySchemaV2.0.config.options": [{ id: id(501), label: " established " }] } });
    const a = await register(db, scopeA, " established ", { optionId: id(501) });
    const b = await register(db, scopeB, " established ", { optionId: id(501) });
    expect(a.optionId).toBe(id(501)); expect(b.optionId).toBe(id(501)); expect(a._id).not.toBe(b._id);
    await expect(register(db, scopeA, "different label", { optionId: id(501) })).rejects.toThrow("CAREER_OPTION_UNVERIFIED_CANONICAL_ID");
  });

  it("does not acquire a global category job lock or change shared schemaVersion or record values", async () => {
    const now = new Date();
    await db.collection("career_property_mutations").insertOne({ _id: id(600), ...scopeA, planJson: "{}", operationFingerprint: "a".repeat(64), status: "pending", active: true, cursor: 0, processedCount: 0, skippedCount: 0, attempts: 0, leaseToken: null, leaseUntil: null, lastError: null, commitFence: 0, createdAt: now, updatedAt: now, completedAt: null } as never);
    const before = await categories.findOne({ _id: shared._id });
    const jobBefore = await db.collection("career_property_mutations").findOne({ _id: id(600) } as never);
    await register(db, scopeA, "with active job");
    expect(await categories.findOne({ _id: shared._id })).toEqual(before);
    expect(await db.collection("career_property_mutations").findOne({ _id: id(600) } as never)).toEqual(jobBefore);
    expect(await db.collection("career_records").countDocuments()).toBe(0);
  });
  it("batch reads all of an actor's category options without exposing the other actor", async () => {
    const fn = (api as unknown as { readCareerCategoryPropertyOptions?: (db: Db, scope: { userId: string; categoryId: string }) => Promise<OptionRow[]> }).readCareerCategoryPropertyOptions;
    expect(fn).toBeTypeOf("function");
    const rows = await fn!(db, { userId: scopeA.userId, categoryId: scopeA.categoryId });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(row => row.userId === scopeA.userId && row.categoryId === scopeA.categoryId)).toBe(true);
    expect(rows.some(row => row.rawLabel === "B private")).toBe(false);
    await expect(fn!(db, { userId: scopeB.userId, categoryId: id(210) })).rejects.toThrow("CAREER_OPTION_CATEGORY_OWNER_MISMATCH");
  });

  it("does not treat a foreign non-null owner as public merely because isSystem is true", async () => {
    await categories.insertOne({ ...shared, _id: id(211), userId: scopeB.userId, key: "foreign_system_owner" });
    const foreign = { ...scopeA, categoryId: id(211) };
    await expect(register(db, foreign, "never persist this label")).rejects.toThrow("CAREER_OPTION_CATEGORY_OWNER_MISMATCH");
    await expect(read(db, foreign)).rejects.toThrow("CAREER_OPTION_CATEGORY_OWNER_MISMATCH");
    expect(await options.countDocuments({ categoryId: id(211) })).toBe(0);
  });
});
describe.skipIf(!url)("Career option ledger readiness on disposable Mongo", () => {
  const name = `ex_test_b2_opts_ready_${randomUUID().replaceAll("-", "")}`;
  const client = new MongoClient(url ?? "mongodb://127.0.0.1", { serverSelectionTimeoutMS: 3_000 });
  const db = client.db(name);
  const scope = { userId: id(301), categoryId: id(300), propertyId: id(3) };
  beforeAll(async () => {
    await client.connect();
    await db.collection("users").insertOne({ _id: scope.userId, deletionRequestedAt: null, lifecycleVersion: 0 } as never);
    await db.collection("career_categories").insertOne({ _id: scope.categoryId, userId: null, isSystem: true, propertySchema: {}, propertySchemaV2: [{ id: scope.propertyId, key: "tags", type: "multi_select", deletedAt: null, config: { legacyFreeformTags: true, options: [] } }] } as never);
  });
  afterAll(async () => { try { await db.dropDatabase(); } finally { await client.close(); } });
  it("rejects an absent ledger without implicitly creating it or writing a user fence", async () => {
    await expect(register(db, scope, "absent")).rejects.toThrow("CAREER_OPTIONS_NOT_PREPARED");
    await expect(read(db, scope)).rejects.toThrow("CAREER_OPTIONS_NOT_PREPARED");
    expect(await db.listCollections({ name: "career_property_options" }).next()).toBeNull();
    expect((await db.collection("users").findOne({ _id: scope.userId } as never))?.lifecycleVersion).toBe(0);
  });
  it("rejects drifted collation and missing uniqueness without option writes", async () => {
    const options = await db.createCollection("career_property_options", { collation: { locale: "en", strength: 1 } });
    await options.createIndex({ userId: 1, categoryId: 1, propertyId: 1, rawLabel: 1 }, { name: "career_option_scope_label", unique: true });
    await options.createIndex({ userId: 1, categoryId: 1, propertyId: 1, optionId: 1 }, { name: "career_option_scope_canonical_id", unique: true });
    await expect(register(db, scope, "drifted")).rejects.toThrow("CAREER_OPTIONS_NOT_PREPARED");
    expect(await options.countDocuments()).toBe(0);
    await options.drop();
    const binaryOptions = await db.createCollection("career_property_options", { collation: { locale: "simple" } });
    await binaryOptions.createIndex({ userId: 1, categoryId: 1, propertyId: 1, rawLabel: 1 }, { name: "career_option_scope_label" });
    await binaryOptions.createIndex({ userId: 1, categoryId: 1, propertyId: 1, optionId: 1 }, { name: "career_option_scope_canonical_id", unique: true });
    await expect(register(db, scope, "not unique")).rejects.toThrow("CAREER_OPTIONS_NOT_PREPARED");
    expect(await binaryOptions.countDocuments()).toBe(0);
    expect((await db.collection("users").findOne({ _id: scope.userId } as never))?.lifecycleVersion).toBe(0);
  });
});