import { randomUUID,createHmac } from "node:crypto";
import { describe,it,expect } from "vitest";
import * as Career from "./index.js";
import type { MongoContext } from "../../platform/mongodb.js";
import { CareerProducerScopeSchema, CareerProducerServiceClaimsSchema } from "@expresso/contracts";
describe("prepared service credential",()=>{
 it("signs operation-scoped short-lived expi independently of sessions",()=>{
  expect(Career.createCareerProducerCredential).toBeTypeOf("function");
  const scope={producer:"interview" as const,userId:randomUUID(),sourceId:randomUUID(),operationId:randomUUID(),fingerprint:"a".repeat(64)};
  const key=Buffer.alloc(32,7),token=Career.createCareerProducerCredential(scope,key);
  const [prefix,payload,signature]=token.split(".");
  expect(prefix).toBe("expi");
  expect(signature).toBe(createHmac("sha256",key).update(payload!).digest("base64url"));
  expect(CareerProducerServiceClaimsSchema.parse(JSON.parse(Buffer.from(payload!,"base64url").toString()))).toMatchObject({...scope,audience:"career-producer"});
  expect(()=>Career.createCareerProducerCredential(scope,Buffer.alloc(4))).toThrow();
 });
});
describe("prepared Spring transport",()=>{
 const input={producer:"ai-proposal" as const,userId:randomUUID(),sourceId:randomUUID(),operationId:randomUUID(),business:{kind:"patch" as const,recordId:randomUUID(),expectedVersion:1,expectedCategoryVersion:1,patches:[{title:"제목"}]},document:null};
 const intent=Career.createCareerProducerIntent(input),request={...CareerProducerScopeSchema.parse(intent),leaseToken:randomUUID()};
 const context={db:{collection:()=>({findOne:async()=>({writerIntegration:intent})})}} as unknown as MongoContext;
 const data={id:input.business.recordId,userId:input.userId,categoryId:randomUUID(),title:"제목",propertyValues:[],status:"draft",version:2,updatedAt:new Date().toISOString()};
 it("sends scoped immutable operation and If-Match while validating ETag",async()=>{
  const port=Career.createSpringCareerProducerPort(context,"http://127.0.0.1:8080",scope=>Career.createCareerProducerCredential(scope,Buffer.alloc(32,2)),async(url,init)=>{
   expect(url).toBe("http://127.0.0.1:8080/internal/career/integration/business");
   expect((init.headers as Record<string,string>)["if-match"]).toBe('"v1"');
   expect(JSON.parse(init.body as string)).toEqual(request);
   return new Response(JSON.stringify({data,replayed:false}),{status:200,headers:{etag:'"v2"'}});
  });
  expect(await port.commit(request)).toEqual({data,replayed:false});
 });
 it("rejects credential failures, scoped response drift and leaking remote error details",async()=>{
  const credential=Career.createSpringCareerProducerPort(context,"http://127.0.0.1",()=>{throw new Error("secret-value");},async()=>{throw new Error("must not call");});
  await expect(credential.commit(request)).rejects.toThrow("service credential unavailable");
  const fail=Career.createSpringCareerProducerPort(context,"http://127.0.0.1",s=>Career.createCareerProducerCredential(s,Buffer.alloc(32,2)),async()=>new Response("secret-value",{status:403}));
  await expect(fail.commit(request)).rejects.toMatchObject({statusCode:403,message:"Spring producer command rejected"});
  const wrong=Career.createSpringCareerProducerPort(context,"http://127.0.0.1",s=>Career.createCareerProducerCredential(s,Buffer.alloc(32,2)),async()=>new Response(JSON.stringify({data:{...data,userId:randomUUID()},replayed:false}),{status:200,headers:{etag:'"v2"'}}));
  await expect(wrong.commit(request)).rejects.toThrow("scope");
  const etag=Career.createSpringCareerProducerPort(context,"http://127.0.0.1",s=>Career.createCareerProducerCredential(s,Buffer.alloc(32,2)),async()=>new Response(JSON.stringify({data,replayed:false}),{status:200,headers:{etag:'"v3"'}}));
  await expect(etag.commit(request)).rejects.toThrow("ETag");
 });
});