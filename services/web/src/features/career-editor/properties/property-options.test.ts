import type { CareerPropertyDefinitionV2 } from "@expresso/contracts";
import { describe, expect, it } from "vitest";
import { canonicalDisplayValue } from "./canonical-values";
import { propertyOptions } from "./property-editors";
const id = "00000000-0000-4000-8000-000000000001";
const optionId = "00000000-0000-4000-8000-000000000002";
function definition(option: unknown): CareerPropertyDefinitionV2 {
  return { id, key: "tags", name: "Tags", type: "multi_select", required: false, system: false, config: { options: [option] }, order: 0, version: 1, deletedAt: null };
}
describe("Career option label compatibility", () => {
  it.each([{ id: optionId, name: "  Exact  " }, { id: optionId, label: "  Exact  " }, { id: optionId, label: "  Exact  ", name: "  Exact  " }])("retains original option text for editor and canonical read display", (option) => {
    const field = definition(option);
    expect(propertyOptions(field)).toEqual([{ id: optionId, name: "  Exact  " }]);
    expect(canonicalDisplayValue(field, { propertyDefinitionId: id, type: "multi_select", value: [optionId] })).toBe("  Exact  ");
  });
});