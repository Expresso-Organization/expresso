import { describe, expect, it } from "vitest";
import { Decimal128 } from "mongodb";
import {readCanonicalCareerPropertyValues} from "./career-canonical-values.js";

describe("canonical business read boundary", () => {
  it("preserves Decimal128 scale and refuses to reconstruct missing values from legacy properties", async () => {

    expect(readCanonicalCareerPropertyValues).toBeDefined();
    const propertyDefinitionId = "00000000-0000-4000-8000-000000000011";
    const value = { propertyDefinitionId, type: "number", value: Decimal128.fromString("12345678901234567890.123400") };
    const populated: Parameters<typeof readCanonicalCareerPropertyValues>[0] & { properties: Record<string, unknown> } = { propertyValues: [value], properties: { bad: 99 } };
    const missing: typeof populated = { properties: { bad: 99 } };
    const empty: typeof populated = { propertyValues: [], properties: { bad: 99 } };
    expect(readCanonicalCareerPropertyValues(populated)).toEqual([{ ...value, value: "12345678901234567890.123400" }]);
    expect(() => readCanonicalCareerPropertyValues(missing)).toThrow();
    expect(readCanonicalCareerPropertyValues(empty)).toEqual([]);
  });
});
