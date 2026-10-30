import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { CareerPropertyDefinitionV2, CareerPropertyMutationPlan } from "@expresso/contracts";
import { prepareCareerPropertyOptionSnapshot, readCareerPropertyOptionSnapshot } from "@expresso/database";
import * as api from "./canonical-property-mutation-policy.js";
const id = randomUUID(), scope = { userId: randomUUID(), categoryId: randomUUID() };
const base: CareerPropertyDefinitionV2 = { id, key: "custom", name: "custom", type: "created_time", system: false, required: false, config: {}, order: 0, version: 1, deletedAt: null };
describe("effective immutable mutation policy", () => {
  it.each(["created_time", "updated_time"] as const)("projects only custom %s to canonical date without changing raw provenance", (type) => {
    const target = { ...base, type }, source = { ...target, version: 2, deletedAt: "2026-10-09T00:00:00.000Z" };
    const plan: CareerPropertyMutationPlan = { kind: "restoration", source, target, defaultValue: null, confirmLossy: false };
    expect(api.effectiveCanonicalMutationOperation).toBeTypeOf("function");
    const effective = api.effectiveCanonicalMutationOperation(plan, [], scope);
    expect(effective.source?.type).toBe("date"); expect(effective.target.type).toBe("date");
    expect(plan).toEqual({ kind: "restoration", source, target, defaultValue: null, confirmLossy: false });
    expect(api.effectiveCanonicalMutationDefinition({ ...target, system: true }, [], scope).type).toBe(type);
  });
  it("uses frozen private IDs for source and target while preserving exact raw configuration", () => {
    const source = { ...base, type: "multi_select" as const, config: { options: [], legacyFreeformTags: true } };
    const target = { ...source, type: "select" as const, version: 2 }, optionId = randomUUID();
    const snapshot = prepareCareerPropertyOptionSnapshot([{ _id: randomUUID(), ...scope, propertyId: id, optionId, rawLabel: " A ", version: 1, createdAt: new Date(0) }], scope, [source]);
    const policy = readCareerPropertyOptionSnapshot({ ...scope, propertyId: id, ...snapshot }, [source]);
    const raw: CareerPropertyMutationPlan = { kind: "conversion", source, target, defaultValue: null, confirmLossy: false };
    const result = api.effectiveCanonicalMutationOperation(raw, policy, scope);
    expect(result.target.config.options).toEqual([{ id: optionId, name: " A ", label: " A " }]);
    expect(result.source?.config.options).toEqual(result.target.config.options);
    expect(raw.target.config.options).toEqual([]);
  });
});