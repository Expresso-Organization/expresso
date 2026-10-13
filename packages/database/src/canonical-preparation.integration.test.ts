import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Decimal128, Long, MongoClient, type Db, type Document } from "mongodb";
import type { CareerPropertyDefinitionV2 } from "@expresso/contracts";
import * as api from "./index.js";
import { loadMongoMigrations } from "./mongo-migrations.js";
import { migrateMongo } from "./mongo-migrate.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const definition = (n: number, type: CareerPropertyDefinitionV2["type"]): CareerPropertyDefinitionV2 => ({ id: id(n), key: `p${n}`, name: `p${n}`, type, required: false, system: false, config: {}, order: n, version: 1, deletedAt: null });
function runner(name: "inventoryCanonicalCareerPreparation" | "applyCanonicalCareerPreparation") {
  const fn = (api as unknown as Record<string, ((db: Db) => Promise<{ categoryPatches: unknown[]; recordPatches: unknown[]; conflicts: Array<{ code: string; migrationVersion?: string }> }>) | undefined>)[name];
  expect(fn).toBeTypeOf("function"); return fn!;
}

const url = process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL;
describe.skipIf(!url)("0017 missing-only canonical preparation on disposable Mongo", () => {
  const name = `expresso_test_b2_canonical_${randomUUID().replaceAll("-", "")}`;
  const client = new MongoClient(url ?? "mongodb://127.0.0.1", { serverSelectionTimeoutMS: 3_000 });
  const db = client.db(name);
  const categories = db.collection<Document & { _id: string }>("career_categories");
  const records = db.collection<Document & { _id: string }>("career_records");
  const category = { _id: id(200), userId: id(201), key: "test", isSystem: false, propertySchema: {}, sortOrder: 0, name: "준비", icon: "coffee", defaultView: "table", version: 7, updatedAt: new Date("2026-10-01T00:00:00Z") };
  const record = { _id: id(300), userId: id(201), categoryId: id(200), title: "본문 보존", status: "draft", origin: "manual", properties: {}, bodyMd: "existing body", version: 9, referenceVersion: 4, documentVersion: 6, documentSchemaVersion: 1, latestSnapshotId: id(400), updatedAt: new Date("2026-10-01T00:00:00Z") };
  beforeAll(async () => { await client.connect(); });
  afterAll(async () => { try { await db.dropDatabase(); } finally { await client.close(); } });

  it("registers forward-only 0017 and hashes every executable source byte", async () => {
    const migrations = await loadMongoMigrations();
    expect(migrations.find(migration => migration.version === "0017")?.version).toBe("0017");
    const directory = new URL("./mongodb-migrations/0017/", import.meta.url);
    const manifest = await readFile(new URL("checksum-manifest.json", directory));
    const files = (JSON.parse(manifest.toString("utf8")) as { files: string[] }).files;
    expect(files).toEqual(["migration.ts", "canonical-preparation.ts", "career-canonical-values.ts", "career-product-values.ts", "career-property-options.ts", "career-schemas.ts", "career-business-timezones.json"]);
    const hash = createHash("sha256").update(`checksum-manifest.json\0${manifest.byteLength}\0`).update(manifest);
    for (const file of files) { const bytes = await readFile(new URL(file, directory)); hash.update(`${file}\0${bytes.byteLength}\0`).update(bytes); }
    expect(migrations.find(migration => migration.version === "0017")?.checksum).toBe(hash.digest("hex"));
  });

  it("prepares only missing schema/values, preserves BSON precision, history and every other record field, and reruns safely", async () => {
    const migrations = await loadMongoMigrations();
    await migrateMongo({ databaseUrl: url!, databaseName: name, migrations: migrations.filter(migration => migration.version < "0017") });
    const history = await db.collection("schema_migrations").find({}).sort({ _id: 1 }).toArray();
    await categories.deleteMany({});
    const defs = [definition(1, "number"), definition(2, "number"), definition(3, "date")];
    await categories.insertOne({ ...category, propertySchemaV2: defs });
    await records.insertMany([
      { ...record, properties: { p1: Decimal128.fromString("12345678901234567890.123400"), p2: Long.fromString("9223372036854775807"), p3: { type: "date", value: { start: "2026-10-09T12:34:56.123456789+09:00", end: null, timezone: "Asia/Seoul" } } } },
      { ...record, _id: id(301), properties: { p1: 999 }, propertyValues: [{ propertyDefinitionId: id(1), type: "number", value: Decimal128.fromString("1.2300") }] },
    ]);
    const before = await records.find({}).sort({ _id: 1 }).toArray();
    const inventory = await runner("inventoryCanonicalCareerPreparation")(db);
    expect(inventory.conflicts).toEqual([]); expect(inventory.categoryPatches).toHaveLength(1); expect(inventory.recordPatches).toHaveLength(1);
    expect(await records.find({}).sort({ _id: 1 }).toArray()).toEqual(before);
    expect((await migrateMongo({ databaseUrl: url!, databaseName: name, migrations })).applied).toEqual(["0017_career_canonical_preparation", "0018_career_relation_property_mutation_preparation", "0019_career_product_owner_preparation"]);
    const after = await records.find({}).sort({ _id: 1 }).toArray();
    const { propertyValues: _values, ...businessAndDocument } = after[0]!;
    expect(businessAndDocument).toEqual(before[0]); expect(after[1]).toEqual(before[1]);
    expect((after[0]!.propertyValues as Document[]).map(value => value.type === "number" ? value.value.toString() : value.value)).toEqual(["12345678901234567890.123400", "9223372036854775807", { precision: "datetime", start: "2026-10-09T12:34:56.123456789+09:00", end: null, timezone: "Asia/Seoul" }]);
    expect((await categories.findOne({ _id: id(200) }))?.schemaVersion).toBe(7);
    expect(await db.collection("schema_migrations").find({ _id: { $in: history.map(item => item._id) } }).sort({ _id: 1 }).toArray()).toEqual(history);
    expect((await migrateMongo({ databaseUrl: url!, databaseName: name, migrations })).applied).toEqual([]);
    expect((await runner("applyCanonicalCareerPreparation")(db)).recordPatches).toEqual([]);
    expect(await records.find({}).sort({ _id: 1 }).toArray()).toEqual(after);
  }, 60_000);

  it("preflights every conflict before writing any schema or array", async () => {
    await records.deleteMany({}); await categories.deleteMany({});
    await categories.insertOne({ ...category, propertySchema: { p1: { id: id(1), label: "숫자", type: "number", required: false, system: false } } });
    await records.insertMany([{ ...record, properties: { p1: 42 } }, { ...record, _id: id(301), properties: { p1: "invalid" } }]);
    const before = await records.find({}).sort({ _id: 1 }).toArray();
    const categoryBefore = await categories.findOne({ _id: id(200) });
    await expect(runner("applyCanonicalCareerPreparation")(db)).rejects.toThrow("CANONICAL_PREPARATION_CONFLICT");
    expect(await records.find({}).sort({ _id: 1 }).toArray()).toEqual(before);
    expect(await categories.findOne({ _id: id(200) })).toEqual(categoryBefore);
  });

  it("prepares A/B private tags in a scoped ledger without modifying existing shared schema or versions", async () => {
    await records.deleteMany({}); await categories.deleteMany({});
    const users = db.collection<Document & { _id: string }>("users");
    for (const [n, userId] of [id(201), id(202)].entries()) await users.updateOne({ _id: userId }, { $setOnInsert: { _id: userId, email: `canonical-option${n}@example.com`, displayName: `User${n}`, planId: "aa09f35f-bde6-4e18-b9cd-7b32759bf43b", createdAt: new Date(), deletionRequestedAt: null } }, { upsert: true });
    const definition = { id: id(1), key: "tags", name: "태그", type: "multi_select", required: false, system: false, config: { legacyFreeformTags: true, options: [] }, order: 0, version: 1, deletedAt: null };
    await categories.insertOne({ ...category, userId: null, isSystem: true, propertySchemaV2: [definition], schemaVersion: 5 });
    await records.insertMany([{ ...record, properties: { tags: [" React ", "react"] } }, { ...record, _id: id(301), userId: id(202), properties: { tags: ["B private"] } }]);
    const before = await categories.findOne({ _id: id(200) });
    const recordBefore = await records.find({}).sort({ _id: 1 }).toArray();
    const inventory = await runner("inventoryCanonicalCareerPreparation")(db) as unknown as { conflicts: unknown[]; optionPatches: unknown[]; categoryPatches: unknown[] };
    expect(inventory.conflicts).toEqual([]); expect(inventory.optionPatches).toHaveLength(3); expect(inventory.categoryPatches).toEqual([]);
    await runner("applyCanonicalCareerPreparation")(db);
    expect(await categories.findOne({ _id: id(200) })).toEqual(before);
    const after = await records.find({}).sort({ _id: 1 }).toArray();
    expect(after.map(({ propertyValues: _values, ...original }) => original)).toEqual(recordBefore);
    const scoped = db.collection<Document & { _id: string }>("career_property_options");
    expect((await scoped.find({ userId: id(201), categoryId: id(200) }).sort({ rawLabel: 1 }).toArray()).map(row => row.rawLabel)).toEqual([" React ", "react"]);
    expect((await scoped.find({ userId: id(202), categoryId: id(200) }).toArray()).map(row => row.rawLabel)).toEqual(["B private"]);
    const labels = await scoped.find({ categoryId: id(200) }).toArray();
    expect(after[0]?.propertyValues).toEqual([{ propertyDefinitionId: id(1), type: "multi_select", value: [labels.find(row => row.userId === id(201) && row.rawLabel === " React ")?.optionId, labels.find(row => row.userId === id(201) && row.rawLabel === "react")?.optionId] }]);
    expect((await runner("applyCanonicalCareerPreparation")(db) as unknown as { optionPatches: unknown[] }).optionPatches).toEqual([]);
    expect(await categories.findOne({ _id: id(200) })).toEqual(before);
  });

  it("reports owner mismatch before writing any private label or canonical value", async () => {
    await records.deleteMany({}); await categories.deleteMany({});
    await categories.insertOne({ ...category, propertySchema: { tags: { id: id(1), label: "태그", type: "tags", required: false, system: false } } });
    await records.insertOne({ ...record, userId: id(202), properties: { tags: ["foreign secret"] } });
    const before = await categories.findOne({ _id: id(200) });
    const inventory = await runner("inventoryCanonicalCareerPreparation")(db);
    expect(inventory.conflicts).toContainEqual(expect.objectContaining({ code: "CATEGORY_RECORD_OWNER_MISMATCH" }));
    await expect(runner("applyCanonicalCareerPreparation")(db)).rejects.toThrow("CATEGORY_RECORD_OWNER_MISMATCH");
    expect(await categories.findOne({ _id: id(200) })).toEqual(before);
    expect(await db.collection("career_property_options").countDocuments({ rawLabel: "foreign secret" })).toBe(0);
    expect((await records.findOne({ _id: record._id }))?.propertyValues).toBeUndefined();
  });
  it("reports unknown canary history read-only and refuses to import, rewrite or bypass it", async () => {
    await db.collection("schema_migrations").insertOne({ _id: "0012", name: "canary_history", checksum: "c".repeat(64), state: "applied", completedSteps: [], appliedAt: new Date() } as never);
    const before = await db.collection("schema_migrations").findOne({ _id: "0012" } as never);
    expect((await runner("inventoryCanonicalCareerPreparation")(db)).conflicts).toContainEqual({ code: "UNKNOWN_MIGRATION_HISTORY", migrationVersion: "0012" });
    await expect(runner("applyCanonicalCareerPreparation")(db)).rejects.toThrow("UNKNOWN_MIGRATION_HISTORY");
    expect(await db.collection("schema_migrations").findOne({ _id: "0012" } as never)).toEqual(before);
  });
});