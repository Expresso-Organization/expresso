import { describe, expect, it } from "vitest";
import { Decimal128, Long } from "mongodb";
import type { CareerPropertyDefinitionV2 } from "@expresso/contracts";
import * as api from "./index.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const definition = (n: number, type: CareerPropertyDefinitionV2["type"], config: Record<string, unknown> = {}): CareerPropertyDefinitionV2 => ({ id: id(n), key: `p${n}`, name: `p${n}`, type, required: false, system: false, config, order: n, version: 1, deletedAt: null });
const category = { _id: id(200), userId: id(201), isSystem: false, version: 3, propertySchema: { note: { id: id(1), label: "메모", type: "text", required: false, system: false }, amount: { id: id(2), label: "수치", type: "number", required: false, system: false }, month: { id: id(3), label: "월", type: "date", required: false, system: false } } };
function prepareRecord(record: Record<string, unknown>, definitions: readonly CareerPropertyDefinitionV2[]): { set: Record<string, unknown>; conflicts: Array<{ code: string; propertyKey?: string }> } {
  const fn = (api as unknown as { prepareCanonicalCareerRecord?: (record: Record<string, unknown>, definitions: readonly CareerPropertyDefinitionV2[]) => { set: Record<string, unknown>; conflicts: Array<{ code: string; propertyKey?: string }> } }).prepareCanonicalCareerRecord;
  expect(fn).toBeTypeOf("function");
  return fn!(record, definitions);
}
function prepareCategory(input: Record<string, unknown>, records: readonly Record<string, unknown>[] = []): { set: Record<string, unknown>; definitions: CareerPropertyDefinitionV2[]; conflicts: Array<{ code: string }>; optionRegistrations: Array<{ userId: string; categoryId: string; propertyId: string; optionId: string; rawLabel: string; metadata?: Record<string, unknown> }> } {
  const fn = (api as unknown as { prepareCanonicalCareerCategory?: (category: Record<string, unknown>, records: readonly Record<string, unknown>[]) => { set: Record<string, unknown>; definitions: CareerPropertyDefinitionV2[]; conflicts: Array<{ code: string }>; optionRegistrations: Array<{ userId: string; categoryId: string; propertyId: string; optionId: string; rawLabel: string; metadata?: Record<string, unknown> }> } }).prepareCanonicalCareerCategory;
  expect(fn).toBeTypeOf("function");
  return fn!(input, records.map(record => ({ userId: id(201), ...record })));
}

describe("explicit missing-only canonical Career preparation", () => {
  it("prepares schema IDs deterministically while preserving IDs from migration 0006", () => {
    const result = prepareCategory(category);
    expect(result.conflicts).toEqual([]);
    expect(result.set.schemaVersion).toBe(3);
    expect(result.definitions.map(({ id, key, type }) => ({ id, key, type }))).toEqual([{ id: id(1), key: "note", type: "text" }, { id: id(2), key: "amount", type: "number" }, { id: id(3), key: "month", type: "date" }]);
    const missingId = { ...category, propertySchema: { note: { label: "메모", type: "text", required: false, system: false } } };
    expect(prepareCategory(missingId).definitions[0]?.id).toBe(prepareCategory(missingId).definitions[0]?.id);
    expect(prepareCategory(missingId).definitions[0]?.id).toMatch(/^[a-f0-9-]{36}$/);
  });

  it("retains exact Decimal128 and Long values and omits genuinely missing fields", () => {
    const decimal = Decimal128.fromString("12345678901234567890.123400");
    const result = prepareRecord({ _id: id(300), categoryId: id(200), properties: { p1: decimal, p2: Long.fromString("9223372036854775807") } }, [definition(1, "number"), definition(2, "number"), definition(3, "text")]);
    expect(result.conflicts).toEqual([]);
    const values = result.set.propertyValues as Array<{ type: string; value: Decimal128 }>;
    expect(values.map(({ value }) => value.toString())).toEqual(["12345678901234567890.123400", "9223372036854775807"]);
    expect(values).toHaveLength(2);
  });

  it("converts legacy primitives and V2 envelopes without normalizing strings or dates", () => {
    const result = prepareRecord({ _id: id(300), categoryId: id(200), properties: {
      p1: " note ", p2: { type: "checkbox", value: false }, p3: "2026-10", p4: { type: "date", value: { start: "2026-10-09", end: null, timezone: null } },
      p5: { type: "date", value: { start: "2026-10-09T12:34:56.123456789+09:00", end: null, timezone: "Asia/Seoul" } }, p6: { type: "select", value: null },
    } }, [definition(1, "text"), definition(2, "checkbox"), definition(3, "date"), definition(4, "date"), definition(5, "date"), definition(6, "select", { options: [] })]);
    expect(result.conflicts).toEqual([]);
    expect(result.set.propertyValues).toEqual([
      { propertyDefinitionId: id(1), type: "text", value: " note " }, { propertyDefinitionId: id(2), type: "checkbox", value: false },
      { propertyDefinitionId: id(3), type: "date", value: { precision: "month", start: "2026-10", end: null } }, { propertyDefinitionId: id(4), type: "date", value: { precision: "day", start: "2026-10-09", end: null } },
      { propertyDefinitionId: id(5), type: "date", value: { precision: "datetime", start: "2026-10-09T12:34:56.123456789+09:00", end: null, timezone: "Asia/Seoul" } }, { propertyDefinitionId: id(6), type: "select", value: null },
    ]);
  });

  it("maps explicit unique option labels and preserves option/asset IDs", () => {
    const result = prepareRecord({ _id: id(300), categoryId: id(200), properties: { p1: " A ", p2: { type: "multi_select", value: [id(101)] }, p3: { type: "file", value: [id(102)] } } }, [definition(1, "select", { options: [{ id: id(100), label: " A " }] }), definition(2, "multi_select", { options: [{ id: id(101), label: "B" }] }), definition(3, "file")]);
    expect(result.conflicts).toEqual([]);
    expect(result.set.propertyValues).toEqual([{ propertyDefinitionId: id(1), type: "select", value: id(100) }, { propertyDefinitionId: id(2), type: "multi_select", value: [id(101)] }, { propertyDefinitionId: id(3), type: "file", value: [id(102)] }]);
  });

  it("prepares existing V2 name-shaped options without renaming or normalizing source metadata", () => {
    const select = definition(1, "select", { options: [{ id: id(100), name: " Exact ", color: "blue" }] });
    const result = prepareRecord({ _id: id(300), categoryId: id(200), properties: { p1: { type: "select", value: id(100) } } }, [select]);
    expect(result).toMatchObject({ set: { propertyValues: [{ propertyDefinitionId: id(1), type: "select", value: id(100) }] }, conflicts: [] });
    const tags = { ...category, propertySchema: { tags: { id: id(1), label: "태그", type: "tags", required: false, system: false, config: { options: [{ id: id(100), name: " Exact ", color: "blue" }] } } } };
    expect(prepareCategory(tags).optionRegistrations).toEqual([{ userId: id(201), categoryId: id(200), propertyId: id(1), optionId: id(100), rawLabel: " Exact ", metadata: { name: " Exact ", color: "blue" } }]);
    expect(select.config.options).toEqual([{ id: id(100), name: " Exact ", color: "blue" }]);
  });
  it("keeps already-canonical arrays and definitions untouched even when legacy properties differ", () => {
    const definitions = [definition(1, "text")];
    const existing = { _id: id(200), userId: id(201), isSystem: false, version: 8, propertySchema: {}, propertySchemaV2: definitions, schemaVersion: 4 };
    expect(prepareCategory(existing)).toMatchObject({ set: {}, definitions, conflicts: [] });
    expect(prepareRecord({ _id: id(300), categoryId: id(200), propertyValues: [{ propertyDefinitionId: id(1), type: "text", value: "authoritative" }], properties: { p1: "stale" } }, definitions)).toEqual({ set: {}, conflicts: [] });
  });

  it.each([
    [{ p1: null }, "UNREPRESENTABLE_LEGACY_VALUE"], [{ p1: "not a number" }, "UNREPRESENTABLE_LEGACY_VALUE"], [{ unknown: "x" }, "UNKNOWN_LEGACY_PROPERTY"],
  ])("reports malformed and unknown legacy data without returning a partial replacement array", (properties, code) => {
    const result = prepareRecord({ _id: id(300), categoryId: id(200), properties }, [definition(1, "number")]);
    expect(result.set).toEqual({});
    expect(result.conflicts).toContainEqual(expect.objectContaining({ code }));
  });

  it("reports null/malformed canonical arrays instead of silently treating them as missing", () => {
    for (const propertyValues of [null, {}, [{ propertyDefinitionId: id(1), type: "number", value: "1.00" }]]) {
      const result = prepareRecord({ _id: id(300), categoryId: id(200), properties: {}, propertyValues }, [definition(1, "number")]);
      expect(result.set).toEqual({});
      expect(result.conflicts).toContainEqual(expect.objectContaining({ code: "INVALID_CANONICAL_VALUES" }));
    }
  });

  it("rejects ambiguous labels and timezone metadata that cannot be retained by day precision", () => {
    expect(prepareRecord({ _id: id(300), categoryId: id(200), properties: { p1: "A" } }, [definition(1, "select", { options: [{ id: id(100), label: "A" }, { id: id(101), label: "A" }] })]).conflicts).toContainEqual(expect.objectContaining({ code: "AMBIGUOUS_OPTION_LABEL" }));
    expect(prepareRecord({ _id: id(300), categoryId: id(200), properties: { p1: { type: "date", value: { start: "2026-10-09", end: null, timezone: "Asia/Seoul" } } } }, [definition(1, "date")]).conflicts).toContainEqual(expect.objectContaining({ code: "UNREPRESENTABLE_LEGACY_VALUE" }));
  });

  it("reports invalid existing schema as a conflict", () => {
    expect(prepareCategory({ ...category, propertySchemaV2: null }).conflicts).toContainEqual(expect.objectContaining({ code: "INVALID_CANONICAL_SCHEMA" }));
  });

  it("preserves custom timestamp schema aliases as precise canonical date values", () => {
    const defs = [definition(1, "created_time"), { ...definition(2, "updated_time"), system: true }];
    const result = prepareRecord({ _id: id(300), categoryId: id(200), properties: { p1: { type: "created_time", value: "2026-10-09T12:34:56.123456789+09:00" } } }, defs);
    expect(result.conflicts).toEqual([]);
    expect(result.set.propertyValues).toEqual([{ propertyDefinitionId: id(1), type: "date", value: { precision: "datetime", start: "2026-10-09T12:34:56.123456789+09:00", end: null, timezone: null } }]);
  });
  it("rejects custom timestamp ranges while retaining existing timezone metadata", () => {
    const defs = [definition(1, "created_time")];
    const date = { precision: "datetime", start: "2026-10-09T12:34:56.123456789+09:00", end: "2026-10-10T12:34:56+09:00", timezone: "Asia/Seoul" };
    expect(prepareRecord({ _id: id(300), categoryId: id(200), properties: { p1: { type: "created_time", value: date } } }, defs)).toMatchObject({ set: {}, conflicts: [expect.objectContaining({ code: "UNREPRESENTABLE_LEGACY_VALUE" })] });
    expect(prepareRecord({ _id: id(300), categoryId: id(200), properties: {}, propertyValues: [{ propertyDefinitionId: id(1), type: "date", value: { ...date, end: null } }] }, defs)).toEqual({ set: {}, conflicts: [] });
  });
  it("retains BSON Long category versions without treating them as unsafe numbers", () => {
    const input = { ...category, version: Long.fromString("9007199254740991") };
    expect(prepareCategory(input)).toMatchObject({ set: { schemaVersion: 9007199254740991 }, conflicts: [] });
    expect(prepareCategory({ ...category, version: Long.fromString("9007199254740992") }).conflicts).toContainEqual(expect.objectContaining({ code: "INVALID_CANONICAL_SCHEMA" }));
  });

  it("rejects duplicate definition identities for missing arrays rather than choosing the final definition", () => {
    expect(prepareRecord({ _id: id(300), categoryId: id(200), properties: { p1: "a" } }, [definition(1, "text"), { ...definition(2, "text"), key: "p1" }])).toMatchObject({ set: {}, conflicts: [expect.objectContaining({ code: "INVALID_CANONICAL_SCHEMA" })] });
  });

  it("prepares actor-scoped tag labels while shared definitions contain no private options", () => {
    const input = { ...category, userId: null, isSystem: true, propertySchema: { tags: { id: id(1), label: "태그", type: "tags", required: false, system: false } } };
    const rows = [{ _id: id(300), categoryId: id(200), userId: id(201), properties: { tags: ["React", "react", " React ", "React"] } }, { _id: id(301), categoryId: id(200), userId: id(202), properties: { tags: ["B private"] } }];
    const result = prepareCategory(input, rows);
    expect(result.conflicts).toEqual([]);
    expect(result.definitions[0]?.config).toEqual({ legacyFreeformTags: true, options: [] });
    expect(result.optionRegistrations.map(({ userId, rawLabel }) => ({ userId, rawLabel }))).toEqual([{ userId: id(201), rawLabel: " React " }, { userId: id(201), rawLabel: "React" }, { userId: id(201), rawLabel: "react" }, { userId: id(202), rawLabel: "B private" }]);
    expect(prepareCategory(input, rows)).toEqual(result);
    const fn = (api as unknown as { canonicalCareerTagOptionId: (userId: string, categoryId: string, propertyId: string, label: string) => string }).canonicalCareerTagOptionId;
    expect(result.optionRegistrations.find(option => option.rawLabel === "React")?.optionId).toBe(fn(id(201), id(200), id(1), "React"));
    expect(JSON.stringify(result.set)).not.toContain("B private");
  });

  it("preserves explicit canonical IDs and option metadata in the scoped ledger plan", () => {
    const input = { ...category, propertySchema: { tags: { id: id(1), label: "태그", type: "tags", required: false, system: false, config: { options: [{ id: id(100), label: " A ", color: "red" }] } } } };
    const result = prepareCategory(input, [{ _id: id(300), categoryId: id(200), properties: { tags: [" A ", "B"] } }]);
    expect(result.conflicts).toEqual([]);
    expect(result.definitions[0]?.config).toEqual({ legacyFreeformTags: true, options: [] });
    expect(result.optionRegistrations[0]).toEqual({ userId: id(201), categoryId: id(200), propertyId: id(1), optionId: id(100), rawLabel: " A ", metadata: { color: "red" } });
  });

  it("retains explicit unused tag options in the custom owner's ledger plan", () => {
    const input = { ...category, propertySchema: { tags: { id: id(1), label: "태그", type: "tags", required: false, system: false, config: { options: [{ id: id(100), label: " unused ", color: "blue" }] } } } };
    const result = prepareCategory(input);
    expect(result.conflicts).toEqual([]);
    expect(result.optionRegistrations).toEqual([{ userId: id(201), categoryId: id(200), propertyId: id(1), optionId: id(100), rawLabel: " unused ", metadata: { color: "blue" } }]);
    expect(result.definitions[0]?.config).toEqual({ legacyFreeformTags: true, options: [] });
  });
  it("reports owner mismatch and corrupt system ownership before producing metadata", () => {
    const input = { ...category, propertySchema: { tags: { id: id(1), label: "태그", type: "tags", required: false, system: false } } };
    const foreign = prepareCategory(input, [{ _id: id(300), categoryId: id(200), userId: id(202), properties: { tags: ["foreign"] } }]);
    expect(foreign.set).toEqual({}); expect(foreign.optionRegistrations).toEqual([]);
    expect(foreign.conflicts).toContainEqual(expect.objectContaining({ code: "CATEGORY_RECORD_OWNER_MISMATCH" }));
    expect(prepareCategory({ ...input, isSystem: true }).conflicts).toContainEqual(expect.objectContaining({ code: "INVALID_CATEGORY_OWNER_SCOPE" }));
  });

  it("reports ambiguous existing canonical UUIDs rather than deriving labels from stale properties", () => {
    const input = { ...category, propertySchema: { tags: { id: id(1), label: "태그", type: "tags", required: false, system: false } } };
    const result = prepareCategory(input, [{ _id: id(300), categoryId: id(200), properties: { tags: ["stale"] }, propertyValues: [{ propertyDefinitionId: id(1), type: "multi_select", value: [id(100)] }] }]);
    expect(result.set).toEqual({});
    expect(result.conflicts).toContainEqual(expect.objectContaining({ code: "CANONICAL_TAG_OPTION_LABEL_MISSING" }));
  });

  it("does not alter existing canonical shared definitions while planning actor options", () => {
    const definitions = [definition(1, "multi_select", { legacyFreeformTags: true, options: [] })];
    const input = { ...category, userId: null, isSystem: true, propertySchemaV2: definitions, schemaVersion: 5 };
    const result = prepareCategory(input, [{ _id: id(300), categoryId: id(200), properties: { p1: ["private"] } }]);
    expect(result.set).toEqual({}); expect(result.definitions).toEqual(definitions);
    expect(result.optionRegistrations).toEqual([{ userId: id(201), categoryId: id(200), propertyId: id(1), optionId: expect.any(String), rawLabel: "private" }]);
  });

  it("preserves explicit canonical tag mappings without reading stale physical labels", () => {
    const input = { ...category, propertySchema: { tags: { id: id(1), label: "태그", type: "tags", required: false, system: false, config: { options: [{ id: id(100), label: " A ", color: "red" }] } } } };
    const result = prepareCategory(input, [{ _id: id(300), categoryId: id(200), properties: { tags: ["stale private label"] }, propertyValues: [{ propertyDefinitionId: id(1), type: "multi_select", value: [id(100)] }] }]);
    expect(result.conflicts).toEqual([]);
    expect(result.optionRegistrations).toEqual([{ userId: id(201), categoryId: id(200), propertyId: id(1), optionId: id(100), rawLabel: " A ", metadata: { color: "red" } }]);
    expect(JSON.stringify(result)).not.toContain("stale private label");
  });

  it("rejects BSON class values masquerading as properties objects", () => {
    expect(prepareRecord({ _id: id(300), categoryId: id(200), properties: new Date("2026-10-09T00:00:00Z") }, [])).toMatchObject({ set: {}, conflicts: [expect.objectContaining({ code: "INVALID_LEGACY_PROPERTIES" })] });
  });
  it.each(["key","id"])("diagnoses existing tombstone %s collisions without a repair plan", kind => {
    const first={...definition(1,"text"),deletedAt:"2026-10-09T00:00:00.000Z"};
    const second={...definition(2,"text"),...(kind==="key"?{key:first.key}:{id:first.id})};
    const input={...category,propertySchemaV2:[first,second],schemaVersion:1};
    const before=JSON.stringify(input),result=prepareCategory(input);
    expect(result.set).toEqual({});
    expect(result.conflicts).toContainEqual(expect.objectContaining({code:"DUPLICATE_CANONICAL_DEFINITION"}));
    expect(JSON.stringify(input)).toBe(before);
  });
});