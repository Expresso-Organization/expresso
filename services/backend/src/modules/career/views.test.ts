import { randomUUID } from "node:crypto";

import { CareerViewConfigurationSchema, type CareerCategory, type CareerPropertyDefinitionV2 } from "@expresso/contracts";
import { describe, expect, it } from "vitest";

import { CareerViewQuery } from "./view-query.js";

const ids = {
  category: "00000000-0000-4000-8000-000000000001",
  title: "00000000-0000-4000-8000-000000000002",
  score: "00000000-0000-4000-8000-000000000003",
  tag: "00000000-0000-4000-8000-000000000004",
  date: "00000000-0000-4000-8000-000000000005",
  deleted: "00000000-0000-4000-8000-000000000006",
};

function definition(id: string, key: string, type: CareerPropertyDefinitionV2["type"], order: number, deletedAt: string | null = null): CareerPropertyDefinitionV2 {
  return { id, key, name: key, type, required: false, system: false, config: {}, order, version: 1, deletedAt };
}

const category: CareerCategory = {
  id: ids.category, key: "view_test", name: "뷰", icon: "table", defaultView: "table", isSystem: false,
  propertySchema: { score: { id: ids.score, label: "점수", type: "number", required: false, system: false } },
  propertySchemaV2: [
    definition(ids.title, "title", "title", 0), definition(ids.score, "score", "number", 1),
    definition(ids.tag, "tag", "multi_select", 2), definition(ids.date, "date", "date", 3),
    definition(ids.deleted, "removed", "text", 4, "2026-09-01T00:00:00.000Z"),
  ], schemaVersion: 1, sortOrder: 0, recordCount: 0, version: 1,
};

function view(overrides: Record<string, unknown> = {}) {
  return CareerViewConfigurationSchema.parse({
    id: randomUUID(), categoryId: ids.category, name: "중첩 필터", type: "board", version: 1, order: 0,
    filter: { operator: "and", filters: [
      { propertyId: ids.score, operator: "gte", operand: { type: "number", value: 10 } },
      { operator: "or", filters: [
        { propertyId: ids.title, operator: "contains", operand: { type: "title", value: "결제.*" } },
        { propertyId: ids.tag, operator: "contains", operand: { type: "multi_select", value: [ids.tag] } },
      ] },
    ] },
    sorts: [{ propertyId: ids.score, direction: "desc", nulls: "last" }], groupPropertyId: ids.tag,
    groupOrder: ["doing", "done"], visiblePropertyIds: [ids.title, ids.score], propertyOrder: [ids.title, ids.score],
    columnWidths: { [ids.score]: 160 }, gallery: { coverPropertyId: null, previewPropertyIds: [ids.score] },
    board: { hiddenGroupIds: ["hidden"], cardOrder: { doing: [] } },
    timeline: null, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", ...overrides,
  });
}

describe("career saved view pipeline compiler", () => {
  it("compiles nested filters with escaped regex, null placement and stable _id tie-break", () => {
    const compiled = new CareerViewQuery().compile(category, view());
    const serialized = JSON.stringify(compiled.pipeline);
    expect(serialized).toContain("결제\\\\.\\\\*");
    expect(serialized).toContain("__careerViewNull0");
    const sort = compiled.pipeline.find((stage) => "$sort" in stage)?.$sort as Record<string, number>;
    expect(sort).toMatchObject({ __careerViewNull0: 1, __careerViewSort0: -1, _id: 1 });
    expect(compiled.projectionKeys).toEqual(expect.arrayContaining(["score", "tag"]));
  });

  it("rejects a deleted property and a filter tree above the global limit", () => {
    expect(() => new CareerViewQuery().compile(category, view({ visiblePropertyIds: [ids.deleted] }))).toThrow(/deleted or foreign/);
    const leaves = Array.from({ length: 11 }, () => ({ propertyId: ids.score, operator: "eq" as const, operand: { type: "number" as const, value: 1 } }));
    expect(() => new CareerViewQuery().compile(category, view({ filter: { operator: "and", filters: [{ operator: "or", filters: leaves }, { operator: "or", filters: leaves }] } }))).toThrow(/filter limit/);
  });

  it("rejects operators and operands that do not match the property type", () => {
    expect(() => new CareerViewQuery().compile(category, view({ filter: { propertyId: ids.score, operator: "contains", operand: { type: "number", value: 1 } } }))).toThrow(/operator/);
    expect(() => new CareerViewQuery().compile(category, view({ filter: { propertyId: ids.score, operator: "eq", operand: { type: "text", value: "1" } } }))).toThrow(/operand type/);
  });

  it("maps migrated legacy property IDs when v2 definitions are not materialized yet", () => {
    const legacyCategory = { ...category, propertySchemaV2: undefined };
    expect(new CareerViewQuery().compile(legacyCategory, view({
      visiblePropertyIds: [ids.score], propertyOrder: [ids.score], groupPropertyId: null,
      gallery: null, board: null, filter: { propertyId: ids.score, operator: "gte", operand: { type: "number", value: 0 } },
    })).projectionKeys).toEqual(["score"]);
  });

  it("keeps signed cursor bindings opaque and rejects a tampered cursor", () => {
    const compiler = new CareerViewQuery();
    const compiled = compiler.compile(category, view());
    const userId = randomUUID();
    const viewId = randomUUID();
    const cursor = compiler.encodeCursor({ userId, viewId, viewVersion: 1, expiresAt: Date.now() + 10_000, values: [0, 20, "record"], id: "record" });
    const decoded = compiler.decodeCursor(cursor, { userId, viewId, viewVersion: 1 });
    expect(decoded.values).toHaveLength(compiled.sortParts.length);
    expect(() => compiler.decodeCursor(`${cursor}x`, { userId: decoded.userId, viewId: decoded.viewId, viewVersion: 1 })).toThrow(/invalid/);
  });
});
