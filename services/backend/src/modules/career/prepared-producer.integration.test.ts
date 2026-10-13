import { randomUUID } from "node:crypto";
import { describe,it,expect,beforeAll,afterAll } from "vitest";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { mongoCollections } from "@expresso/database";
import { MongoIdentityService } from "../identity/index.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import { CareerService, CareerProducerCoordinator,createCareerProducerIntent,careerProducerScopeFilter,validateCareerProducerIntent,type CareerProducerBusinessPort,type CareerProducerDocumentPort } from "./index.js";
import { CareerProducerScopeSchema,CareerProducerBusinessResultSchema } from "@expresso/contracts";
const noDocument:CareerProducerDocumentPort={reserve:async()=>{},cancel:async()=>{},commit:async()=>{throw new Error("document owner must not be called");}};
describe.skipIf(!process.env.TEST_MONGODB_URL)("durable prepared coordinator fencing",()=>{
 let fixture:Awaited<ReturnType<typeof createMongoFixture>>,userId:string;
 beforeAll(async()=>{fixture=await createMongoFixture("producercore");userId=(await new MongoIdentityService(fixture.resource).signup({email:randomUUID()+"@example.com",displayName:"coordinator",password:"correct-horse-battery"})).user.id;},60000);
 afterAll(async()=>fixture?.dispose());
 async function scenario(){
  const career=new CareerService(fixture.resource),db=mongoCollections(fixture.resource.db);
  const category=await career.createCategory(userId,{key:"core_"+randomUUID().replaceAll("-",""),name:"검증",icon:"folder",defaultView:"table",propertySchema:{}});
  const record=(await career.createRecord(userId,randomUUID(),{categoryId:category.id,title:"before",properties:{},bodyMd:"문서"})).record;
  await db.careerRecords.updateOne({_id:record.id},{$set:{propertyValues:[]}});
  const id=randomUUID(),now=new Date(),intent=createCareerProducerIntent({producer:"ai-proposal",userId,sourceId:id,operationId:randomUUID(),business:{kind:"patch",recordId:record.id,expectedVersion:1,expectedCategoryVersion:1,patches:[{title:"after"}]},document:null});
  await db.careerAiProposals.insertOne({_id:id,userId,recordId:record.id,status:"ready",baseDocumentVersion:0,selection:{blockIds:[]},prompt:"준비",summary:null,commands:[],propertyChanges:[],progress:null,beforeSnapshotId:null,afterSnapshotId:null,beforeChecksum:null,afterChecksum:null,revisionId:null,appliedDocumentVersion:null,expiresAt:new Date(Date.now()+3600000),createdAt:now,updatedAt:now,writerIntegration:intent});
  return {scope:CareerProducerScopeSchema.parse(intent),record};
 }
 function owner(options:{lose?:boolean;delay?:boolean}={}):CareerProducerBusinessPort{
  return {async commit(request){
   if(options.delay){
    await mongoCollections(fixture.resource.db).careerAiProposals.updateOne(careerProducerScopeFilter(request),{$set:{"writerIntegration.leaseUntil":new Date(Date.now()+11000).toISOString()}});
    await new Promise(resolve=>setTimeout(resolve,13000));
   }
   const result=await inTransaction(fixture.resource,async tx=>{
    const db=mongoCollections(tx.db),source=await db.careerAiProposals.findOne(careerProducerScopeFilter(request),{session:tx.session});
    const intent=validateCareerProducerIntent(source?.writerIntegration);
    if(intent.businessResult)return intent.businessResult;
    if(intent.state!=="running"||intent.leaseToken!==request.leaseToken||Date.parse(intent.leaseUntil!)<=Date.now()||intent.business?.kind!=="patch")throw new Error("stale owner fenced");
    const record=await db.careerRecords.findOneAndUpdate({_id:intent.business.recordId,userId,version:intent.business.expectedVersion},{$set:{title:"after"},$inc:{version:1}},{session:tx.session,returnDocument:"after"});
    if(!record)throw new Error("version stale");
    const receipt=CareerProducerBusinessResultSchema.parse({data:{id:record._id,userId,categoryId:record.categoryId,title:record.title,propertyValues:[],status:record.status,version:record.version,updatedAt:record.updatedAt.toISOString()},replayed:false});
    const changed=await db.careerAiProposals.updateOne({...careerProducerScopeFilter(request),"writerIntegration.leaseToken":request.leaseToken,"writerIntegration.leaseUntil":{$gt:new Date().toISOString()}},{$set:{"writerIntegration.businessResult":receipt}},{session:tx.session});
    if(!changed.matchedCount)throw new Error("stale owner fenced");
    return receipt;
   });
   if(options.lose)throw new Error("lost response with secret that must not persist");
   return result;
  }};
 }
 it("recovers a committed owner after a lost acknowledgement without another version increment",async()=>{
  const {scope,record}=await scenario(),coordinator=new CareerProducerCoordinator(fixture.resource,owner({lose:true}),noDocument);
  await expect(coordinator.execute(scope)).rejects.toThrow("lost response");
  expect(await coordinator.pending(scope)).toMatchObject({state:"retry",lastError:"OWNER_CALL_FAILED"});
  expect(await coordinator.execute(scope)).toMatchObject({state:"completed",attempts:2});
  expect((await mongoCollections(fixture.resource.db).careerRecords.findOne({_id:record.id}))?.version).toBe(2);
 });
 it("reacquires expired-running crash state and fences stale owner and duplicate delivery",async()=>{
  const {scope,record}=await scenario(),db=mongoCollections(fixture.resource.db),oldToken=randomUUID();
  await db.careerAiProposals.updateOne({_id:scope.sourceId},{$set:{"writerIntegration.state":"running","writerIntegration.leaseToken":oldToken,"writerIntegration.leaseUntil":new Date(0).toISOString()}});
  await expect(owner().commit({...scope,leaseToken:oldToken})).rejects.toThrow("fenced");
  const coordinator=new CareerProducerCoordinator(fixture.resource,owner(),noDocument),results=await Promise.allSettled([coordinator.execute(scope),coordinator.execute(scope)]);
  expect(results.some(r=>r.status==="fulfilled" && r.value.state==="completed")).toBe(true);
  expect((await db.careerRecords.findOne({_id:record.id}))?.version).toBe(2);
  expect(await coordinator.execute(scope)).toMatchObject({state:"completed"});
 });
 it("renews during a long owner call and rejects changed immutable payload",async()=>{
  const {scope}=await scenario(),coordinator=new CareerProducerCoordinator(fixture.resource,owner({delay:true}),noDocument);
  expect(await coordinator.execute(scope)).toMatchObject({state:"completed"});
  const other=await scenario();
  await mongoCollections(fixture.resource.db).careerAiProposals.updateOne({_id:other.scope.sourceId},{$set:{"writerIntegration.business.expectedVersion":2}});
  await expect(coordinator.execute(other.scope)).rejects.toThrow("payload changed");
 },20000);
 it("rejects historical completion replay after account revocation",async()=>{
  const {scope}=await scenario(),coordinator=new CareerProducerCoordinator(fixture.resource,owner(),noDocument);
  await coordinator.execute(scope);
  await mongoCollections(fixture.resource.db).users.updateOne({_id:userId},{$set:{deletionRequestedAt:new Date()}});
  await expect(coordinator.execute(scope)).rejects.toMatchObject({statusCode:401});
 });
});