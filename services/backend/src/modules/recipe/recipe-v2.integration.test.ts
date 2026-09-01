import { randomUUID } from "node:crypto";

import { mongoCollections } from "@expresso/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoCareerService } from "../career/index.js";
import { MongoIdentityService } from "../identity/index.js";
import { MongoMaterialsService } from "../materials/index.js";
import { RecipeV2Service } from "./recipe-v2-service.js";
import { MongoRecipeService } from "./service.js";

/**
 * 02 레시피 — 어떤 내용이 어떤 순서로.
 *
 * 기준은 `docs/architecture/portfolio-creation-flow-v2.md` §7 이다.
 */
describe.skipIf(!process.env.TEST_MONGODB_URL)("MongoDB recipe v2 integration", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let service: RecipeV2Service;
  let userId = "";
  let otherUserId = "";
  let brewId = "";
  const recordIds: string[] = [];

  beforeAll(async () => {
    fixture = await createMongoFixture("recipe-v2");
    const identity = new MongoIdentityService(fixture.resource);
    userId = (await identity.signup({ email: `rv2-${randomUUID()}@example.com`, displayName: "Recipe v2", password: "correct-horse-battery" })).user.id;
    otherUserId = (await identity.signup({ email: `rv2-${randomUUID()}@example.com`, displayName: "Other", password: "correct-horse-battery" })).user.id;
    const career = new MongoCareerService(fixture.resource);
    const categoryId = (await career.listCategories(userId)).find(({ key }) => key === "experience")!.id;
    for (let index = 0; index < 3; index++) {
      const record = (await career.createRecord(userId, randomUUID(), { categoryId, title: `근거 ${index}`, properties: {}, bodyMd: `성과 ${index + 1}건` })).record;
      await mongoCollections(fixture.resource.db).careerRecords.updateOne({ _id: record.id }, { $set: { status: "organized" } });
      recordIds.push(record.id);
    }
    brewId = (await new MongoMaterialsService(fixture.resource).createFreeBrew(userId, { title: "레시피", brief: "", lengthPreset: "single" })).brewId;
    service = new RecipeV2Service(fixture.resource);
  }, 60_000);
  afterAll(async () => { await fixture?.dispose(); });

  it("opens once and stays the same recipe on the next visit", async () => {
    const first = await service.open(userId, brewId);
    expect(first.schemaVersion).toBe(2);
    expect(first.sections).toEqual([]);
    // §7.4 — 제작 의도는 비어 있어도 유효하다. 분량만 brew 에서 물려받는다.
    expect(first.intent).toMatchObject({ role: "", audience: "", lengthPreset: "single", jobPostingId: null });
    expect((await service.open(userId, brewId)).id).toBe(first.id);
    expect(await mongoCollections(fixture.resource.db).recipes.countDocuments({ userId, brewId, schemaVersion: 2 })).toBe(1);
    await expect(service.get(otherUserId, first.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("keeps one primary source per item and refuses the same source twice", async () => {
    const opened = await service.open(userId, brewId);
    await service.edit(userId, opened.id, { operation: "add_section", title: "첫 인상", purpose: "한 문장으로 알린다" });
    const withSection = (await service.edit(userId, opened.id, { operation: "add_section", title: "대표 작업", purpose: "" })).recipe;
    const [first, second] = withSection.sections;
    await service.edit(userId, opened.id, { operation: "add_item", sectionId: first!.id, text: "역할과 대표 성과" });
    const placed = (await service.edit(userId, opened.id, { operation: "add_item", sectionId: second!.id })).recipe;
    expect(placed.sections[0]!.items[0]).toMatchObject({ text: "역할과 대표 성과", sourceBindings: [] });
    expect(placed.sections[1]!.items[0]!.text).toBe("");

    const itemId = placed.sections[1]!.items[0]!.id;
    await service.edit(userId, opened.id, { operation: "bind_source", itemId, sourceType: "record", sourceId: recordIds[0]!, role: "primary" });
    const bound = (await service.edit(userId, opened.id, { operation: "bind_source", itemId, sourceType: "record", sourceId: recordIds[1]!, role: "primary" })).recipe;
    const bindings = bound.sections[1]!.items[0]!.sourceBindings;
    expect(bindings.filter(({ role }) => role === "primary")).toHaveLength(1);
    expect(bindings.find(({ role }) => role === "primary")?.sourceId).toBe(recordIds[1]);
    await expect(service.edit(userId, opened.id, { operation: "bind_source", itemId, sourceType: "record", sourceId: recordIds[1]!, role: "supporting" }))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it("moves an item into another section in one reorder request", async () => {
    const opened = await service.open(userId, brewId);
    const [first, second] = opened.sections;
    const moved = second!.items[0]!.id;
    const reordered = await service.reorder(userId, opened.id, {
      sections: [
        { sectionId: second!.id, itemIds: [] },
        { sectionId: first!.id, itemIds: [moved, ...first!.items.map(({ id }) => id)] },
      ],
    });
    expect(reordered.sections.map(({ id }) => id)).toEqual([second!.id, first!.id]);
    expect(reordered.sections[1]!.items.map(({ id }) => id)[0]).toBe(moved);
    // 근거 연결은 자리를 옮겨도 따라간다.
    expect(reordered.sections[1]!.items[0]!.sourceBindings).toHaveLength(2);
    await expect(service.reorder(userId, opened.id, { sections: [{ sectionId: first!.id, itemIds: [] }] }))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it("opens onto the AI draft instead of an empty page, and takes a newer draft on the next visit", async () => {
    const draftBrewId = (await new MongoMaterialsService(fixture.resource).createFreeBrew(userId, { title: "초안", brief: "성과", lengthPreset: "single" })).brewId;
    const legacy = new MongoRecipeService(fixture.resource);
    const first = await legacy.generate(userId, draftBrewId, `rv2-draft-${randomUUID()}`);
    const adopted = await service.open(userId, draftBrewId);
    expect(adopted.sections.map(({ title }) => title)).toEqual(first.sections.map(({ title }) => title));
    const items = adopted.sections.flatMap(({ items: own }) => own);
    expect(items).toHaveLength(first.sections.flatMap(({ items: own }) => own).length);
    expect(items.some(({ text }) => text.length > 0)).toBe(true);
    // v1 의 근거 경로는 항목의 중심·보조 근거가 된다.
    const bound = items.filter(({ sourceBindings }) => sourceBindings.length > 0);
    expect(bound.length).toBeGreaterThan(0);
    expect(bound.every(({ sourceBindings }) => sourceBindings.filter(({ role }) => role === "primary").length === 1)).toBe(true);
    expect(adopted.unusedSources.length).toBeGreaterThan(0);

    // 「다시 만들기」로 새 초안이 오면 다음에 열 때 그것을 얹는다.
    const second = await legacy.generate(userId, draftBrewId, `rv2-draft-${randomUUID()}`);
    expect(second.id).not.toBe(first.id);
    const refreshed = await service.open(userId, draftBrewId);
    expect(refreshed.id).toBe(adopted.id);
    expect(refreshed.sections).toHaveLength(second.sections.length);
  });
});
