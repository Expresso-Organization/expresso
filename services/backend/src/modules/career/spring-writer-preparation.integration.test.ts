import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadMongoMigrations, migrateMongo, mongoCollections } from "@expresso/database";
import { createMongoResource } from "../../platform/mongodb.js";
import { CareerService } from "./service.js";

const url = process.env.TEST_MONGODB_URL;
describe.skipIf(!url)("B1 migration keeps current product schema editing compatible", () => {
  const databaseName = `expresso_test_b1_product_${randomUUID().replaceAll("-", "")}`;
  const client = new MongoClient(url ?? "mongodb://127.0.0.1");
  const resource = createMongoResource(url ?? "mongodb://127.0.0.1", { databaseName });
  const service = new CareerService(resource);
  const userId = randomUUID();
  beforeAll(async () => { await client.connect(); await resource.client.connect(); });
  afterAll(async () => { try { await client.db(databaseName).dropDatabase(); } finally { await client.close(); await resource.close(); } });
  it("removes a pre-migration required property and still creates/updates records through the unchanged product service", async () => {
    const migrations = await loadMongoMigrations();
    await migrateMongo({ databaseUrl: url!, databaseName, migrations: migrations.slice(0, 8) });
    const db = mongoCollections(resource.db);
    await db.users.insertOne({ _id: userId, email: `${userId}@example.test`, displayName: "tester", planId: "aa09f35f-bde6-4e18-b9cd-7b32759bf43b", createdAt: new Date() });
    const category = await service.createCategory(userId, { key: `b1_${randomUUID().replaceAll("-", "")}`, name: "compatibility", icon: "folder", defaultView: "table", propertySchema: { requiredText: { label: "Required", type: "text", required: true, system: false } } });
    const before = await service.createRecord(userId, randomUUID(), { categoryId: category.id, title: "before", properties: { requiredText: "value" }, bodyMd: "unchanged product" });
    // 이 회귀는 B1의 0014 준비 단계까지만 검증합니다. B2 정본 준비 이후의 쓰기는 Spring facade 테스트가 검증합니다.
    const b1Migrations = migrations.filter((migration) => Number(migration.version) <= 14);
    expect(b1Migrations.at(-1)?.version).toBe("0014");
    await migrateMongo({ databaseUrl: url!, databaseName, migrations: b1Migrations });
    await service.updatePropertySchema(userId, category.id, 1, {}, true);
    const after = await service.createRecord(userId, randomUUID(), { categoryId: category.id, title: "after", properties: {}, bodyMd: "" });
    expect(after.record.title).toBe("after");
    const current = await service.getRecord(userId, before.record.id);
    const updated = await service.updateRecord(userId, before.record.id, current.version, { title: "updated" });
    expect(updated.title).toBe("updated");
    expect((await db.careerCategories.findOne({ _id: category.id }))?.propertySchemaV2).toBeUndefined();
  }, 60_000);
});
