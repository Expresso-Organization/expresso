import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { Decimal128 } from "mongodb";
import { API_PREFIX,CareerPropertyMutationStatusResponseSchema,type CareerPropertyDefinitionV2 } from "@expresso/contracts";
import { mongoCollections } from "@expresso/database";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { buildApi } from "../../api/build-app.js";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import { MongoIdentityService } from "../identity/index.js";
import { CareerService } from "./service.js";
import { MongoCanonicalCareerPropertySchemaService } from "./canonical-property-schema.js";
const config:RuntimeConfig={nodeEnv:"test",host:"127.0.0.1",port:4000,logLevel:"silent",redisUrl:"redis://127.0.0.1:1",outboxPollIntervalMs:1000,outboxBatchSize:25,outboxMaxAttempts:5,queuePrefix:"b2-job-status"};
describe.skipIf(!process.env.TEST_MONGODB_URL)("owned schema mutation status/resume API",()=>{
 let fixture:Awaited<ReturnType<typeof createMongoFixture>>,app:ReturnType<typeof buildApi>,userId:string,token:string,otherToken:string,categoryId:string,mutationId:string,recordId:string;
 beforeAll(async()=>{
  fixture=await createMongoFixture("b2jobstatus");const identity=new MongoIdentityService(fixture.resource);
  userId=(await identity.signup({email:`a-${randomUUID()}@example.test`,displayName:"A",password:"disposable-job-password"})).user.id;
  const other=(await identity.signup({email:`b-${randomUUID()}@example.test`,displayName:"B",password:"disposable-job-password"})).user.id;
  token=(await identity.issueSession({userId})).accessToken;otherToken=(await identity.issueSession({userId:other})).accessToken;
  const db=mongoCollections(fixture.resource.db),now=new Date(),propertyId=randomUUID();categoryId=randomUUID();recordId=randomUUID();
  const definition:CareerPropertyDefinitionV2={id:propertyId,key:"amount",name:"Amount",type:"number",required:false,system:false,config:{},order:0,version:1,deletedAt:null};
  await db.careerCategories.insertOne({_id:categoryId,userId,key:`job_${categoryId}`,name:"Job",icon:"note",defaultView:"table",propertySchemaV2:[definition],schemaVersion:1,version:1,sortOrder:0,updatedAt:now});
  await db.careerRecords.insertOne({_id:recordId,userId,categoryId,title:"User record",status:"draft",origin:"manual",properties:{amount:{type:"number",value:999}},propertyValues:[{propertyDefinitionId:propertyId,type:"number",value:Decimal128.fromString("5.00")}],bodyMd:"unchanged document",version:1,createdAt:now,updatedAt:now,deletedAt:null,purgeAfter:null});
  const schema=new MongoCanonicalCareerPropertySchemaService(fixture.resource,"b2-schema-test-secret-at-least-32-bytes"),change={kind:"delete" as const,propertyId};
  const preview=await schema.previewChange(userId,categoryId,change);await schema.applyChange(userId,categoryId,preview.categoryVersion,randomUUID(),{change,previewToken:preview.previewToken,confirmLossy:true});
  mutationId=(await db.careerPropertyMutations.findOne({userId,categoryId,active:true}))!._id;
  app=buildApi({config,identityService:identity,careerService:new CareerService(fixture.resource)});
 },30000);
 afterAll(async()=>{await app?.close();await fixture?.dispose();});
 const path=()=>`${API_PREFIX}/career/property-mutations/${mutationId}`;
 it("exposes only scoped public progress",async()=>{
  const result=await app.inject({method:"GET",url:path(),headers:{authorization:`Bearer ${token}`}});expect(result.statusCode).toBe(200);
  const response=CareerPropertyMutationStatusResponseSchema.parse(result.json());expect(response.data).toMatchObject({id:mutationId,categoryId,status:"pending",processedCount:0,totalCount:1,retryable:false});
  expect(JSON.stringify(response)).not.toMatch(/fingerprint|planJson|lastError|userId|leaseToken/);
 });
 it("rejects foreign users and untrusted resume fields without modifying the job",async()=>{
  const db=mongoCollections(fixture.resource.db),before=await db.careerPropertyMutations.findOne({_id:mutationId});
  for(const method of ["GET","POST"] as const)expect((await app.inject({method,url:path()+(method==="POST"?"/resume":""),headers:{authorization:`Bearer ${otherToken}`},...(method==="POST"?{payload:{}}:{})})).statusCode).toBe(404);
  expect((await app.inject({method:"POST",url:path()+"/resume",headers:{authorization:`Bearer ${token}`},payload:{userId}})).statusCode).toBe(400);
  expect(await db.careerPropertyMutations.findOne({_id:mutationId})).toEqual(before);
 });
 it("resumes a failed job exactly once and durably re-delivers without business/document writes",async()=>{
  const db=mongoCollections(fixture.resource.db);await db.careerPropertyMutations.updateOne({_id:mutationId},{$set:{status:"failed",lastError:"CANONICAL_MUTATION_FAILED"}});
  const before=await db.careerRecords.findOne({_id:recordId});
  const responses=await Promise.all([1,2].map(()=>app.inject({method:"POST",url:path()+"/resume",headers:{authorization:`Bearer ${token}`},payload:{}})));
  expect(responses.map(response=>response.statusCode).sort()).toEqual([200,409]);
  const resumed=responses.find(response=>response.statusCode===200)!;expect(CareerPropertyMutationStatusResponseSchema.parse(resumed.json()).data).toMatchObject({status:"pending",retryable:false});
  expect(await db.outboxEvents.countDocuments({idempotencyKey:{$regex:`^career-canonical-resume:${mutationId}:`}})).toBe(1);
  expect(await db.careerRecords.findOne({_id:recordId})).toEqual(before);
 });
});
