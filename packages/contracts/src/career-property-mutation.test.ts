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
  it("publishes component definitions from the same Zod contract without product paths",()=>{
    const {$schema:_dialect,...expected}=z.toJSONSchema(CareerPropertyMutationCommitSchema,{target:"draft-2020-12",io:"input"});
    expect(careerPropertyMutationOpenApiComponents.CareerPropertyMutationCommit).toEqual(expected);
    expect(careerPropertyMutationOpenApiComponents).not.toHaveProperty("paths");
  });
});
