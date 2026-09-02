import { CareerPropertyDefinitionV2Schema, CareerPropertySchemaChangeSchema, CareerPropertyValueV2Schema } from "@expresso/contracts";
import { describe, expect, it } from "vitest";
import { convertCareerPropertyValue } from "./property-schema.js";

const propertyId = "00000000-0000-4000-8000-000000000001";
const optionId = "00000000-0000-4000-8000-000000000002";

describe("career property schema v2", () => {
  it("strictly parses every property definition and value family", () => {
    const values = [
      { type: "title", value: "제목" }, { type: "text", value: "본문" }, { type: "number", value: 42 },
      { type: "select", value: optionId }, { type: "multi_select", value: [optionId] },
      { type: "date", value: { start: "2026-09-01", end: null, timezone: null } },
      { type: "checkbox", value: true }, { type: "url", value: "https://example.com" },
      { type: "email", value: "user@example.com" }, { type: "phone", value: "+82-10-0000-0000" },
      { type: "file", value: [optionId] }, { type: "media", value: [optionId] },
      { type: "relation", value: [{ recordId: optionId, title: "연결" }] },
      { type: "formula", value: 42, diagnostics: [] }, { type: "rollup", value: ["A"], diagnostics: [] },
      { type: "created_time", value: "2026-09-01T00:00:00.000Z" }, { type: "updated_time", value: "2026-09-01T00:00:00.000Z" },
    ];
    for (const [order, value] of values.entries()) {
      expect(CareerPropertyValueV2Schema.parse(value)).toEqual(value);
      expect(CareerPropertyDefinitionV2Schema.parse({ id: propertyId, key: `field_${order}`, name: String(value.type), type: value.type, required: false, system: false, config: {}, order, version: 1, deletedAt: null }).type).toBe(value.type);
    }
    expect(() => CareerPropertyValueV2Schema.parse({ type: "number", value: "42" })).toThrow();
  });

  it("uses an explicit conversion matrix and reports loss or unmapped input", () => {
    expect(convertCareerPropertyValue("42", "text", "number")).toEqual({ value: 42, kind: "safe" });
    expect(convertCareerPropertyValue("unknown", "text", "number")).toEqual({ kind: "unmapped" });
    expect(convertCareerPropertyValue(true, "checkbox", "number")).toEqual({ value: 1, kind: "safe" });
    expect(convertCareerPropertyValue(2, "number", "checkbox")).toEqual({ value: true, kind: "lossy" });
    expect(convertCareerPropertyValue(optionId, "select", "multi_select")).toEqual({ value: [optionId], kind: "safe" });
    expect(convertCareerPropertyValue([optionId, propertyId], "multi_select", "select")).toEqual({ value: optionId, kind: "lossy" });
    expect(convertCareerPropertyValue("2026-09", "text", "date")).toEqual({ value: { start: "2026-09-01", end: null, timezone: null }, kind: "lossy" });
    expect(convertCareerPropertyValue(["a", "b"], "multi_select", "text")).toEqual({ value: "a, b", kind: "lossy" });
    expect(convertCareerPropertyValue([optionId], "file", "media")).toEqual({ value: [optionId], kind: "safe" });
    expect(convertCareerPropertyValue(optionId, "relation", "text")).toEqual({ kind: "unmapped" });
  });

  it("accepts every mutation kind and rejects unknown fields", () => {
    for (const change of [{ kind: "reorder", propertyId, order: 0 }, { kind: "rename", propertyId, name: "이름" }, { kind: "delete", propertyId }, { kind: "restore", propertyId }, { kind: "type-change", propertyId, type: "text" }, { kind: "configure", propertyId, config: { source: "1" } }]) expect(CareerPropertySchemaChangeSchema.parse(change)).toEqual(change);
    expect(() => CareerPropertySchemaChangeSchema.parse({ kind: "delete", propertyId, force: true })).toThrow();
  });
});
