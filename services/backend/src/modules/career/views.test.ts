import { randomUUID } from "node:crypto";

import { CareerViewConfigurationSchema, type CareerCategory, type CareerPropertyDefinitionV2 } from "@expresso/contracts";
import { describe, expect, it } from "vitest";
import { Decimal128 } from "mongodb";

import { CareerViewQuery } from "./view-query.js";

const ids = {
  category: "00000000-0000-4000-8000-000000000001",
  title: "00000000-0000-4000-8000-000000000002",
  score: "00000000-0000-4000-8000-000000000003",
  tag: "00000000-0000-4000-8000-000000000004",
  date: "00000000-0000-4000-8000-000000000005",
  deleted: "00000000-0000-4000-8000-000000000006",
  customTime: "00000000-0000-4000-8000-000000000007",
  systemTime: "00000000-0000-4000-8000-000000000008",
};

function definition(id: string, key: string, type: CareerPropertyDefinitionV2["type"], order: number, deletedAt: string | null = null, system = false): CareerPropertyDefinitionV2 {
  return { id, key, name: key, type, required: false, system, config: {}, order, version: 1, deletedAt };
}

const category: CareerCategory = {
  id: ids.category, key: "view_test", name: "뷰", icon: "table", defaultView: "table",
  propertySchemaV2: [
    definition(ids.title, "title", "title", 0), definition(ids.score, "score", "number", 1),
    definition(ids.tag, "tag", "multi_select", 2), definition(ids.date, "date", "date", 3),
    definition(ids.deleted, "removed", "text", 4, "2026-09-01T00:00:00.000Z"),
    definition(ids.customTime, "custom_time", "created_time", 5),
    definition(ids.systemTime, "system_time", "updated_time", 6, null, true),
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
    groupOrder: ["doing", "done"], recordOrder: [], visiblePropertyIds: [ids.title, ids.score], propertyOrder: [ids.title, ids.score],
    columnWidths: { [ids.score]: 160 }, gallery: { coverPropertyId: null, previewPropertyIds: [ids.score] },
    board: { hiddenGroupIds: ["hidden"], cardOrder: { doing: [] } },
    timeline: null, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", ...overrides,
  });
}

describe("career saved view pipeline compiler", () => {
  it("compiles nested filters with escaped regex, null placement and stable _id tie-break", () => {
    const compiled = new CareerViewQuery({ source: "legacy" }).compile(category, view());
    const serialized = JSON.stringify(compiled.pipeline);
    expect(serialized).toContain("결제\\\\.\\\\*");
    expect(serialized).toContain("__careerViewNull0");
    const sort = compiled.pipeline.find((stage) => "$sort" in stage)?.$sort as Record<string, number>;
    expect(sort).toMatchObject({ __careerViewNull0: 1, __careerViewSort0: -1, _id: 1 });
    expect(compiled.projectionKeys).toEqual(expect.arrayContaining(["score", "tag"]));
  });

  it("uses saved record order when no property sort is active", () => {
    const first = randomUUID();
    const second = randomUUID();
    const compiled = new CareerViewQuery({ source: "legacy" }).compile(category, view({ sorts: [], recordOrder: [second, first] }));
    const serialized = JSON.stringify(compiled.pipeline);
    expect(serialized).toContain("__careerViewManualOrder");
    expect(serialized).toContain(second);
    const sort = compiled.pipeline.find((stage) => "$sort" in stage)?.$sort as Record<string, number>;
    expect(sort).toMatchObject({ __careerViewManualOrder: 1, _id: 1 });
  });

  it("rejects a deleted property and a filter tree above the global limit", () => {
    expect(() => new CareerViewQuery({ source: "legacy" }).compile(category, view({ visiblePropertyIds: [ids.deleted] }))).toThrow(/deleted or foreign/);
    const leaves = Array.from({ length: 11 }, () => ({ propertyId: ids.score, operator: "eq" as const, operand: { type: "number" as const, value: 1 } }));
    expect(() => new CareerViewQuery({ source: "legacy" }).compile(category, view({ filter: { operator: "and", filters: [{ operator: "or", filters: leaves }, { operator: "or", filters: leaves }] } }))).toThrow(/filter limit/);
  });

  it("rejects operators and operands that do not match the property type", () => {
    expect(() => new CareerViewQuery({ source: "legacy" }).compile(category, view({ filter: { propertyId: ids.score, operator: "contains", operand: { type: "number", value: 1 } } }))).toThrow(/operator/);
    expect(() => new CareerViewQuery({ source: "legacy" }).compile(category, view({ filter: { propertyId: ids.score, operator: "eq", operand: { type: "text", value: "1" } } }))).toThrow(/operand type/);
  });


  it("queries user-defined timestamps from properties and system timestamps from record metadata", () => {
    const custom = new CareerViewQuery({ source: "legacy" }).compile(category, view({ sorts: [{ propertyId: ids.customTime, direction: "asc", nulls: "last" }], visiblePropertyIds: [ids.customTime], propertyOrder: [ids.customTime], groupPropertyId: null, gallery: null, board: null }));
    expect(custom.projectionKeys).toContain("custom_time");
    expect(JSON.stringify(custom.pipeline)).toContain("custom_time");
    const system = new CareerViewQuery({ source: "legacy" }).compile(category, view({ sorts: [{ propertyId: ids.systemTime, direction: "asc", nulls: "last" }], visiblePropertyIds: [ids.systemTime], propertyOrder: [ids.systemTime], groupPropertyId: null, gallery: null, board: null }));
    expect(system.projectionKeys).not.toContain("system_time");
    expect(JSON.stringify(system.pipeline)).toContain("$updatedAt");
  });

  it("keeps signed cursor bindings opaque and rejects a tampered cursor", () => {
    const compiler = new CareerViewQuery({ source: "legacy" });
    const compiled = compiler.compile(category, view());
    const userId = randomUUID();
    const viewId = randomUUID();
    const cursor = compiler.encodeCursor({ userId, viewId, viewVersion: 1, expiresAt: Date.now() + 10_000, values: [0, 20, "record"], id: "record" });
    const decoded = compiler.decodeCursor(cursor, { userId, viewId, viewVersion: 1 });
    expect(decoded.values).toHaveLength(compiled.sortParts.length);
    expect(() => compiler.decodeCursor(`${cursor}x`, { userId: decoded.userId, viewId: decoded.viewId, viewVersion: 1 })).toThrow(/invalid/);
  });
});
describe("canonical Career view compiler", () => {
  it("queries the canonical array by stable definition IDs without a legacy value fallback", () => {
    const compiled = new CareerViewQuery().compile(category, view());
    expect(JSON.stringify(compiled.pipeline)).toContain("$propertyValues");
    expect(JSON.stringify(compiled.pipeline)).toContain(ids.score);
    expect(compiled.pipeline.find((stage) => "$project" in stage)?.$project).toMatchObject({ userId: 1, propertyValues: 1 });
  });
  it("derives canonical relation queries from owned forward and inverse edges", () => {
    const relationId = randomUUID();
    const relationCategory = { ...category, propertySchemaV2: [...category.propertySchemaV2!, definition(relationId, "related", "relation", 8)] };
    const configured = view({ filter: { propertyId: relationId, operator: "contains", operand: { type: "relation", value: [{ recordId: ids.title, title: "copied title" }] } }, sorts: [], visiblePropertyIds: [relationId], propertyOrder: [relationId], groupPropertyId: null, gallery: null, board: null });
    expect(JSON.stringify(new CareerViewQuery().compile(relationCategory, configured).pipeline)).toContain("career_record_relations");
  });
  it("rejects an inexact decimal operand rather than rounding it", () => {
    const configured = view({ filter: null });
    expect(() => new CareerViewQuery().compile(category, { ...configured, filter: { propertyId: ids.score, operator: "eq", operand: { type: "number", value: "1".repeat(35) } } })).toThrow(/invalid career view decimal operand/);
  });
  it("preserves BSON Decimal128 cursor values across signed round trips", () => {
    const compiler = new CareerViewQuery();
    const value = Decimal128.fromString("9007199254740993123456789012345678");
    const cursor = compiler.encodeCursor({ userId: ids.category, viewId: ids.title, viewVersion: 1, expiresAt: Date.now() + 10_000, values: [0, value, ids.score], id: ids.score });
    const decoded = compiler.decodeCursor(cursor, { userId: ids.category, viewId: ids.title, viewVersion: 1 });
    expect(decoded.values[1]).toBeInstanceOf(Decimal128);
    expect(String(decoded.values[1])).toBe(value.toString());
  });
});