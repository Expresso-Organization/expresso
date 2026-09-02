import { describe, expect, it } from "vitest";

import { nextNumberedPropertyName, propertyNameBase } from "./property-name";

describe("property names", () => {
  it("uses the first available numbered name", () => {
    expect(nextNumberedPropertyName("텍스트", [
      { name: "텍스트 1", deletedAt: null },
      { name: "텍스트 2", deletedAt: "2026-09-01T00:00:00.000Z" },
      { name: "텍스트 3", deletedAt: null },
    ])).toBe("텍스트 2");
  });

  it("removes an existing numeric suffix before duplicating", () => {
    expect(propertyNameBase("성과 12")).toBe("성과");
  });
});
