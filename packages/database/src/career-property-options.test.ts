import { describe, expect, it } from "vitest";
import type { CareerPropertyDefinitionV2 } from "@expresso/contracts";
import * as api from "./index.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope = { userId: id(201), categoryId: id(200) };
const definitions: CareerPropertyDefinitionV2[] = [{ id: id(1), key: "tags", name: "태그", type: "multi_select", required: false, system: false, config: { legacyFreeformTags: true, options: [] }, order: 0, version: 1, deletedAt: null }];
function overlay(rows: unknown[], actor = scope) {
  const fn = (api as unknown as { overlayCareerPropertyOptions?: (definitions: readonly CareerPropertyDefinitionV2[], options: readonly unknown[], scope: typeof actor) => CareerPropertyDefinitionV2[] }).overlayCareerPropertyOptions;
  expect(fn).toBeTypeOf("function"); return fn!(definitions, rows, actor);
}
const option = (userId: string, label: string, optionId = id(101)) => ({ _id: id(100), userId, categoryId: id(200), propertyId: id(1), optionId, rawLabel: label, version: 1 as const, createdAt: new Date("2026-10-09T00:00:00Z") });

describe("actor-scoped Career option definition overlay", () => {
  it("keeps precise raw labels and canonical UUIDs without modifying shared definitions", () => {
    const before = structuredClone(definitions);
    expect(overlay([option(scope.userId, " React ")])[0]?.config).toEqual({ legacyFreeformTags: true, options: [{ id: id(101), label: " React ", name: " React " }] });
    expect(definitions).toEqual(before);
  });
  it("rejects another actor's or category's rows before exposing any label", () => {
    expect(() => overlay([option(id(202), "B private")])).toThrow("CAREER_OPTION_SCOPE_MISMATCH");
    expect(() => overlay([{ ...option(scope.userId, "A private"), categoryId: id(203) }])).toThrow("CAREER_OPTION_SCOPE_MISMATCH");
  });
  it("reports UUID/label collisions rather than choosing one option", () => {
    expect(() => overlay([option(scope.userId, "A"), { ...option(scope.userId, "B"), _id: id(102) }])).toThrow("CAREER_OPTION_MAPPING_CONFLICT");
    expect(() => overlay([option(scope.userId, "A"), { ...option(scope.userId, "A", id(102)), _id: id(103) }])).toThrow("CAREER_OPTION_MAPPING_CONFLICT");
  });
  it("preserves existing name-shaped options and supplies private names for the existing product UI", () => {
    const source = [{ ...definitions[0]!, config: { legacyFreeformTags: true, options: [{ id: id(102), name: " Common " }] } }];
    expect(api.overlayCareerPropertyOptions(source, [option(scope.userId, " Private ")], scope)[0]?.config.options).toEqual([{ id: id(102), name: " Common " }, { id: id(101), label: " Private ", name: " Private " }]);
    expect(source[0]?.config.options).toEqual([{ id: id(102), name: " Common " }]);
    expect(() => api.overlayCareerPropertyOptions([{ ...source[0]!, config: { options: [{ id: id(102), name: "A", label: "B" }] } }], [option(scope.userId, " Private ")], scope)).toThrow("CAREER_OPTION_MAPPING_CONFLICT");
  });
  it("uses user/category/property/raw label scopes for deterministic IDs", () => {
    const fn = (api as unknown as { canonicalCareerTagOptionId: (userId: string, categoryId: string, propertyId: string, label: string) => string }).canonicalCareerTagOptionId;
    expect(fn(scope.userId, scope.categoryId, id(1), " React ")).toMatch(/^[0-9a-f-]{36}$/);
    expect(fn(scope.userId, scope.categoryId, id(1), " React ")).toBe(fn(scope.userId, scope.categoryId, id(1), " React "));
    expect(fn(id(202), scope.categoryId, id(1), " React ")).not.toBe(fn(scope.userId, scope.categoryId, id(1), " React "));
    expect(fn(scope.userId, scope.categoryId, id(1), "React")).not.toBe(fn(scope.userId, scope.categoryId, id(1), " React "));
  });
});