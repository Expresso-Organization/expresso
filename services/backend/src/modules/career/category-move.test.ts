import { randomUUID } from "node:crypto";

import { CareerCategoryMoveCommitSchema, PreviewCareerCategoryMoveSchema } from "@expresso/contracts";
import { describe, expect, it } from "vitest";

describe("career category move contracts", () => {
  it("requires the route record, signed preview and an explicit optimistic version", () => {
    expect(PreviewCareerCategoryMoveSchema.parse({ targetCategoryId: randomUUID() }).targetCategoryId).toMatch(/-/);
    expect(() => CareerCategoryMoveCommitSchema.parse({ recordId: randomUUID(), targetCategoryId: randomUUID(), previewToken: "too-short", expectedVersion: 1 })).toThrow();
  });
});
