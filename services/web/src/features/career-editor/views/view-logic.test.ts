import type { CareerCategory, CareerPropertyDefinitionV2, CareerRecord, CareerViewConfiguration } from "@expresso/contracts";
import { CareerViewConfigurationSchema } from "@expresso/contracts";
import { describe, expect, it } from "vitest";

import { EMPTY_GROUP, defaultViewDraft, filterRoot, groupColumns, groupKeyOf, localDefaultViews, matchesFilter, normalizeFilter, operandFor, operatorsFor, sortRecords, timelineDefaults, timelineRange, withType, withinAxis } from "./view-logic";

const id = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
function definition(index: number, key: string, type: CareerPropertyDefinitionV2["type"], config: Record<string, unknown> = {}): CareerPropertyDefinitionV2 {
  return { id: id(index), key, name: key, type, required: false, system: key === "title", config, order: index, version: 1, deletedAt: null };
}
const options = [{ id: id(90), name: "진행 중" }, { id: id(91), name: "완료" }];
const definitions = [definition(1, "title", "title"), definition(2, "score", "number"), definition(3, "stage", "select", { options }), definition(4, "period", "date"), definition(5, "ended", "date"), definition(6, "tags", "multi_select", { options })];
const category: CareerCategory = { id: id(100), key: "experience", name: "경험", icon: "table", defaultView: "table", propertySchemaV2: definitions, schemaVersion: 1, sortOrder: 0, recordCount: 0, version: 1 };
function record(index: number, properties: CareerRecord["properties"], title = `기록 ${index}`): CareerRecord {
  return { id: id(200 + index), categoryId: category.id, title, status: "draft", origin: "manual", properties, bodyMd: "", version: 1, updatedAt: "2026-09-01T00:00:00.000Z" };
}
const view = (overrides: Partial<CareerViewConfiguration> = {}): CareerViewConfiguration => ({ ...defaultViewDraft(category, "table", "테이블"), id: id(300), categoryId: category.id, version: 1, order: 0, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", ...overrides });

/** `services/backend/src/modules/career/view-query.ts`의 `validateFilterOperator` 허용 집합. */
const SERVER_OPERATORS: Record<string, readonly string[]> = {
  number: ["eq", "neq", "gt", "gte", "lt", "lte", "is_empty", "is_not_empty"],
  date: ["eq", "neq", "gt", "gte", "lt", "lte", "is_empty", "is_not_empty"],
  title: ["eq", "neq", "contains", "not_contains", "is_empty", "is_not_empty"],
  text: ["eq", "neq", "contains", "not_contains", "is_empty", "is_not_empty"],
  multi_select: ["eq", "neq", "contains", "not_contains", "is_empty", "is_not_empty"],
  relation: ["eq", "neq", "contains", "not_contains", "is_empty", "is_not_empty"],
  select: ["eq", "neq", "is_empty", "is_not_empty"],
  checkbox: ["eq", "neq", "is_empty", "is_not_empty"],
  formula: ["eq", "neq", "gt", "gte", "lt", "lte", "is_empty", "is_not_empty", "contains", "not_contains"],
};

describe("view-logic", () => {
  it("offers only operators the server accepts for each property type", () => {
    for (const [type, allowed] of Object.entries(SERVER_OPERATORS)) {
      expect(operatorsFor(definition(9, "x", type as CareerPropertyDefinitionV2["type"])).every((operator) => allowed.includes(operator))).toBe(true);
    }
  });

  it("builds operands in the contract shape and drops empty groups", () => {
    const score = definitions[1]!;
    const period = definitions[3]!;
    expect(operandFor(score, "12")).toEqual({ type: "number", value: 12 });
    expect(operandFor(score, "")).toBeNull();
    expect(operandFor(period, "2024-01-01")).toEqual({ type: "date", value: { start: "2024-01-01", end: null, timezone: null } });
    const filter = normalizeFilter({ operator: "and", filters: [{ propertyId: score.id, operator: "gte", operand: { type: "number", value: 1 } }, { operator: "or", filters: [] }] });
    expect(CareerViewConfigurationSchema.shape.filter.parse(filter)).toEqual({ operator: "and", filters: [{ propertyId: score.id, operator: "gte", operand: { type: "number", value: 1 } }] });
    expect(normalizeFilter({ operator: "and", filters: [] })).toBeNull();
    expect(filterRoot({ propertyId: score.id, operator: "is_empty", operand: null }).filters).toHaveLength(1);
  });

  it("evaluates and/or trees like the server", () => {
    const items = [record(1, { score: { type: "number", value: 5 }, period: { type: "date", value: { start: "2025-03-01", end: null, timezone: null } } }), record(2, { score: { type: "number", value: 20 } }, "결제 장애"), record(3, {})];
    const filter = { operator: "and", filters: [{ propertyId: id(2), operator: "is_not_empty", operand: null }, { operator: "or", filters: [{ propertyId: id(4), operator: "gte", operand: { type: "date", value: { start: "2025-01-01", end: null, timezone: null } } }, { propertyId: id(1), operator: "contains", operand: { type: "title", value: "결제" } }] }] };
    expect(items.filter((item) => matchesFilter(item, filter, category)).map((item) => item.title)).toEqual(["기록 1", "결제 장애"]);
    expect(matchesFilter(items[2]!, { propertyId: id(1), operator: "contains", operand: null }, category)).toBe(true);
  });

  it("sorts by several keys with empty values last", () => {
    const items = [record(1, { score: { type: "number", value: 5 } }, "나"), record(2, {}, "가"), record(3, { score: { type: "number", value: 5 } }, "가")];
    const sorted = sortRecords(items, view({ sorts: [{ propertyId: id(2), direction: "desc", nulls: "last" }, { propertyId: id(1), direction: "asc", nulls: "last" }] }), category);
    expect(sorted.map((item) => item.id)).toEqual([id(203), id(201), id(202)]);
  });

  it("lists every group column in saved order with option names", () => {
    const grouping = { kind: "property" as const, definition: definitions[2]! };
    expect(groupColumns(grouping, [id(91)]).map((column) => column.label)).toEqual(["완료", "진행 중", "stage 없음"]);
    expect(groupColumns({ kind: "status" }, []).map((column) => column.label)).toEqual(["초안", "정리됨", "검증됨"]);
    expect(groupKeyOf(record(1, {}), grouping)).toBe(EMPTY_GROUP);
  });

  it("reads timeline ranges from the start property or a separate end property", () => {
    const item = record(1, { period: { type: "date", value: { start: "2023-03-01", end: "2024-02-01", timezone: null } }, ended: { type: "date", value: { start: "2025-01-01", end: null, timezone: null } } });
    const base = withType(view(), "timeline", category);
    expect(base.timeline?.startPropertyId).toBe(id(4));
    expect(timelineRange(item, base, category)).toEqual({ start: "2023-03-01", end: "2024-02-01" });
    const separate = { ...base, timeline: { ...base.timeline!, endPropertyId: id(5) } };
    expect(timelineRange(item, separate, category)).toEqual({ start: "2023-03-01", end: "2025-01-01" });
    expect(withinAxis({ start: "2023-03-01", end: "2024-02-01" }, { ...base, timeline: { ...base.timeline!, axisStart: "2024-03-01" } })).toBe(false);
  });

  it("starts the timeline on the date property records actually fill", () => {
    const filled = [record(1, { ended: { type: "date", value: { start: "2021-02-01", end: null, timezone: null } } }), record(2, {})];
    expect(timelineDefaults(category, filled)).toMatchObject({ startPropertyId: id(5), endPropertyId: null });
    const both = [record(1, { period: { type: "date", value: { start: "2015-03-01", end: null, timezone: null } }, ended: { type: "date", value: { start: "2021-02-01", end: null, timezone: null } } })];
    expect(timelineDefaults(category, both)).toMatchObject({ startPropertyId: id(4), endPropertyId: id(5) });
    const reversed = { ...category, propertySchemaV2: definitions.map((item) => item.key === "ended" ? { ...item, order: 0 } : item) };
    expect(timelineDefaults(reversed, both)).toMatchObject({ startPropertyId: id(4), endPropertyId: id(5) });
  });

  it("follows the screen definition for default tabs and skips timeline without dates", () => {
    expect(localDefaultViews(category).map((item) => item.type)).toEqual(["table", "board", "timeline"]);
    const undated = { ...category, propertySchemaV2: definitions.filter((item) => item.type !== "date") };
    expect(localDefaultViews(undated).map((item) => item.type)).toEqual(["table", "board"]);
  });
});
