import { describe, expect, it } from "vitest";
import { exactOptionId } from "@expresso/database";

import { CareerError } from "./errors.js";
import { toCanonicalPropertyValues, validateCareerProperties } from "./properties.js";
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

  it("accepts matching v2 values and keeps computed fields read-only", () => {
    const propertyId = "00000000-0000-4000-8000-000000000001";
    const definitions = [{ id: propertyId, key: "rating", name: "평점", type: "number" as const, required: false, system: false, config: {}, order: 0, version: 1, deletedAt: null }];
    expect(() => validateCareerProperties({}, { rating: { type: "number", value: 4.5 } }, definitions)).not.toThrow();
    expect(() => validateCareerProperties({}, { rating: { type: "text", value: "4.5" } }, definitions)).toThrow(CareerError);
    expect(() => validateCareerProperties({}, { formula: { type: "formula", value: 1, diagnostics: [] } }, [{ ...definitions[0]!, key: "formula", type: "formula" }])).toThrow(CareerError);
    const timestamp = { ...definitions[0]!, key: "timestamp", type: "created_time" as const };
    expect(() => validateCareerProperties({}, { timestamp: { type: "created_time", value: "2026-09-01T00:00:00.000Z" } }, [timestamp])).not.toThrow();
    expect(() => validateCareerProperties({}, { timestamp: { type: "created_time", value: "2026-09-01T00:00:00.000Z" } }, [{ ...timestamp, system: true }])).toThrow(CareerError);
  });

  it("projects legacy values with official IDs without normalizing tag text or month precision", () => {
    const categoryId = "475106fc-bf88-4a73-9c27-66c648733936";
    const definitions = [
      { id: "68f062ac-83b5-5ff6-bba4-3a8efc1d8a1a", key: "role", name: "역할", type: "text" as const, required: false, system: false, config: {}, order: 0, version: 1, deletedAt: null },
      { id: "00000000-0000-4000-8000-000000000002", key: "impact", name: "성과", type: "number" as const, required: false, system: false, config: {}, order: 1, version: 1, deletedAt: null },
      { id: "00000000-0000-4000-8000-000000000003", key: "checked", name: "확인", type: "checkbox" as const, required: false, system: false, config: {}, order: 2, version: 1, deletedAt: null },
      { id: "00000000-0000-4000-8000-000000000004", key: "tools", name: "도구", type: "multi_select" as const, required: false, system: false, config: { options: [] }, order: 3, version: 1, deletedAt: null },
      { id: "00000000-0000-4000-8000-000000000005", key: "month", name: "월", type: "date" as const, required: false, system: false, config: {}, order: 4, version: 1, deletedAt: null },
    ];
    const category = {
      _id: categoryId,
      propertySchema: schema,
      propertySchemaV2: definitions,
      propertyDefinitions: definitions,
    };

    expect(toCanonicalPropertyValues(category, {
      role: "Backend",
      impact: 42,
      checked: true,
      tools: ["Java", "java", " Java "],
      month: "2026-09",
    })).toEqual([
      { propertyDefinitionId: definitions[0]!.id, type: "text", value: "Backend" },
      { propertyDefinitionId: definitions[1]!.id, type: "number", value: 42 },
      { propertyDefinitionId: definitions[2]!.id, type: "checkbox", value: true },
      { propertyDefinitionId: definitions[3]!.id, type: "multi_select", value: ["Java", "java", " Java "].map((value) => exactOptionId(definitions[3]!.id, value)) },
      { propertyDefinitionId: definitions[4]!.id, type: "date", value: { precision: "month", start: "2026-09", end: null } },
    ]);
    expect(() => toCanonicalPropertyValues(category, { role: "Backend", tools: ["   "] })).toThrow(CareerError);
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
