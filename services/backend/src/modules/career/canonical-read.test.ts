import { randomUUID } from "node:crypto";

import type { CareerCategoryDoc, CareerRecordDoc } from "@expresso/database";
import { describe, expect, it } from "vitest";

import { CareerError } from "./errors.js";
import { mapMongoCategory } from "./mongo-categories.js";
import { mapMongoRecord } from "./mongo-records.js";
import { careerCategoryDefinitions, projectLegacyCareerProperties } from "./properties.js";

const categoryId = "475106fc-bf88-4a73-9c27-66c648733936";
const noteId = "68f062ac-83b5-5ff6-bba4-3a8efc1d8a1a";
const tagsId = "00000000-0000-4000-8000-000000000002";
const tagJavaId = "00000000-0000-4000-8000-000000000003";
const tagLowerId = "00000000-0000-4000-8000-000000000004";
const scoreId = "00000000-0000-4000-8000-000000000005";
const activeId = "00000000-0000-4000-8000-000000000006";
const monthId = "00000000-0000-4000-8000-000000000007";

function category(): CareerCategoryDoc {
  return {
    _id: categoryId,
    key: "experience",
    name: "경험",
    icon: "briefcase",
    defaultView: "table",
    isSystem: true,
    sortOrder: 0,
    version: 2,
    updatedAt: new Date("2026-09-08T00:00:00.000Z"),
    propertySchema: {
      note: { id: noteId, label: "메모", type: "text", required: false, system: true },
      tags: { id: tagsId, label: "태그", type: "tags", required: false, system: true },
      score: { id: scoreId, label: "점수", type: "number", required: false, system: true },
      active: { id: activeId, label: "활성", type: "boolean", required: false, system: true },
      month: { id: monthId, label: "월", type: "date", required: false, system: true },
    },
    propertySchemaV2: [
      { id: randomUUID(), key: "note", name: "오래된 메모", type: "text", required: false, system: true, config: {}, order: 0, version: 1, deletedAt: null },
    ],
    propertyDefinitions: [
      { id: noteId, key: "note", name: "메모", type: "text", required: false, system: true, config: {}, order: 0, version: 2, deletedAt: null },
      { id: tagsId, key: "tags", name: "태그", type: "multi_select", required: false, system: true, config: { options: [{ id: tagJavaId, name: "Java" }, { id: tagLowerId, name: "java" }] }, order: 1, version: 1, deletedAt: null },
      { id: scoreId, key: "score", name: "점수", type: "number", required: false, system: true, config: {}, order: 2, version: 1, deletedAt: null },
      { id: activeId, key: "active", name: "활성", type: "checkbox", required: false, system: true, config: {}, order: 3, version: 1, deletedAt: null },
      { id: monthId, key: "month", name: "월", type: "date", required: false, system: true, config: {}, order: 4, version: 1, deletedAt: null },
    ],
  };
}

function record(overrides: Partial<CareerRecordDoc> = {}): CareerRecordDoc {
  return {
    _id: randomUUID(),
    userId: randomUUID(),
    categoryId,
    title: "기록",
    status: "draft",
    origin: "manual",
    properties: { note: "legacy" },
    bodyMd: "",
    version: 1,
    createdAt: new Date("2026-09-08T00:00:00.000Z"),
    updatedAt: new Date("2026-09-08T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

describe("Fastify canonical Career Property read", () => {
  it("uses canonical propertyDefinitions before transitional V2 definitions", () => {
    expect(careerCategoryDefinitions(category()).map(({ id, key }) => ({ id, key }))).toEqual([
      { id: noteId, key: "note" },
      { id: tagsId, key: "tags" },
      { id: scoreId, key: "score" },
      { id: activeId, key: "active" },
      { id: monthId, key: "month" },
    ]);
    expect(mapMongoCategory(category()).propertySchemaV2?.map(({ id, key }) => ({ id, key }))).toEqual([
      { id: noteId, key: "note" },
      { id: tagsId, key: "tags" },
      { id: scoreId, key: "score" },
      { id: activeId, key: "active" },
      { id: monthId, key: "month" },
    ]);
  });

  it("falls back by whole Definition source only when canonical Definitions are absent", () => {
    const { propertyDefinitions: _canonical, ...transitional } = category();
    expect(careerCategoryDefinitions(transitional)).toEqual(transitional.propertySchemaV2);

    const { propertySchemaV2: _v2, ...legacy } = transitional;
    expect(careerCategoryDefinitions(legacy).map(({ key }) => key)).toEqual([
      "note", "tags", "score", "active", "month",
    ]);
  });

  it("projects mixed records from canonical values and preserves exact tag order and duplicates", () => {
    const row = record({
      properties: { note: "stale legacy", tags: ["stale"] },
      propertyValues: [
        { propertyDefinitionId: noteId, type: "text", value: "canonical" },
        { propertyDefinitionId: tagsId, type: "multi_select", value: [tagLowerId, tagJavaId, tagLowerId] },
        { propertyDefinitionId: scoreId, type: "number", value: 42 },
        { propertyDefinitionId: activeId, type: "checkbox", value: true },
        { propertyDefinitionId: monthId, type: "date", value: { precision: "month", start: "2026-09", end: null } },
      ],
    });

    expect(projectLegacyCareerProperties(category(), row)).toEqual({
      note: "canonical",
      tags: ["java", "Java", "java"],
      score: 42,
      active: true,
      month: "2026-09",
    });
    expect(mapMongoRecord(row, category()).properties).toEqual({
      note: "canonical",
      tags: ["java", "Java", "java"],
      score: 42,
      active: true,
      month: "2026-09",
    });
  });

  it("uses legacy properties only for a legacy-only record and does not fill an empty canonical snapshot", () => {
    expect(projectLegacyCareerProperties(category(), record())).toEqual({ note: "legacy" });
    expect(projectLegacyCareerProperties(category(), record({ propertyValues: [] }))).toEqual({});
  });

  it("rejects orphan canonical values instead of falling back to stale legacy data", () => {
    const row = record({
      propertyValues: [{ propertyDefinitionId: randomUUID(), type: "text", value: "canonical" }],
    });

    expect(() => projectLegacyCareerProperties(category(), row)).toThrow(CareerError);
    try {
      projectLegacyCareerProperties(category(), row);
    } catch (error) {
      expect(error).toMatchObject({ statusCode: 500 });
    }
  });
});
