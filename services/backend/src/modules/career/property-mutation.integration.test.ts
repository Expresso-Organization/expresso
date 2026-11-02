import { randomUUID } from "node:crypto";

import { mongoCollections } from "@expresso/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoIdentityService } from "../identity/index.js";
import { MongoCareerPropertySchemaService } from "./property-schema.js";
import { CareerService } from "./service.js";

/** 2026-11-02 감사 H9: 기록이 100건을 넘는 카테고리의 속성 변경은 Worker가 끝내고, 그 뒤 기록 저장이 성공해야 합니다. */
describe.skipIf(!(process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL))("career property mutation over the inline limit", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let service: CareerService;
  let userId: string; let categoryId: string; let propertyId: string; let recordIds: string[];

  beforeAll(async () => {
    fixture = await createMongoFixture("propmutation");
    service = new CareerService(fixture.resource);
    userId = (await new MongoIdentityService(fixture.resource).signup({ email: `mutation-${randomUUID()}@example.com`, password: "correct-horse-battery", displayName: "많은 기록" })).user.id;
    categoryId = (await service.createCategory(userId, { key: `many_${randomUUID().replaceAll("-", "")}`, name: "많음", icon: "folder", defaultView: "table" })).id;
    propertyId = randomUUID();
    const db = mongoCollections(fixture.resource.db);
    await db.careerCategories.updateOne({ _id: categoryId }, { $set: { schemaVersion: 1, propertySchemaV2: [
      { id: propertyId, key: "score", name: "점수", type: "text", required: false, system: false, config: {}, order: 0, version: 1, deletedAt: null },
    ] } });
    recordIds = [];
    for (let index = 0; index < 101; index += 1) {
      const value = index === 0 ? "숫자 아님" : String(index);
      recordIds.push((await service.createRecord(userId, randomUUID(), { categoryId, title: `기록 ${index}`, properties: { score: { type: "text", value } }, bodyMd: "" })).record.id);
    }
  }, 120_000);

  afterAll(async () => { await fixture?.dispose(); });

  it("converts values in the worker, moves unconvertible ones to a tombstone, and lets records save again", async () => {
    const db = mongoCollections(fixture.resource.db);
    const change = { kind: "type-change" as const, propertyId, type: "number" as const };
    const preview = await service.previewChange(userId, categoryId, change);
    await service.applyChange(userId, categoryId, 1, `convert:${propertyId}`, { change, previewToken: preview.previewToken, confirmLossy: true });
    const event = await db.outboxEvents.findOne({ topic: "career.property-conversion", "payload.categoryId": categoryId });
    expect(event?.payload).toMatchObject({ userId, propertyId, targetType: "number" });

    const result = await new MongoCareerPropertySchemaService(fixture.resource).processMutation("career.property-conversion", event!.payload as Record<string, unknown>);
    expect(result.updated).toBe(101);
    const converted = await db.careerRecords.findOne({ _id: recordIds[5]! });
    expect(converted?.properties.score).toEqual({ type: "number", value: 5 });
    const unconvertible = await db.careerRecords.findOne({ _id: recordIds[0]! });
    expect(unconvertible?.properties.score).toBeUndefined();
    expect(unconvertible?.propertyValueTombstones?.[propertyId]).toEqual({ type: "text", value: "숫자 아님" });

    for (const id of [recordIds[0]!, recordIds[5]!]) {
      const current = await db.careerRecords.findOne({ _id: id });
      await expect(service.updateRecord(userId, id, current!.version, { title: "고친 제목" })).resolves.toMatchObject({ title: "고친 제목" });
    }
  }, 120_000);
});
