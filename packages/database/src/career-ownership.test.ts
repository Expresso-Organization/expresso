import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, type Document } from "mongodb";
import { CareerPropertyValueV2Schema } from "@expresso/contracts";

import { careerCategoryId, careerOptionId, careerPropertyId } from "./career-category-templates.js";
import { loadMongoMigrations } from "./mongo-migrations.js";
import { migrateMongo } from "./mongo-migrate.js";

const mongoUrl = process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL;

/** 0017 이전 상태(공용 v1 카테고리 · 태그 원값)를 만들고 이관 결과를 본다. */
describe.skipIf(!mongoUrl)("career category ownership migration", () => {
  const databaseName = `expresso_test_ownership_${randomUUID().replaceAll("-", "")}`;
  const client = new MongoClient(mongoUrl ?? "mongodb://127.0.0.1", { serverSelectionTimeoutMS: 3_000 });
  const db = client.db(databaseName);
  const userId = randomUUID();
  const quietId = randomUUID();
  // 마이그레이션은 기록 _id 순서로 옵션을 만든다. A가 B보다 앞서도록 정렬해 옵션 순서를 고정한다.
  const [recordA, recordB] = [randomUUID(), randomUUID()].sort((left, right) => left.localeCompare(right)) as [string, string];
  const ids = { recordA, recordB, trashed: randomUUID(), skill: randomUUID(), custom: randomUUID(), customRecord: randomUUID(), collision: randomUUID(), view: randomUUID() };
  let shared: Record<string, Document> = {};

  beforeAll(async () => {
    await client.connect();
    const all = await loadMongoMigrations();
    await migrateMongo({ databaseUrl: mongoUrl!, databaseName, migrations: all.filter((migration) => migration.version < "0017") });
    shared = Object.fromEntries((await db.collection("career_categories").find({ userId: null }).toArray()).map((category) => [category.key, category]));
    const now = new Date();
    const record = (id: string, categoryId: string, properties: Document, extra: Document = {}) => ({ _id: id, userId, categoryId, title: id, status: "draft", origin: "manual", properties, bodyMd: "", version: 1, updatedAt: now, deletedAt: null, purgeAfter: null, ...extra });
    await db.collection("career_categories").insertMany([
      { _id: ids.custom, userId, key: "reading", isSystem: false, name: "독서", icon: "book", defaultView: "table", sortOrder: 7, version: 1, updatedAt: now,
        propertySchema: { genres: { id: randomUUID(), label: "장르", type: "tags", required: false, system: false }, done: { id: randomUUID(), label: "완독", type: "boolean", required: false, system: false } } },
      { _id: ids.collision, userId, key: "project", isSystem: false, name: "내 프로젝트", icon: "folder", defaultView: "table", sortOrder: 8, version: 1, updatedAt: now, propertySchema: {} },
    ] as never[]);
    await db.collection("career_records").insertMany([
      record(ids.recordA, shared.project!._id, { technologies: ["React", "TypeScript"], role: "프론트엔드" }),
      record(ids.recordB, shared.project!._id, { technologies: ["React", "Vite"] }),
      record(ids.trashed, shared.experience!._id, { competencies: ["협업"], situation: "야간 배치 실패", metrics: ["3회 → 0"] }, { deletedAt: now, purgeAfter: now }),
      record(ids.skill, shared.skill_tool!._id, { group: "언어 · 쿼리", lastUsedMonth: "2025-07" }),
      record(ids.customRecord, ids.custom, { genres: ["소설"], done: true }),
    ] as never[]);
    const technologiesId = shared.project!.propertySchema.technologies.id as string;
    await db.collection("career_views").insertOne({ _id: ids.view, userId, categoryId: shared.project!._id, name: "기술별", viewType: "table", filters: [], sorts: [], visibleProperties: [technologiesId], sortOrder: 0, createdAt: now,
      configuration: { id: ids.view, categoryId: shared.project!._id, name: "기술별", type: "table", version: 1, order: 0, filter: null, sorts: [], groupPropertyId: technologiesId, groupOrder: [], recordOrder: [], visiblePropertyIds: [technologiesId], propertyOrder: [technologiesId], columnWidths: { [shared.project!._id]: 300 }, gallery: null, board: null, timeline: null, createdAt: now.toISOString(), updatedAt: now.toISOString() } } as never);
    await db.collection("users").insertOne({ _id: quietId, email: `${quietId}@example.com`, displayName: "기록 없음", planId: "aa09f35f-bde6-4e18-b9cd-7b32759bf43b", passwordHash: null, createdAt: now, deletionRequestedAt: null, lifecycleVersion: 0 } as never);
    await migrateMongo({ databaseUrl: mongoUrl!, databaseName });
  }, 60_000);
  afterAll(async () => { try { await db.dropDatabase(); } finally { await client.close(); } });

  it("copies seven categories per user and removes the shared ones", async () => {
    expect(await db.collection("career_categories").countDocuments({ userId: null })).toBe(0);
    expect(await db.collection("career_categories").countDocuments({ userId: quietId })).toBe(7);
    expect(await db.collection("career_categories").countDocuments({ propertySchema: { $exists: true } })).toBe(0);
    expect(await db.collection("career_categories").countDocuments({ isSystem: { $exists: true } })).toBe(0);
    expect((await db.collection("career_categories").indexes()).map((index) => index.name)).not.toContain("system_key_unique");
    const keys = (await db.collection("career_categories").find({ userId }).toArray()).map((category) => category.key).sort();
    expect(keys).toEqual(["academic_writing", "activity_leadership", "certification_award", "education_history", "experience", "project", "project_custom", "reading", "skill_tool"]);
  });

  it("moves records to the owner's categories and turns tags into options", async () => {
    const projectId = careerCategoryId(userId, "project");
    const project = await db.collection("career_categories").findOne({ _id: projectId as never });
    const technologies = project!.propertySchemaV2.find((definition: Document) => definition.key === "technologies");
    expect(technologies.id).toBe(shared.project!.propertySchema.technologies.id);
    expect(technologies.config.options.map((option: Document) => option.name)).toEqual(["React", "TypeScript", "Vite"]);
    const recordA = await db.collection("career_records").findOne({ _id: ids.recordA as never });
    expect(recordA!.categoryId).toBe(projectId);
    expect(recordA!.properties.technologies).toEqual({ type: "multi_select", value: [careerOptionId(technologies.id, "React"), careerOptionId(technologies.id, "TypeScript")] });
    expect(recordA!.properties.role).toEqual({ type: "text", value: "프론트엔드" });
    const skill = await db.collection("career_records").findOne({ _id: ids.skill as never });
    expect(skill!.properties.lastUsedMonth).toEqual({ type: "date", value: { start: "2025-07-01", end: null, timezone: null } });
    expect(skill!.properties.group.type).toBe("select");
    for (const row of await db.collection("career_records").find({ userId }).toArray()) {
      for (const value of Object.values(row.properties)) expect(CareerPropertyValueV2Schema.safeParse(value).success).toBe(true);
    }
  });

  it("keeps valued legacy properties only for the owner, including trashed records", async () => {
    const experience = await db.collection("career_categories").findOne({ _id: careerCategoryId(userId, "experience") as never });
    expect(experience!.propertySchemaV2.map((definition: Document) => definition.key)).toEqual(["competencies", "period", "metrics", "situation"]);
    const quiet = await db.collection("career_categories").findOne({ _id: careerCategoryId(quietId, "experience") as never });
    expect(quiet!.propertySchemaV2.map((definition: Document) => definition.key)).toEqual(["competencies", "period"]);
    expect(quiet!.propertySchemaV2[1].id).toBe(careerPropertyId(careerCategoryId(quietId, "experience"), "period"));
  });

  it("converts custom v1 categories and rewrites view category references", async () => {
    const custom = await db.collection("career_categories").findOne({ _id: ids.custom as never });
    expect(custom!.propertySchemaV2.map((definition: Document) => [definition.key, definition.type])).toEqual([["genres", "multi_select"], ["done", "checkbox"]]);
    const record = await db.collection("career_records").findOne({ _id: ids.customRecord as never });
    expect(record!.properties.done).toEqual({ type: "checkbox", value: true });
    const view = await db.collection("career_views").findOne({ _id: ids.view as never });
    const projectId = careerCategoryId(userId, "project");
    expect(view!.categoryId).toBe(projectId);
    expect(view!.configuration.categoryId).toBe(projectId);
    expect(view!.configuration.columnWidths).toEqual({ [projectId]: 300 });
    expect(view!.configuration.groupPropertyId).toBe(shared.project!.propertySchema.technologies.id);
  });

  it("is a no-op when the per-user step runs again", async () => {
    const before = await db.collection("career_records").find({ userId }).sort({ _id: 1 }).toArray();
    const ownership = (await loadMongoMigrations()).find((migration) => migration.version === "0017")!;
    await ownership.steps.find((step) => step.id === "career_categories:copy_per_user")!.run(db);
    expect(await db.collection("career_records").find({ userId }).sort({ _id: 1 }).toArray()).toEqual(before);
    expect(await db.collection("career_categories").countDocuments({ userId })).toBe(9);
  });
});
