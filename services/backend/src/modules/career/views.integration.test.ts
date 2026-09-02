import { randomUUID } from "node:crypto";

import { mongoCollections, type CareerRecordDoc } from "@expresso/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoIdentityService } from "../identity/index.js";
import { CareerService } from "./service.js";

describe.skipIf(!(process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL))("career saved views on Mongo replica set", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let service: CareerService;
  let userId: string;
  let otherUserId: string;
  let categoryId: string;
  let categoryVersion: number;
  let scoreId: string;
  let titleId: string;
  let viewId: string;

  beforeAll(async () => {
    fixture = await createMongoFixture("career-views");
    service = new CareerService(fixture.resource);
    const identity = new MongoIdentityService(fixture.resource);
    userId = (await identity.signup({ email: `view-${randomUUID()}@example.com`, password: "correct-horse-battery", displayName: "뷰" })).user.id;
    otherUserId = (await identity.signup({ email: `view-other-${randomUUID()}@example.com`, password: "correct-horse-battery", displayName: "다른 뷰" })).user.id;
    scoreId = randomUUID();
    titleId = randomUUID();
    const category = await service.createCategory(userId, {
      key: `views_${randomUUID().replaceAll("-", "")}`, name: "뷰", icon: "table", defaultView: "table",
      propertySchema: { score: { id: scoreId, label: "점수", type: "number", required: false, system: false } },
    });
    categoryId = category.id;
    categoryVersion = category.version;
    await mongoCollections(fixture.resource.db).careerCategories.updateOne({ _id: categoryId }, { $set: {
      schemaVersion: 1,
      propertySchemaV2: [
        { id: titleId, key: "title", name: "제목", type: "title", required: true, system: true, config: {}, order: 0, version: 1, deletedAt: null },
        { id: scoreId, key: "score", name: "점수", type: "number", required: false, system: false, config: {}, order: 1, version: 1, deletedAt: null },
      ],
    } });
    const now = new Date();
    const rows: CareerRecordDoc[] = Array.from({ length: 100 }, (_, index) => ({
      _id: randomUUID(), userId, categoryId, title: `기록 ${String(index).padStart(3, "0")}`,
      status: "draft", origin: "manual", properties: { score: { type: "number", value: index % 10 } }, bodyMd: "", version: 1,
      updatedAt: now, deletedAt: null, purgeAfter: null,
    }));
    await mongoCollections(fixture.resource.db).careerRecords.insertMany(rows);
  }, 60_000);

  afterAll(async () => { await fixture?.dispose(); });

  const input = () => ({
    name: "점수순", type: "table" as const,
    filter: { propertyId: scoreId, operator: "gte" as const, operand: { type: "number" as const, value: 0 } },
    sorts: [{ propertyId: scoreId, direction: "asc" as const, nulls: "last" as const }],
    groupPropertyId: null, groupOrder: [], recordOrder: [], visiblePropertyIds: [titleId, scoreId], propertyOrder: [titleId, scoreId],
    columnWidths: { [scoreId]: 140 }, gallery: null, board: null, timeline: null,
  });

  it("keeps 100 records stable across signed cursor pages and stays under the warmed p95 budget", async () => {
    const view = await service.createViewConfiguration(userId, categoryId, categoryVersion, input());
    viewId = view.id;
    const first = await service.queryViewConfiguration(userId, view.id, null, 17);
    const second = await service.queryViewConfiguration(userId, view.id, first.page.nextCursor, 17);
    expect(first.data).toHaveLength(17);
    expect(new Set([...first.data, ...second.data].map((row) => row.id)).size).toBe(34);
    const scores = first.data.map((row) => (row.properties.score as { value: number }).value);
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
    await expect(service.queryViewConfiguration(otherUserId, view.id, null, 17)).rejects.toMatchObject({ statusCode: 404 });

    await service.queryViewConfiguration(userId, view.id, null, 100);
    const timings: number[] = [];
    for (let sample = 0; sample < 30; sample += 1) {
      const started = performance.now();
      await service.queryViewConfiguration(userId, view.id, null, 100);
      timings.push(performance.now() - started);
    }
    timings.sort((left, right) => left - right);
    const p95 = timings[Math.ceil(timings.length * 0.95) - 1]!;
    expect(p95).toBeLessThanOrEqual(300);
  }, 60_000);

  it("restores configuration, applies conditional mutations, duplicates, reorders and rejects stale versions", async () => {
    const current = (await service.listViewConfigurations(userId, categoryId)).find((view) => view.id === viewId)!;
    const updated = await service.updateViewConfiguration(userId, viewId, current.version, { name: "점수순 수정" });
    expect(updated.name).toBe("점수순 수정");
    await expect(service.updateViewConfiguration(userId, viewId, current.version, { name: "오래된 저장" })).rejects.toMatchObject({ statusCode: 412 });
    const duplicate = await service.duplicateViewConfiguration(userId, viewId, updated.version, "점수순 복제");
    const saved = await service.listViewConfigurations(userId, categoryId);
    expect(saved.map((view) => view.name)).toEqual(["점수순 수정", "점수순 복제"]);
    const reordered = await service.reorderViewConfigurations(userId, categoryId, categoryVersion, [duplicate.id, updated.id]);
    expect(reordered.map((view) => view.id)).toEqual([duplicate.id, updated.id]);
    await service.deleteViewConfiguration(userId, duplicate.id, reordered[0]!.version);
    expect(await service.listViewConfigurations(userId, categoryId)).toHaveLength(1);
  });
});
