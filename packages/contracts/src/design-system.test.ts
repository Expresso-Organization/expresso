import { describe, expect, it } from "vitest";

import {
  DesignReferenceSourceSchema,
  DesignSystemSpecV2Schema,
  FontTokenSchema,
  ReferenceLockSchema,
} from "./design-system.js";

describe("design system contracts", () => {
  it("v2 디자인과 v1 ReferenceLock 판만 받는다", () => {
    expect(DesignSystemSpecV2Schema.shape.version.safeParse(1).success).toBe(false);
    expect(DesignSystemSpecV2Schema.shape.version.safeParse(2).success).toBe(true);
    expect(ReferenceLockSchema.shape.version.safeParse(2).success).toBe(false);
    expect(ReferenceLockSchema.shape.version.safeParse(1).success).toBe(true);
  });

  it("알 수 없는 필드와 CSS를 깨는 서체 값을 거부한다", () => {
    expect(FontTokenSchema.safeParse({
      family: "Inter",
      fallback: "sans-serif",
      role: "본문",
      extra: true,
    }).success).toBe(false);
    expect(FontTokenSchema.safeParse({
      family: "Inter; color:red",
      fallback: "sans-serif",
      role: "본문",
    }).success).toBe(false);
  });

  it("출처 URL은 http와 https만 받는다", () => {
    const source = {
      name: "Reference",
      capturedAt: null,
      signal: "넓은 여백",
      attribution: null,
    };
    expect(DesignReferenceSourceSchema.safeParse({
      ...source,
      url: "https://example.com/design",
    }).success).toBe(true);
    expect(DesignReferenceSourceSchema.safeParse({
      ...source,
      url: "javascript:alert(1)",
    }).success).toBe(false);
    expect(DesignReferenceSourceSchema.safeParse({
      ...source,
      url: "file:///tmp/design.html",
    }).success).toBe(false);
  });
});
