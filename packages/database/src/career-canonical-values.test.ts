import { describe, expect, it } from "vitest";
import { Decimal128 } from "mongodb";

describe("canonical business read boundary", () => {
  it("preserves Decimal128 scale and refuses to reconstruct missing values from legacy properties", async () => {
    const path = "./career-canonical-values.js"; const api = await import(path).catch(() => ({}));
    expect(api.readCanonicalCareerPropertyValues).toBeDefined();
    const propertyDefinitionId = "00000000-0000-4000-8000-000000000011";
    const value = { propertyDefinitionId, type: "number", value: Decimal128.fromString("12345678901234567890.123400") };
    expect(api.readCanonicalCareerPropertyValues({ propertyValues: [value], properties: { bad: 99 } })).toEqual([{ ...value, value: "12345678901234567890.123400" }]);
    expect(() => api.readCanonicalCareerPropertyValues({ properties: { bad: 99 } })).toThrow();
    expect(api.readCanonicalCareerPropertyValues({ propertyValues: [], properties: { bad: 99 } })).toEqual([]);
  });
});
