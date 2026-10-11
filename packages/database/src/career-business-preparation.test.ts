import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, type Document } from "mongodb";
import { loadMongoMigrations } from "./mongo-migrations.js";
import { migrateMongo } from "./mongo-migrate.js";

const url = process.env.TEST_MONGODB_URL;
describe.skipIf(!url)("Career business forward preparation", () => {
  const name = `expresso_test_b1_${randomUUID().replaceAll("-", "")}`;
  const client = new MongoClient(url ?? "mongodb://127.0.0.1");
  const db = client.db(name);
  const records = db.collection<Document & { _id: string }>("career_records");
  beforeAll(async () => { await client.connect(); });
  afterAll(async () => { try { await db.dropDatabase(); } finally { await client.close(); } });

  it("extends existing 0001-0008 history without changing checksums or rejecting legacy creates", async () => {
    const migrations = await loadMongoMigrations();
    expect(migrations.map((item) => item.version)).toEqual(["0001", "0002", "0003", "0004", "0005", "0006", "0007", "0008", "0009", "0010", "0014", "0015", "0016", "0017", "0018", "0019"]);
    const options = { databaseUrl: url!, databaseName: name };
    await migrateMongo({ ...options, migrations: migrations.slice(0, 8) });
    const history = await db.collection("schema_migrations").find({}).sort({ _id: 1 }).toArray();
    const categoriesBefore = await db.collection("career_categories").find({}).sort({ _id: 1 }).toArray();
    await migrateMongo({ ...options, migrations });
    expect(await db.collection("schema_migrations").find({ _id: { $in: history.map((item) => item._id) } }).sort({ _id: 1 }).toArray()).toEqual(history);
    expect((await migrateMongo({ ...options, migrations })).applied).toEqual([]);
    const legacy = { _id: randomUUID(), userId: randomUUID(), categoryId: randomUUID(), title: "", status: "draft", origin: "manual", properties: {}, bodyMd: "", version: 1, updatedAt: new Date() };
    await expect(records.insertOne(legacy)).resolves.toBeTruthy();
    await expect(records.insertOne({ ...legacy, _id: randomUUID(), propertyValues: [] })).resolves.toBeTruthy();
    await expect(records.insertOne({ ...legacy, _id: randomUUID(), propertyValues: [{ propertyDefinitionId: randomUUID(), type: "number", value: "12.500" }] })).rejects.toMatchObject({ code: 121 });
    const categories = await db.collection("career_categories").find({}).toArray();
    expect(categories.length).toBeGreaterThan(0);
    const preparedCategories = await db.collection("career_categories").find({}).sort({ _id: 1 }).toArray();
    expect(preparedCategories.map(({ propertySchemaV2: _schema, schemaVersion: _version, ...original }) => original)).toEqual(categoriesBefore);
    for (const category of preparedCategories) {
      expect(category.schemaVersion).toBe(category.version);
      expect(category.propertySchemaV2).toHaveLength(Object.keys(category.propertySchema).length);
      for (const definition of category.propertySchemaV2 as Document[]) {
        const legacy = category.propertySchema[definition.key] as Document;
        expect(definition.id).toBe(legacy.id);
        expect(definition.name).toBe(legacy.label);
        expect(definition.type).toBe(legacy.type === "boolean" ? "checkbox" : legacy.type === "tags" ? "multi_select" : legacy.type);
        expect(definition.required).toBe(legacy.required);
        expect(definition.system).toBe(legacy.system);
        expect(definition.config).toEqual(legacy.type === "tags" ? { legacyFreeformTags: true, options: [] } : {});
        expect(definition.version).toBe(1);
        expect(definition.deletedAt).toBeNull();
      }
    }
    expect(categories.every((item) => Object.values(item.propertySchema).every((definition) => typeof (definition as Document).id === "string"))).toBe(true);
  }, 60_000);

  it("uses every manifest input byte and preserves legacy/document validator fields", async () => {
    const directory = new URL("./mongodb-migrations/0014/", import.meta.url);
    const manifest = await readFile(new URL("checksum-manifest.json", directory));
    const files = JSON.parse(manifest.toString()).files as string[];
    expect(files).toEqual(["migration.ts", "business-schema.json"]);
    const hash = createHash("sha256").update(`checksum-manifest.json\0${manifest.byteLength}\0`).update(manifest);
    for (const file of files) {
      const bytes = await readFile(new URL(file, directory)); hash.update(`${file}\0${bytes.byteLength}\0`).update(bytes);
    }
    expect((await loadMongoMigrations()).find((migration) => migration.version === "0014")?.checksum).toBe(hash.digest("hex"));
    const original = JSON.parse(await readFile(new URL("./mongodb-migrations/0001/schema.json", import.meta.url), "utf8")) as Document[];
    const base = original.find((item) => item.name === "career_records")!.validator.$jsonSchema;
    const info = await db.listCollections({ name: "career_records" }).next();
    if (!info || !("options" in info)) throw new Error("validator unavailable");
    const prepared = info.options!.validator.$jsonSchema;
    expect(prepared.required).toEqual(base.required);
    for (const [field, definition] of Object.entries(base.properties)) expect(prepared.properties[field], field).toEqual(definition);
    expect(prepared.properties).not.toHaveProperty("blockBody");
  });
});
