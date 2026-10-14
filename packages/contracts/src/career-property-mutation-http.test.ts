import { describe, expect, it } from "vitest";
import { CareerPropertyMutationScopeSchema, CareerPropertyMutationServiceClaimsSchema,
  CareerPropertyMutationReceiptRequestSchema, CareerPropertyMutationReadRequestSchema } from "./career-property-mutation-http.js";
const scope={userId:"00000000-0000-4000-8000-000000000002",mutationId:"00000000-0000-4000-8000-000000000003",recordId:"00000000-0000-4000-8000-000000000004",operationFingerprint:"a".repeat(64)};
describe("property mutation HTTP scope",()=>{
  it("accepts a fully bound dedicated audience and rejects producer/session extras",()=>{
    expect(CareerPropertyMutationScopeSchema.parse(scope)).toEqual(scope);
    expect(CareerPropertyMutationServiceClaimsSchema.parse({...scope,audience:"career-property-mutation",expiresAt:"2026-10-09T00:01:00.000Z"})).toMatchObject(scope);
    for(const value of [{...scope,audience:"career-producer",expiresAt:"2026-10-09T00:01:00.000Z"},{...scope,userId:"unknown"},{...scope,producer:"interview"}])
      expect(CareerPropertyMutationServiceClaimsSchema.safeParse(value).success).toBe(false);
  });
  it("requires a lease only for read and keeps user identity out of request bodies",()=>{
    const {userId,...receipt}=scope;
    expect(CareerPropertyMutationReceiptRequestSchema.parse(receipt)).toEqual(receipt);
    expect(CareerPropertyMutationReceiptRequestSchema.safeParse(scope).success).toBe(false);
    expect(CareerPropertyMutationReadRequestSchema.safeParse(receipt).success).toBe(false);
    expect(CareerPropertyMutationReadRequestSchema.parse({...receipt,leaseToken:scope.userId})).toMatchObject(receipt);
  });
});