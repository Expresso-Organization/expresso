import { randomUUID } from "node:crypto";

import { mongoCollections } from "@expresso/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongoFixture } from "../../../test/support/mongodb.js";
import { CareerDocumentService } from "../career-editor/index.js";
import { MongoIdentityService } from "../identity/index.js";
import { CareerService } from "./service.js";

/** 2026-11-10: 모든 카테고리는 보관할 수 있고, 직접 만든 카테고리만 기록과 함께 영구 삭제할 수 있습니다. */
describe.skipIf(!(process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL))("career category archive and delete", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let career: CareerService; let documents: CareerDocumentService; let userId: string;

  const createCategory = async (name: string) => (await career.createCategory(userId, { key: `custom_${randomUUID().replaceAll("-", "").slice(0, 12)}`, name, icon: "folder", defaultView: "table" })).id;
  const createRecord = async (categoryId: string, title: string) => (await career.createRecord(userId, randomUUID(), { categoryId, title, properties: {}, bodyMd: "본문" })).record.id;

  beforeAll(async () => {
    fixture = await createMongoFixture("catlife");
    career = new CareerService(fixture.resource);
    documents = new CareerDocumentService(fixture.resource, "lifecycle-secret");
    userId = (await new MongoIdentityService(fixture.resource).signup({ email: `lifecycle-${randomUUID()}@example.com`, password: "correct-horse-battery", displayName: "정리" })).user.id;
  }, 60_000);

  afterAll(async () => { await fixture?.dispose(); });

  it("archives and unarchives a built-in category without bumping its version", async () => {
    const before = (await career.listCategories(userId)).find((category) => category.key === "education_history")!;
    expect(before).toMatchObject({ builtIn: true, archivedAt: null });
    const archived = await career.archiveCategory(userId, before.id, true);
    expect(archived.archivedAt).not.toBeNull();
    expect(archived.version).toBe(before.version);
    expect((await career.listCategories(userId)).find((category) => category.id === before.id)?.archivedAt).toBe(archived.archivedAt);
    expect((await career.archiveCategory(userId, before.id, false)).archivedAt).toBeNull();
  }, 60_000);

  it("refuses to delete a built-in category", async () => {
    const experience = (await career.listCategories(userId)).find((category) => category.key === "experience")!;
    expect((await career.getCategoryDeleteImpact(userId, experience.id)).builtIn).toBe(true);
    await expect(career.deleteCategory(userId, experience.id, true)).rejects.toMatchObject({ statusCode: 409 });
  }, 60_000);

  it("deletes an empty custom category with its views", async () => {
    const db = mongoCollections(fixture.resource.db);
    const categoryId = await createCategory("빈 카테고리");
    expect((await career.listCategories(userId)).find((category) => category.id === categoryId)?.builtIn).toBe(false);
    await db.careerViews.insertOne({ _id: randomUUID(), userId, categoryId, name: "표", viewType: "table", filters: [], sorts: [], visibleProperties: [], sortOrder: 0, createdAt: new Date() });
    await career.deleteCategory(userId, categoryId, false);
    expect(await db.careerCategories.findOne({ _id: categoryId })).toBeNull();
    expect(await db.careerViews.countDocuments({ categoryId })).toBe(0);
  }, 60_000);

  it("asks before deleting records and then purges active and trashed records", async () => {
    const db = mongoCollections(fixture.resource.db);
    const categoryId = await createCategory("기록 있는 카테고리");
    const active = await createRecord(categoryId, "남은 기록");
    const trashed = await createRecord(categoryId, "휴지통 기록");
    await documents.bootstrap(userId, active);
    await career.trashRecord(userId, trashed);
    expect(await career.getCategoryDeleteImpact(userId, categoryId)).toMatchObject({ recordCount: 1, trashedRecordCount: 1, quotedRecordCount: 0, blockingProperties: [] });

    await expect(career.deleteCategory(userId, categoryId, false)).rejects.toMatchObject({ statusCode: 409 });
    expect(await db.careerRecords.countDocuments({ categoryId })).toBe(2);

    await career.deleteCategory(userId, categoryId, true);
    expect(await db.careerCategories.findOne({ _id: categoryId })).toBeNull();
    expect(await db.careerRecords.countDocuments({ categoryId })).toBe(0);
    expect(await db.careerDocumentSnapshots.countDocuments({ recordId: active })).toBe(0);
  }, 60_000);

  it("blocks deletion while a portfolio quotes one of its records", async () => {
    const db = mongoCollections(fixture.resource.db);
    const categoryId = await createCategory("인용 중 카테고리");
    const quoted = await createRecord(categoryId, "인용 기록");
    await db.recordUsages.insertOne({ _id: randomUUID(), userId, recordId: quoted, blockId: randomUUID(), quotedText: "본문", firstUsedAt: new Date() });
    expect((await career.getCategoryDeleteImpact(userId, categoryId)).quotedRecordCount).toBe(1);
    await expect(career.deleteCategory(userId, categoryId, true)).rejects.toMatchObject({ statusCode: 409 });
    expect(await db.careerRecords.findOne({ _id: quoted })).toBeTruthy();
  }, 60_000);

  it("blocks deletion while another category's relation property points at it", async () => {
    const db = mongoCollections(fixture.resource.db);
    const targetId = await createCategory("대상");
    const sourceId = await createCategory("원천");
    const propertyId = randomUUID();
    await db.careerCategories.updateOne({ _id: sourceId }, { $push: { propertySchemaV2: { id: propertyId, key: "linked", name: "연결", type: "relation", required: false, system: false, config: { targetCategoryId: targetId, inversePropertyId: null, cardinality: "multiple", deletePolicy: "nullify" }, order: 1, version: 1, deletedAt: null } } });
    expect((await career.getCategoryDeleteImpact(userId, targetId)).blockingProperties).toEqual([{ categoryId: sourceId, categoryName: "원천", propertyId, propertyName: "연결" }]);
    await expect(career.deleteCategory(userId, targetId, true)).rejects.toMatchObject({ statusCode: 409 });

    // 지운 관계 속성은 막지 않습니다.
    await db.careerCategories.updateOne({ _id: sourceId, "propertySchemaV2.id": propertyId }, { $set: { "propertySchemaV2.$.deletedAt": new Date().toISOString() } });
    await career.deleteCategory(userId, targetId, false);
    expect(await db.careerCategories.findOne({ _id: targetId })).toBeNull();
  }, 60_000);
});
