import { describe, expect, it } from "vitest";

import { CareerError } from "./errors.js";
import { validateCareerProperties } from "./properties.js";
import { computeSkillAggregate, normalizeSkillName } from "./skills.js";

describe("career property validation", () => {
  const definition = (id: number, key: string, type: "text" | "number" | "date" | "multi_select" | "formula" | "created_time", required = false) => ({ id: `00000000-0000-4000-8000-00000000000${id}`, key, name: key, type, required, system: false, config: {}, order: id, version: 1, deletedAt: null });
  const definitions = [definition(1, "role", "text", true), definition(2, "impact", "number"), definition(3, "month", "date"), definition(4, "tools", "multi_select")];

  it("accepts typed values and rejects unknown, missing, mismatched, or deleted properties", () => {
    expect(() => validateCareerProperties(definitions, {
      role: { type: "text", value: "Backend engineer" },
      impact: { type: "number", value: 42 },
      month: { type: "date", value: { start: "2026-08-01", end: null, timezone: null } },
      tools: { type: "multi_select", value: ["00000000-0000-4000-8000-000000000099"] },
    })).not.toThrow();
    expect(() => validateCareerProperties(definitions, { impact: { type: "number", value: 42 } })).toThrow(CareerError);
    expect(() => validateCareerProperties(definitions, { role: { type: "text", value: "x" }, impact: { type: "text", value: "42" } })).toThrow(CareerError);
    expect(() => validateCareerProperties(definitions, { role: { type: "text", value: "x" }, unknown: { type: "checkbox", value: true } })).toThrow(CareerError);
    expect(() => validateCareerProperties([...definitions.slice(0, 1), { ...definitions[1]!, deletedAt: "2026-09-01T00:00:00.000Z" }], { role: { type: "text", value: "x" }, impact: { type: "number", value: 1 } })).toThrow(CareerError);
  });

  it("keeps computed fields read-only", () => {
    expect(() => validateCareerProperties([definition(5, "formula", "formula")], { formula: { type: "formula", value: 1, diagnostics: [] } })).toThrow(CareerError);
    const timestamp = definition(6, "timestamp", "created_time");
    expect(() => validateCareerProperties([timestamp], { timestamp: { type: "created_time", value: "2026-09-01T00:00:00.000Z" } })).not.toThrow();
    expect(() => validateCareerProperties([{ ...timestamp, system: true }], { timestamp: { type: "created_time", value: "2026-09-01T00:00:00.000Z" } })).toThrow(CareerError);
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
