import { describe,expect,it } from "vitest";
import { CareerPropertyMutationStatusResponseSchema,CareerResumePropertyMutationSchema } from "./career-property-mutation-status.js";
const data={id:"00000000-0000-4000-8000-000000000001",categoryId:"00000000-0000-4000-8000-000000000002",propertyId:"00000000-0000-4000-8000-000000000003",status:"failed",active:true,processedCount:1,totalCount:2,retryable:true,updatedAt:"2026-10-09T00:00:00Z",completedAt:null};
describe("public mutation status boundaries",()=>{
 it("accepts explicit resume with no client-supplied owner or fingerprint",()=>{
  expect(CareerResumePropertyMutationSchema.parse({})).toEqual({});
  expect(CareerResumePropertyMutationSchema.safeParse({userId:data.id}).success).toBe(false);
 });
 it("excludes immutable plan/owner and internal error details from public status",()=>{
  expect(CareerPropertyMutationStatusResponseSchema.safeParse({data}).success).toBe(true);
  expect(CareerPropertyMutationStatusResponseSchema.safeParse({data:{...data,userId:data.id,operationFingerprint:"f".repeat(64)}}).success).toBe(false);
 });
 it("rejects progress and retry metadata that disagree",()=>{
  expect(CareerPropertyMutationStatusResponseSchema.safeParse({data:{...data,processedCount:3}}).success).toBe(false);
  expect(CareerPropertyMutationStatusResponseSchema.safeParse({data:{...data,status:"running"}}).success).toBe(false);
 });
});
