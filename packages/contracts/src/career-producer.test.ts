import { describe, expect, it } from "vitest";
import * as contract from "./index.js";
const id="00000000-0000-4000-8000-000000000001";
describe("prepared Career producer contracts",()=>{
  it("keeps commands scoped and excludes document state from business input",()=>{
    expect(contract).toHaveProperty("CareerProducerBusinessCommandSchema");
    const schema=contract.CareerProducerBusinessCommandSchema;
    expect(schema.safeParse({kind:"patch",recordId:id,expectedVersion:1,expectedCategoryVersion:1,patches:[{title:"준비"}]}).success).toBe(true);
    expect(schema.safeParse({kind:"patch",recordId:id,expectedVersion:1,expectedCategoryVersion:1,patches:[{bodyMd:"본문"}]}).success).toBe(false);
    expect(schema.safeParse({kind:"patch",recordId:id,expectedVersion:Number.MAX_SAFE_INTEGER+1,expectedCategoryVersion:1,patches:[{title:"준비"}]}).success).toBe(false);
  });
  it("shares exact selected canonical values and scoped credentials",()=>{
    expect(contract).toHaveProperty("CareerProducerSelectedPropertyChangeSchema");
    expect(contract.CareerProducerSelectedPropertyChangeSchema.parse({propertyId:id,previousValue:null,nextValue:{propertyDefinitionId:id,type:"number",value:"3.00"}}).nextValue?.value).toBe("3.00");
    expect(contract.CareerProducerServiceClaimsSchema.safeParse({producer:"ai-proposal",userId:id,sourceId:id,operationId:id,fingerprint:"a".repeat(64),audience:"career-producer",expiresAt:"2026-10-08T00:00:00.000Z",token:"secret"}).success).toBe(false);
  });
 it("adds components without adding product paths and preserves business version limits",()=>{
  const components=contract.careerProducerOpenApiComponents;
  expect(components).not.toHaveProperty("paths");
  expect(JSON.stringify(components.CareerProducerBusinessCommand)).not.toMatch(/blockBody|bodyMd|documentVersion|Yjs/);
  expect(JSON.stringify(components.CareerProducerBusinessCommand)).toContain(String(Number.MAX_SAFE_INTEGER));
  expect(components.CareerProducerCommitRequest.required).toEqual(expect.arrayContaining(["producer","userId","sourceId","operationId","fingerprint","leaseToken"]));
 });
});