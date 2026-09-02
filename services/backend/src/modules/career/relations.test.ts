import { randomUUID } from "node:crypto";

import { CareerRelationDefinitionSchema, ReplaceCareerRelationTargetsSchema } from "@expresso/contracts";
import { describe, expect, it } from "vitest";

describe("career relation contracts", () => {
  it("accepts a bounded replacement and strict relation configuration", () => {
    const propertyId = randomUUID();
    expect(ReplaceCareerRelationTargetsSchema.parse({ propertyId, targetIds: [randomUUID()] })).toEqual({ propertyId, targetIds: expect.any(Array) });
    expect(() => ReplaceCareerRelationTargetsSchema.parse({ propertyId, targetIds: [], force: true })).toThrow();
    expect(CareerRelationDefinitionSchema.parse({ targetCategoryId: randomUUID(), inversePropertyId: null, cardinality: "single", deletePolicy: "restrict" }).cardinality).toBe("single");
  });
});
