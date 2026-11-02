import { describe,it,expect } from "vitest";
import * as Career from "./index.js";
import { randomUUID } from "node:crypto";
describe("prepared producer immutable intent",()=>{
 it("binds exact business/doc payloads without storing any credential",()=>{
  expect(Career.createCareerProducerIntent).toBeTypeOf("function");
  const input={producer:"ai-proposal" as const,userId:randomUUID(),sourceId:randomUUID(),operationId:randomUUID(),business:{kind:"patch" as const,recordId:randomUUID(),expectedVersion:1,expectedCategoryVersion:1,patches:[{title:"기록"}]},document:null};
  const a=Career.createCareerProducerIntent(input),b=Career.createCareerProducerIntent(input);
  expect(a.fingerprint).toBe(b.fingerprint);
  expect(Career.careerProducerFingerprint({...a,business:{...input.business,expectedVersion:2}})).not.toBe(a.fingerprint);
  expect(a).not.toHaveProperty("sessionToken"); expect(a).not.toHaveProperty("credential");
 });
});