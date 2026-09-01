import { randomUUID } from "node:crypto";

import { mongoCollections } from "@expresso/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoCareerService } from "../career/index.js";
import { MongoIdentityService } from "../identity/index.js";
import { MongoMaterialsService } from "../materials/index.js";
import { BlueprintService } from "./blueprint-service.js";
import { MongoRecipeService } from "./service.js";

/**
 * 02 레시피 — Recipe v2 블루프린트.
 *
 * 기준은 `docs/architecture/portfolio-creation-flow-v2.md` §7 이다.
 */
describe.skipIf(!process.env.TEST_MONGODB_URL)("MongoDB blueprint integration", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let service: BlueprintService;
  let userId = "";
  let otherUserId = "";
  let brewId = "";
  let recordIds: string[] = [];

  beforeAll(async () => {
    fixture = await createMongoFixture("blueprint");
    const identity = new MongoIdentityService(fixture.resource);
    userId = (await identity.signup({ email: `bp-${randomUUID()}@example.com`, displayName: "Blueprint", password: "correct-horse-battery" })).user.id;
    otherUserId = (await identity.signup({ email: `bp-${randomUUID()}@example.com`, displayName: "Other", password: "correct-horse-battery" })).user.id;
    const career = new MongoCareerService(fixture.resource);
    const categoryId = (await career.listCategories(userId)).find(({ key }) => key === "experience")!.id;
    for (let index = 0; index < 3; index++) {
      const record = (await career.createRecord(userId, randomUUID(), { categoryId, title: `근거 ${index}`, properties: {}, bodyMd: `성과 ${index + 1}건` })).record;
      await mongoCollections(fixture.resource.db).careerRecords.updateOne({ _id: record.id }, { $set: { status: "organized" } });
      recordIds.push(record.id);
    }
    brewId = (await new MongoMaterialsService(fixture.resource).createFreeBrew(userId, { title: "블루프린트", brief: "", lengthPreset: "single" })).brewId;
    service = new BlueprintService(fixture.resource);
  }, 60_000);
  afterAll(async () => { await fixture?.dispose(); });

  it("opens once and stays the same blueprint on the next visit", async () => {
    const first = await service.open(userId, brewId);
    expect(first.schemaVersion).toBe(2);
    expect(first.sections).toEqual([]);
    // §7.4 — 제작 의도는 비어 있어도 유효하다. 분량만 brew 에서 물려받는다.
    expect(first.intent).toMatchObject({ role: "", audience: "", lengthPreset: "single", jobPostingId: null });
    expect((await service.open(userId, brewId)).id).toBe(first.id);
    expect(await mongoCollections(fixture.resource.db).recipes.countDocuments({ userId, brewId, schemaVersion: 2 })).toBe(1);
    await expect(service.get(otherUserId, first.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("places elements with the default variant of their kind and keeps one primary source", async () => {
    const opened = await service.open(userId, brewId);
    await service.edit(userId, opened.id, { operation: "add_section", title: "첫 인상", purpose: "한 문장으로 알린다" });
    const withSection = (await service.edit(userId, opened.id, { operation: "add_section", title: "대표 작업", purpose: "" })).recipe;
    const [hero, project] = withSection.sections;
    await service.edit(userId, opened.id, { operation: "add_element", sectionId: hero!.id, kind: "hero" });
    const placed = (await service.edit(userId, opened.id, { operation: "add_element", sectionId: project!.id, kind: "metric" })).recipe;
    expect(placed.sections[0]!.elements[0]).toMatchObject({ kind: "hero", presentationVariant: "display-sentence", width: "full", emphasis: "primary" });
    expect(placed.sections[1]!.elements[0]).toMatchObject({ kind: "metric", presentationVariant: "single-number" });

    const elementId = placed.sections[1]!.elements[0]!.id;
    await service.edit(userId, opened.id, { operation: "bind_source", elementId, sourceType: "record", sourceId: recordIds[0]!, role: "primary" });
    const bound = (await service.edit(userId, opened.id, { operation: "bind_source", elementId, sourceType: "record", sourceId: recordIds[1]!, role: "primary" })).recipe;
    const bindings = bound.sections[1]!.elements[0]!.sourceBindings;
    expect(bindings.filter(({ role }) => role === "primary")).toHaveLength(1);
    expect(bindings.find(({ role }) => role === "primary")?.sourceId).toBe(recordIds[1]);
    await expect(service.edit(userId, opened.id, { operation: "bind_source", elementId, sourceType: "record", sourceId: recordIds[1]!, role: "supporting" }))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it("refuses a variant the kind does not support and follows the kind when it changes", async () => {
    const opened = await service.open(userId, brewId);
    const elementId = opened.sections[1]!.elements[0]!.id;
    await expect(service.edit(userId, opened.id, { operation: "update_element", elementId, presentationVariant: "vertical-timeline" }))
      .rejects.toMatchObject({ statusCode: 409 });
    // 종류가 바뀌면 표시 방식의 갈래도 바뀐다. 남길 수 없으면 새 갈래의 첫 번째로 내린다.
    const changed = (await service.edit(userId, opened.id, { operation: "update_element", elementId, kind: "timeline" })).recipe;
    expect(changed.sections[1]!.elements[0]).toMatchObject({ kind: "timeline", presentationVariant: "vertical-timeline" });
  });

  it("moves an element into another section in one reorder request", async () => {
    const opened = await service.open(userId, brewId);
    const [first, second] = opened.sections;
    const moved = second!.elements[0]!.id;
    const reordered = await service.reorder(userId, opened.id, {
      sections: [
        { sectionId: second!.id, elementIds: [] },
        { sectionId: first!.id, elementIds: [moved, ...first!.elements.map(({ id }) => id)] },
      ],
    });
    expect(reordered.sections.map(({ id }) => id)).toEqual([second!.id, first!.id]);
    expect(reordered.sections[1]!.elements.map(({ id }) => id)[0]).toBe(moved);
    // 근거 연결은 자리를 옮겨도 따라간다.
    expect(reordered.sections[1]!.elements[0]!.sourceBindings).toHaveLength(2);
    await expect(service.reorder(userId, opened.id, { sections: [{ sectionId: first!.id, elementIds: [] }] }))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it("takes the previous v1 recipe into the blueprint when one already exists", async () => {
    const legacyBrewId = (await new MongoMaterialsService(fixture.resource).createFreeBrew(userId, { title: "옛 레시피", brief: "성과", lengthPreset: "single" })).brewId;
    const legacy = await new MongoRecipeService(fixture.resource).generate(userId, legacyBrewId, `bp-legacy-${randomUUID()}`);
    const adopted = await service.open(userId, legacyBrewId);
    expect(adopted.sections.map(({ title }) => title)).toEqual(legacy.sections.map(({ title }) => title));
    const items = legacy.sections.flatMap(({ items: own }) => own);
    const elements = adopted.sections.flatMap(({ elements: own }) => own);
    expect(elements).toHaveLength(items.length);
    expect(elements.every(({ kind }) => kind === "text")).toBe(true);
    // v1 의 근거 경로는 요소의 중심·보조 근거가 된다.
    const bound = elements.filter(({ sourceBindings }) => sourceBindings.length > 0);
    expect(bound.length).toBeGreaterThan(0);
    expect(bound.every(({ sourceBindings }) => sourceBindings.filter(({ role }) => role === "primary").length === 1)).toBe(true);
  });
});
