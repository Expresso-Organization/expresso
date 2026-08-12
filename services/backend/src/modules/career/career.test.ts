import { describe, expect, it } from "vitest";

import { CareerError } from "./errors.js";
import { validateCareerProperties } from "./properties.js";
import { computeSkillAggregate, normalizeSkillName } from "./skills.js";

describe("career property validation", () => {
  const schema = {
    role: { label: "역할", type: "text" as const, required: true, system: false },
    impact: { label: "성과", type: "number" as const, required: false, system: false },
    month: { label: "시기", type: "date" as const, required: false, system: false },
    tools: { label: "기술", type: "tags" as const, required: false, system: false },
  };

  it("accepts the category schema and rejects unknown, missing, or invalid values", () => {
    expect(() => validateCareerProperties(schema, {
      role: "Backend engineer",
      impact: 42,
      month: "2026-08",
      tools: ["PostgreSQL"],
    })).not.toThrow();
    expect(() => validateCareerProperties(schema, { impact: 42 })).toThrow(
      CareerError,
    );
    expect(() => validateCareerProperties(schema, {
      role: "Backend engineer",
      month: "2026-08-09",
    })).toThrow(CareerError);
    expect(() => validateCareerProperties(schema, {
      role: "Backend engineer",
      unknown: true,
    })).toThrow(CareerError);
  });
});

describe("record-grounded skills", () => {
  it("normalizes aliases and computes evidence/recency based levels", () => {
    expect(normalizeSkillName("  K8s ")).toBe("kubernetes");
    expect(normalizeSkillName("Postgres")).toBe("postgresql");
    expect(
      computeSkillAggregate(
        1,
        new Date("2026-08-01T00:00:00Z"),
        new Date("2026-08-09T00:00:00Z"),
      ),
    ).toEqual({ level: 1, strength: "weak" });
    expect(
      computeSkillAggregate(
        5,
        new Date("2022-01-01T00:00:00Z"),
        new Date("2026-08-09T00:00:00Z"),
      ),
    ).toEqual({ level: 3, strength: "strong" });
    expect(() =>
      computeSkillAggregate(
        0,
        new Date("2026-08-01T00:00:00Z"),
        new Date("2026-08-09T00:00:00Z"),
      ),
    ).toThrow();
  });
});
