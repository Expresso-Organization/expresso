import type { CareerPropertyDefinitionV2, CareerRecord } from "@expresso/contracts";
import { describe, expect, it } from "vitest";

import { propertyValueForDefinition, replaceCanonicalPropertyValue } from "./canonical-property-values";

const definition: CareerPropertyDefinitionV2 = {
  id: "00000000-0000-4000-8000-000000000001",
  key: "salary",
  name: "급여",
  type: "number",
  required: false,
  system: true,
  config: {},
  order: 1,
  version: 1,
  deletedAt: null,
};
const otherId = "00000000-0000-4000-8000-000000000002";
const base: CareerRecord = {
  id: "00000000-0000-4000-8000-000000000010",
  categoryId: "00000000-0000-4000-8000-000000000020",
  title: "",
  status: "draft",
  origin: "manual",
  properties: { salary: { type: "number", value: 99 } },
  propertyValues: [],
  bodyMd: "",
  version: 1,
  updatedAt: "2026-09-09T00:00:00.000Z",
};

describe("canonical propertyValues helper", () => {
  it("treats an empty canonical snapshot as empty instead of falling back to legacy", () => {
    expect(propertyValueForDefinition(base, definition)).toBeNull();
  });

  it("replaces one value while preserving every other canonical value exactly", () => {
    const record = { ...base, propertyValues: [{ propertyDefinitionId: otherId, type: "date" as const, value: { precision: "month" as const, start: "2026-01", end: "2026-03" } }] };
    expect(replaceCanonicalPropertyValue(record, definition, { type: "number", value: "123.4500" })).toEqual([
      record.propertyValues[0],
      { propertyDefinitionId: definition.id, type: "number", value: "123.4500" },
    ]);
  });

  it("deletes only the selected Definition value", () => {
    const record = { ...base, propertyValues: [
      { propertyDefinitionId: definition.id, type: "number" as const, value: "123.4500" },
      { propertyDefinitionId: otherId, type: "text" as const, value: "유지" },
    ] };
    expect(replaceCanonicalPropertyValue(record, definition, null)).toEqual([record.propertyValues[1]]);
  });
});
