import { describe, expect, it } from "vitest";
import { CareerPropertyMutationCommitSchema, CareerPropertyMutationJobPlanSchema, CareerPropertyMutationPlanSchema } from "./career-property-mutation.js";
import { careerPropertyMutationOpenApiComponents } from "./career-property-mutation-openapi.js";
import { z } from "zod";

describe("inactive canonical property mutation contract", () => {
  it("requires a narrow B1 delta and immutable job/lease binding", async () => {
    const input = { mutationId: "00000000-0000-4000-8000-000000000001", recordId: "00000000-0000-4000-8000-000000000002", expectedVersion: 1,
      leaseToken: "00000000-0000-4000-8000-000000000003", operationFingerprint: "a".repeat(64), propertyValues: { set: [], unsetPropertyIds: [] } };
    expect(CareerPropertyMutationCommitSchema.parse(input)).toEqual(input);
    for (const invalid of [{ ...input, expectedVersion: 0 }, { ...input, expectedVersion: Number.MAX_SAFE_INTEGER + 1 },
      { ...input, propertyValues: [] }, { ...input, blockBody: [] }, { ...input, leaseToken: "" }]) {
      expect(CareerPropertyMutationCommitSchema.safeParse(invalid).success).toBe(false);
    }
  });
  it("binds canonical default and target to a unique immutable definition snapshot",()=>{
    const id="00000000-0000-4000-8000-000000000011";const target={id,key:"p",name:"p",type:"text",required:false,system:false,config:{},order:0,version:1,deletedAt:null};
    const operation={kind:"default",source:null,target,defaultValue:{propertyDefinitionId:id,type:"text",value:"default"},confirmLossy:false};
    const plan={userId:id,categoryId:id,categoryVersion:1,schemaVersion:1,definitions:[target],recordIds:[id],operation};
    expect(CareerPropertyMutationJobPlanSchema.safeParse(plan).success).toBe(true);
    for(const invalid of [{...plan,definitions:[]},{...plan,definitions:[target,target]},{...plan,definitions:[{...target,name:"tampered"}]},{...plan,recordIds:[id,id]}])expect(CareerPropertyMutationJobPlanSchema.safeParse(invalid).success).toBe(false);
    expect(CareerPropertyMutationPlanSchema.safeParse({...operation,defaultValue:{propertyDefinitionId:id,type:"checkbox",value:true}}).success).toBe(false);
  });
  it.each(["created_time", "updated_time"])("preserves a non-system %s alias while its default is canonical Date datetime", (type) => {
    const id = "00000000-0000-4000-8000-000000000011";
    const target = { id, key: "p", name: "p", type, required: false, system: false, config: {}, order: 0, version: 1, deletedAt: null };
    const value = { propertyDefinitionId: id, type: "date", value: { precision: "datetime", start: "2026-10-09T12:34:56.123456789+09:00", end: null, timezone: "Asia/Seoul" } };
    const operation = { kind: "default", source: null, target, defaultValue: value, confirmLossy: false };
    const plan = { userId: id, categoryId: id, categoryVersion: 1, schemaVersion: 1, definitions: [target], recordIds: [id], operation };
    expect(CareerPropertyMutationJobPlanSchema.parse(plan)).toEqual(plan);
    for (const invalid of [
      { ...operation, target: { ...target, system: true } },
      { ...operation, defaultValue: { ...value, value: { precision: "day", start: "2026-10-09", end: null } } },
      { ...operation, defaultValue: { ...value, value: { ...value.value, end: "2026-10-10T12:34:56+09:00" } } },
    ]) expect(CareerPropertyMutationPlanSchema.safeParse(invalid).success).toBe(false);
    const deleted = { ...target, version: 2, deletedAt: "2026-10-09T00:00:00Z" };
    expect(CareerPropertyMutationPlanSchema.parse({ kind: "deletion", source: target, target: deleted, defaultValue: null, confirmLossy: true }).target).toEqual(deleted);
    expect(CareerPropertyMutationPlanSchema.parse({ kind: "restoration", source: deleted, target: { ...target, version: 3 }, defaultValue: null, confirmLossy: false }).source).toEqual(deleted);
  });
  it("publishes component definitions from the same Zod contract without product paths",()=>{
    const {$schema:_dialect,...expected}=z.toJSONSchema(CareerPropertyMutationCommitSchema,{target:"draft-2020-12",io:"input"});
    expect(careerPropertyMutationOpenApiComponents.CareerPropertyMutationCommit).toEqual(expected);
    expect(careerPropertyMutationOpenApiComponents).not.toHaveProperty("paths");
  });
});
