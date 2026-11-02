import { randomUUID } from "node:crypto";
import { MongoClient, type Document } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultCareerCategories } from "./career-category-templates.js";
import { loadMongoMigrations } from "./mongo-migrations.js";
import { migrateMongo } from "./mongo-migrate.js";

const url = process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL;

describe.skipIf(!url)("main to Career writer forward upgrade", () => {
  const databaseName = `expresso_test_main_upgrade_${randomUUID().replaceAll("-", "")}`;
  const client = new MongoClient(url ?? "mongodb://127.0.0.1", { serverSelectionTimeoutMS: 3_000 });
  const db = client.db(databaseName);
  beforeAll(async () => { await client.connect(); });
  afterAll(async () => { try { await db.dropDatabase(); } finally { await client.close(); } });

  it("preserves owned V2 categories, source values, document metadata and applied ledger while adding canonical values", async () => {
    const migrations = await loadMongoMigrations();
    await migrateMongo({ databaseUrl: url!, databaseName, migrations: migrations.filter(item => item.version < "0025") });
    const history = await db.collection("schema_migrations").find({}).sort({ _id: 1 }).toArray();
    const now = new Date("2026-10-01T01:02:03.000Z");
    const userId = randomUUID(), otherUserId = randomUUID();
    await db.collection("users").insertMany([userId, otherUserId].map(_id => ({ _id, email: `${_id}@example.com`, displayName: "이관 보존", planId: "aa09f35f-bde6-4e18-b9cd-7b32759bf43b", passwordHash: null, createdAt: now, deletionRequestedAt: null, lifecycleVersion: 0 })) as never[]);
    const categories = [...defaultCareerCategories(userId, now), ...defaultCareerCategories(otherUserId, now)];
    const project = categories.find(category => category.userId === userId && category.key === "project")!;
    const definition = (key: string, type: "created_time" | "updated_time", order: number) => ({ id: randomUUID(), key, name: key, type, system: false, required: false, config: {}, order, version: 1, deletedAt: null });
    project.propertySchemaV2.push(definition("created", "created_time", 5), definition("updated", "updated_time", 6));
    await db.collection("career_categories").insertMany(categories as never[]);
    const recordId = randomUUID();
    const stamp = "2026-10-01T10:02:03.123456789+09:00";
    const record = { _id: recordId, userId, categoryId: project._id, title: "원본 기록", status: "organized", origin: "manual", properties: { role: { type: "text", value: " 원본 역할 " }, created: { type: "created_time", value: stamp }, updated: { type: "updated_time", value: stamp } }, bodyMd: "본문과 CRDT 연결 보존", version: 7, referenceVersion: 4, documentSchemaVersion: 2, documentVersion: 9, latestSnapshotId: randomUUID(), documentBodyHash: "a".repeat(64), createdAt: now, updatedAt: now, deletedAt: now, purgeAfter: new Date("2027-10-01T00:00:00Z"), unmappedProperties: { historical: "원래 값" }, propertyValueTombstones: { retained: { type: "text", value: "숨긴 값" } } };
    await db.collection("career_records").insertOne(record as never);
    const viewId = randomUUID();
    await db.collection("career_views").insertOne({ _id: viewId, userId, categoryId: project._id, name: "보존 보기", viewType: "table", filters: [], sorts: [], visibleProperties: [], sortOrder: 0, createdAt: now } as never);
    const beforeCategories = await db.collection("career_categories").find({}).sort({ _id: 1 }).toArray();
    const beforeRecord = await db.collection("career_records").findOne({ _id: recordId } as never);
    const beforeView = await db.collection("career_views").findOne({ _id: viewId } as never);
    const result = await migrateMongo({ databaseUrl: url!, databaseName });
    expect(result.applied).toEqual(migrations.filter(item => item.version >= "0025").map(item => `${item.version}_${item.name}`));
    expect(await db.collection("career_categories").find({}).sort({ _id: 1 }).toArray()).toEqual(beforeCategories);
    const after = await db.collection("career_records").findOne({ _id: recordId } as never);
    const { propertyValues, ...rest } = after!;
    expect(rest).toEqual(beforeRecord);
    expect(propertyValues).toEqual([
      { propertyDefinitionId: project.propertySchemaV2.find(item => item.key === "role")!.id, type: "text", value: " 원본 역할 " },
      ...["created", "updated"].map(key => ({ propertyDefinitionId: project.propertySchemaV2.find(item => item.key === key)!.id, type: "date", value: { precision: "datetime", start: stamp, end: null, timezone: null } })),
    ]);
    expect(await db.collection("career_views").findOne({ _id: viewId } as never)).toEqual(beforeView);
    expect(await db.collection("schema_migrations").find({ _id: { $in: history.map(item => item._id) } }).sort({ _id: 1 }).toArray()).toEqual(history);
    expect((await migrateMongo({ databaseUrl: url!, databaseName })).applied).toEqual([]);
    expect(await db.collection("career_records").findOne({ _id: recordId } as never)).toEqual(after);
    const validator = (await db.listCollections({ name: "career_categories" }).next() as Document).options.validator as Document;
    expect(validator.$jsonSchema.properties).not.toHaveProperty("propertySchema");
    expect(validator.$jsonSchema.properties).not.toHaveProperty("isSystem");
    await expect(db.collection("career_categories").insertOne({ ...project, _id: randomUUID(), userId: null } as never)).rejects.toMatchObject({ code: 121 });
  }, 60_000);
});
