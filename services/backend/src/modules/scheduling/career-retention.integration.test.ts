import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { mongoCollections } from "@expresso/database";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoIdentityService } from "../identity/index.js";
import { SchedulingService } from "./service.js";
describe.skipIf(!process.env.TEST_MONGODB_URL)("retention respects Career reference guard",()=>{
 let fixture:Awaited<ReturnType<typeof createMongoFixture>>;
 beforeAll(async()=>{fixture=await createMongoFixture("b2retention");},30000);
 afterAll(async()=>fixture?.dispose());
 it("purges expired trash but preserves quoted and active records under duplicate delivery",async()=>{
  const db=mongoCollections(fixture.resource.db),now=new Date(),expired=new Date(now.getTime()-86400000);
  const userId=(await new MongoIdentityService(fixture.resource).signup({email:`${randomUUID()}@example.test`,displayName:"Retention",password:"disposable-retention-password"})).user.id;
  const categoryId=(await db.careerCategories.findOne({userId}))!._id,quoted=randomUUID(),purgeable=randomUUID(),active=randomUUID(),runId=randomUUID();
  const record=(id:string,deletedAt:Date|null)=>({_id:id,userId,categoryId,title:id,status:"draft" as const,origin:"manual" as const,properties:{},propertyValues:[],bodyMd:"original document",version:3,referenceVersion:2,createdAt:expired,updatedAt:expired,deletedAt,purgeAfter:expired});
  await db.careerRecords.insertMany([record(quoted,expired),record(purgeable,expired),record(active,null)]);
  await db.recordUsages.insertOne({_id:randomUUID(),userId,recordId:quoted,blockId:randomUUID(),quotedText:"Keep cited history",firstUsedAt:expired});
  const before=await db.careerRecords.findOne({_id:quoted}),activeBefore=await db.careerRecords.findOne({_id:active});
  await db.scheduledJobRuns.insertOne({_id:runId,jobKey:"retention",scheduledFor:now,status:"queued",attempts:0,createdAt:now});
  const service=new SchedulingService(fixture.resource);await Promise.all([service.process(runId,now),service.process(runId,now)]);
  expect(await db.careerRecords.findOne({_id:quoted})).toEqual(before);
  expect(await db.careerRecords.findOne({_id:active})).toEqual(activeBefore);
  expect(await db.careerRecords.findOne({_id:purgeable})).toBeNull();
  expect(await db.recordUsages.countDocuments({recordId:quoted})).toBe(1);
  expect((await service.getRun(runId)).result).toMatchObject({records:1,blockedRecords:1});
  expect((await service.getRun(runId)).attempts).toBe(1);
 });
});
