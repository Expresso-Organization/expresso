import { describe, expect, it } from "vitest";
import { Decimal128 } from "mongodb";
import type { CareerBusinessPropertyValue, CareerPropertyDefinitionV2 } from "@expresso/contracts";
import * as api from "./index.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const definition = (n: number, type: CareerPropertyDefinitionV2["type"]): CareerPropertyDefinitionV2 => ({ id: id(n), key: `p${n}`, name: `p${n}`, type, required: false, system: false, config: {}, order: n, version: 1, deletedAt: null });
function project(definitions: readonly CareerPropertyDefinitionV2[], values: readonly CareerBusinessPropertyValue[]) {
  const fn = (api as unknown as { projectCanonicalCareerProductProperties?: (definitions: readonly CareerPropertyDefinitionV2[], values: readonly CareerBusinessPropertyValue[]) => Record<string, unknown> }).projectCanonicalCareerProductProperties;
  expect(fn).toBeTypeOf("function");
  return fn!(definitions, values);
}

describe("canonical Career product display projection", () => {
  it("projects all eleven business types without losing decimal scale or datetime precision", () => {
    const types = ["text", "number", "checkbox", "select", "multi_select", "date", "url", "email", "phone", "file", "media"] as const;
    const values: CareerBusinessPropertyValue[] = [
      { propertyDefinitionId: id(1), type: "text", value: " note " },
      { propertyDefinitionId: id(2), type: "number", value: "12345678901234567890.123400" },
      { propertyDefinitionId: id(3), type: "checkbox", value: false },
      { propertyDefinitionId: id(4), type: "select", value: null },
      { propertyDefinitionId: id(5), type: "multi_select", value: [id(100)] },
      { propertyDefinitionId: id(6), type: "date", value: { precision: "datetime", start: "2026-10-09T12:34:56.123456789+09:00", end: null, timezone: "Asia/Seoul" } },
      { propertyDefinitionId: id(7), type: "url", value: "https://example.com" },
      { propertyDefinitionId: id(8), type: "email", value: "a@example.com" },
      { propertyDefinitionId: id(9), type: "phone", value: "+82 10-1234" },
      { propertyDefinitionId: id(10), type: "file", value: [id(101)] },
      { propertyDefinitionId: id(11), type: "media", value: [id(102)] },
    ];
    expect(project(types.map((type, n) => definition(n + 1, type)), values)).toEqual({
      p1: { type: "text", value: " note " }, p2: { type: "number", value: "12345678901234567890.123400" },
      p3: { type: "checkbox", value: false }, p4: { type: "select", value: null }, p5: { type: "multi_select", value: [id(100)] },
      p6: { type: "date", value: { precision: "datetime", start: "2026-10-09T12:34:56.123456789+09:00", end: null, timezone: "Asia/Seoul" } },
      p7: { type: "url", value: "https://example.com" }, p8: { type: "email", value: "a@example.com" }, p9: { type: "phone", value: "+82 10-1234" },
      p10: { type: "file", value: [id(101)] }, p11: { type: "media", value: [id(102)] },
    });
  });

  it("keeps missing fields absent and month/day precision intact", () => {
    expect(project([definition(1, "text"), definition(2, "date"), definition(3, "date")], [
      { propertyDefinitionId: id(2), type: "date", value: { precision: "month", start: "2026-10", end: null } },
      { propertyDefinitionId: id(3), type: "date", value: { precision: "day", start: "2026-10-09", end: "2026-10-10" } },
    ])).toEqual({ p2: { type: "date", value: { precision: "month", start: "2026-10", end: null } }, p3: { type: "date", value: { precision: "day", start: "2026-10-09", end: "2026-10-10" } } });
  });

  it("uses the strict BSON array reader and never reads physical properties", () => {
    expect(() => api.readCanonicalCareerPropertyValues({})).toThrow("CANONICAL_VALUES_NOT_PREPARED");
    expect(project([definition(1, "number")], api.readCanonicalCareerPropertyValues({ propertyValues: [{ propertyDefinitionId: id(1), type: "number", value: Decimal128.fromString("1.2300") }] }))).toEqual({ p1: { type: "number", value: "1.2300" } });
    expect(project([definition(1, "number")], [])).toEqual({});
  });

  it("rejects unknown, duplicate and mismatched canonical IDs instead of dropping values", () => {
    const text: CareerBusinessPropertyValue = { propertyDefinitionId: id(1), type: "text", value: "x" };
    expect(() => project([], [text])).toThrow("CANONICAL_DEFINITION_NOT_FOUND");
    expect(() => project([definition(1, "text")], [text, text])).toThrow("DUPLICATE_CANONICAL_VALUE");
    expect(() => project([definition(1, "number")], [text])).toThrow("CANONICAL_TYPE_MISMATCH");
    expect(() => project([definition(1, "text"), { ...definition(2, "text"), key: "p1" }], [])).toThrow("DUPLICATE_CANONICAL_DEFINITION");
  });

  it("does not turn title, relation, computed or timestamp metadata into business properties", () => {
    expect(project([definition(1, "title"), definition(2, "relation"), definition(3, "formula"), definition(4, "rollup"), definition(5, "created_time"), definition(6, "updated_time")], [])).toEqual({});
  });
  it("accepts custom timestamp date aliases while retaining their source schema types", () => {
    const value: CareerBusinessPropertyValue = { propertyDefinitionId: id(1), type: "date", value: { precision: "datetime", start: "2026-10-09T12:34:56.123456789+09:00", end: null, timezone: null } };
    expect(project([definition(1, "created_time")], [value])).toEqual({ p1: { type: "date", value: { precision: "datetime", start: "2026-10-09T12:34:56.123456789+09:00", end: null, timezone: null } } });
    expect(project([definition(1, "created_time")], [{ ...value, value: { precision: "datetime", start: "2026-10-09T12:34:56.123456789+09:00", end: null, timezone: "Asia/Seoul" } }])).toMatchObject({ p1: { value: { timezone: "Asia/Seoul" } } });
    expect(() => project([{ ...definition(1, "created_time"), system: true }], [value])).toThrow("CANONICAL_TYPE_MISMATCH");
    expect(() => project([definition(1, "created_time")], [{ ...value, value: { precision: "datetime", start: "2026-10-09T00:00:00Z", end: "2026-10-10T00:00:00Z", timezone: null } }])).toThrow("CANONICAL_TYPE_MISMATCH");
    expect(() => project([definition(1, "created_time")], [{ ...value, value: { precision: "day", start: "2026-10-09", end: null } }])).toThrow("CANONICAL_TYPE_MISMATCH");
  });
  it("reserves tombstone keys and IDs but permits duplicate display names", () => {
    const tombstone={...definition(1,"text"),deletedAt:"2026-10-09T00:00:00.000Z"};
    expect(()=>project([tombstone,{...definition(2,"text"),key:tombstone.key}],[])).toThrow("DUPLICATE_CANONICAL_DEFINITION");
    expect(()=>project([tombstone,{...definition(2,"text"),id:tombstone.id}],[])).toThrow("DUPLICATE_CANONICAL_DEFINITION");
    expect(project([tombstone,{...definition(2,"text"),name:tombstone.name}],[])).toEqual({});
  });
});