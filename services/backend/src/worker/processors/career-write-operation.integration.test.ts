import {randomUUID} from "node:crypto";
import {Queue,Worker,type Job} from "bullmq";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {CareerProducerScopeSchema,CareerProducerBusinessResultSchema,CareerProducerDocumentResultSchema,type CareerProducerScope,type CareerProducerIntent} from "@expresso/contracts";
import {mongoCollections} from "@expresso/database";
import {createMongoFixture} from "../../../test/support/mongodb.js";
import {inTransaction} from "../../platform/mongo-transaction.js";
import {MongoIdentityService} from "../../modules/identity/index.js";
import {CareerService,CareerProducerCoordinator,createCareerProducerIntent,careerProducerSource,careerProducerScopeFilter,validateCareerProducerIntent,CAREER_PRODUCER_COLLECTIONS,type CareerProducerBusinessPort,type CareerProducerDocumentPort} from "../../modules/career/index.js";
import * as recoveryModule from "./career-write-operation.js";

async function waitFor<T>(read:()=>Promise<T|undefined>):Promise<T>{for(let i=0;i<200;i++){const value=await read();if(value!==undefined)return value;await new Promise(resolve=>setTimeout(resolve,25));}throw new Error("write-operation delivery timed out");}
const producers=["ai-proposal","interview","career-product"]as const;
describe.skipIf(!process.env.TEST_MONGODB_URL||!process.env.TEST_REDIS_URL)("durable write-operation delivery on disposable Mongo and Redis",()=>{
 let fixture:Awaited<ReturnType<typeof createMongoFixture>>,userId:string,foreignId:string;
 beforeAll(async()=>{fixture=await createMongoFixture("b2wrecovery");const identity=new MongoIdentityService(fixture.resource);userId=(await identity.signup({email:randomUUID()+"@example.com",displayName:"Recovery",password:"correct-horse-battery"})).user.id;foreignId=(await identity.signup({email:randomUUID()+"@example.com",displayName:"Other",password:"correct-horse-battery"})).user.id;},60000);
 afterAll(async()=>fixture?.dispose());
 async function scenario(producer:CareerProducerScope["producer"],state:CareerProducerIntent["state"]="pending",actorId=userId){
  const career=new CareerService(fixture.resource),db=mongoCollections(fixture.resource.db),category=await career.createCategory(actorId,{key:"recovery_"+randomUUID().replaceAll("-",""),name:"Recovery",icon:"folder",defaultView:"table",propertySchemaV2:[]});
  const record=(await career.createRecord(actorId,randomUUID(),{categoryId:category.id,title:"Before",properties:{},bodyMd:"Before body"})).record;
  await db.careerRecords.updateOne({_id:record.id},{$set:{propertyValues:[],documentVersion:0}});
  const sourceId=randomUUID(),intent=createCareerProducerIntent({producer,userId:actorId,sourceId,operationId:producer==="career-product"?sourceId:randomUUID(),business:{kind:"patch",recordId:record.id,expectedVersion:1,expectedCategoryVersion:1,patches:[{title:"After"}]},document:{kind:"markdown",recordId:record.id,expectedVersion:0,markdown:"After body",summary:"복구"}}),now=new Date();
  intent.state=state;if(state==="running"){intent.attempts=1;intent.leaseToken=randomUUID();intent.leaseUntil=new Date(Date.now()-1).toISOString();}if(state==="blocked")intent.lastError="RECOVERY_ATTEMPTS_EXHAUSTED";
  if(producer==="ai-proposal")await db.careerAiProposals.insertOne({_id:sourceId,userId:actorId,recordId:record.id,status:"ready",baseDocumentVersion:0,selection:{blockIds:[]},prompt:"준비",summary:null,commands:[],propertyChanges:[],progress:null,beforeSnapshotId:null,afterSnapshotId:null,beforeChecksum:null,afterChecksum:null,revisionId:null,appliedDocumentVersion:null,expiresAt:new Date(Date.now()+3600000),createdAt:now,updatedAt:now,writerIntegration:intent});
  else if(producer==="interview")await db.interviewCareerOperations.insertOne({_id:sourceId,userId:actorId,sessionId:randomUUID(),questionId:randomUUID(),answerId:randomUUID(),recordId:record.id,expectedAnswerVersion:null,answerVersion:1,inputIdempotencyKey:randomUUID(),requestHash:intent.fingerprint,kind:"answer",input:{inputType:"text",transcript:"복구"},active:true,writerIntegration:intent,result:null,createdAt:now,updatedAt:now});
  else await db.careerProductOperations.insertOne({_id:sourceId,userId:actorId,inputIdempotencyKey:randomUUID(),inputHash:"a".repeat(64),requestHash:intent.fingerprint,kind:"patch",recordId:record.id,active:true,writerIntegration:intent,result:null,createdAt:now,updatedAt:now});
  return {scope:CareerProducerScopeSchema.parse(intent),record};
 }
 function owners(){
  let businessCalls=0,documentCalls=0;
  const business:CareerProducerBusinessPort={async commit(request){businessCalls++;return inTransaction(fixture.resource,async tx=>{
   const source=careerProducerSource(tx,request),options={session:tx.session},row=await source.findOne(careerProducerScopeFilter(request),options),intent=validateCareerProducerIntent(row?.writerIntegration);
   if(intent.businessResult)return intent.businessResult;
   if(intent.state!=="running"||intent.leaseToken!==request.leaseToken||Date.parse(intent.leaseUntil!)<=Date.now()||intent.business?.kind!=="patch")throw new Error("owner lease fenced");
   const db=mongoCollections(tx.db),record=await db.careerRecords.findOneAndUpdate({_id:intent.business.recordId,userId:request.userId,version:intent.business.expectedVersion},{$set:{title:"After"},$inc:{version:1}},{...options,returnDocument:"after"});if(!record)throw new Error("owner CAS changed");
   const result=CareerProducerBusinessResultSchema.parse({data:{id:record._id,userId:record.userId,categoryId:record.categoryId,title:record.title,propertyValues:[],status:record.status,version:record.version,updatedAt:record.updatedAt.toISOString()},replayed:false});
   await source.updateOne({...careerProducerScopeFilter(request),"writerIntegration.leaseToken":request.leaseToken},{$set:{"writerIntegration.businessResult":result}},options);
   const now=new Date();await db.outboxEvents.insertOne({_id:randomUUID(),userId:request.userId,topic:"career.record.updated",payload:{recordId:record._id},idempotencyKey:`recovery-business-${request.operationId}`,state:"published",attempts:0,availableAt:now,createdAt:now,updatedAt:now},options);return result;
  });}};
  const document:CareerProducerDocumentPort={reserve:async()=>{},cancel:async()=>{},async commit(request){documentCalls++;return inTransaction(fixture.resource,async tx=>{
   const source=careerProducerSource(tx,request),options={session:tx.session},row=await source.findOne(careerProducerScopeFilter(request),options),intent=validateCareerProducerIntent(row?.writerIntegration);
   if(intent.documentResult)return intent.documentResult;if(intent.state!=="running"||intent.leaseToken!==request.leaseToken||Date.parse(intent.leaseUntil!)<=Date.now()||intent.document?.kind!=="markdown")throw new Error("document lease fenced");
   const db=mongoCollections(tx.db),record=await db.careerRecords.findOneAndUpdate({_id:intent.document.recordId!,userId:request.userId,documentVersion:intent.document.expectedVersion},{$set:{bodyMd:intent.document.markdown},$inc:{documentVersion:1}},{...options,returnDocument:"after"});if(!record)throw new Error("document CAS changed");
   const result=CareerProducerDocumentResultSchema.parse({recordId:record._id,documentVersion:record.documentVersion,beforeSnapshotId:randomUUID(),afterSnapshotId:randomUUID(),revisionId:randomUUID()});
   await source.updateOne({...careerProducerScopeFilter(request),"writerIntegration.leaseToken":request.leaseToken},{$set:{"writerIntegration.documentResult":result}},options);
   const now=new Date();await db.outboxEvents.insertOne({_id:randomUUID(),userId:request.userId,topic:"career.document.updated",payload:{recordId:record._id},idempotencyKey:`recovery-document-${request.operationId}`,state:"published",attempts:0,availableAt:now,createdAt:now,updatedAt:now},options);return result;
  });}};
  const coordinator=new CareerProducerCoordinator(fixture.resource,business,document,{maxAttempts:5,classify:()=>"retry"}),execute=(scope:CareerProducerScope)=>coordinator.execute(scope);
  return {business,document,coordinator,executors:{"ai-proposal":execute,interview:execute,"career-product":execute},get businessCalls(){return businessCalls;},get documentCalls(){return documentCalls;}};
 }
 function queue(){const name="career-write-operation",prefix="expresso-write-recovery-"+randomUUID();return {name,prefix,value:new Queue<Record<string,unknown>>(name,{connection:{url:process.env.TEST_REDIS_URL!},prefix})};}
 it("delivers all three current producer intents once and leaves terminal, live leases and historical intents untouched",async()=>{
  expect(recoveryModule.createCareerWriteOperationRecovery).toBeTypeOf("function");expect(recoveryModule.createCareerWriteOperationProcessor).toBeTypeOf("function");
  const states=await Promise.all(producers.map((producer,index)=>scenario(producer,index===0?"pending":index===1?"retry":"running"))),live=await scenario("career-product","running"),blocked=await scenario("interview","blocked"),owner=owners();
  await careerProducerSource(fixture.resource,live.scope).updateOne({_id:live.scope.sourceId},{$set:{"writerIntegration.leaseUntil":new Date(Date.now()+60000).toISOString()}});
  const preserved=await Promise.all([live,blocked].map(state=>careerProducerSource(fixture.resource,state.scope).findOne({_id:state.scope.sourceId}))),q=queue(),recovery=recoveryModule.createCareerWriteOperationRecovery(fixture.resource,q.value);
  let worker:Worker<Record<string,unknown>>|undefined;
  try{
   expect(await recovery.pollOnce()).toEqual({delivered:3});expect(await recovery.pollOnce()).toEqual({delivered:0});
   const deliveries=await q.value.getJobs(["waiting"]);expect(deliveries.map(job=>job.id).sort()).toEqual(states.map(state=>`career-write-${state.scope.producer}-${state.scope.operationId}-${state.scope.producer==="career-product"?1:0}`).sort());
   worker=new Worker(q.name,recoveryModule.createCareerWriteOperationProcessor(fixture.resource,owner.executors),{connection:{url:process.env.TEST_REDIS_URL!},prefix:q.prefix});
   await waitFor(async()=>{const counts=await Promise.all(states.map(state=>careerProducerSource(fixture.resource,state.scope).countDocuments({_id:state.scope.sourceId,"writerIntegration.state":"completed"})));return counts.every(count=>count===1)?true:undefined;});
   const db=mongoCollections(fixture.resource.db);for(const state of states){expect(await db.careerRecords.findOne({_id:state.record.id})).toMatchObject({title:"After",version:2,bodyMd:"After body",documentVersion:1});expect(await db.outboxEvents.countDocuments({idempotencyKey:{$in:[`recovery-business-${state.scope.operationId}`,`recovery-document-${state.scope.operationId}`]}})).toBe(2);}
   await waitFor(async()=>await q.value.getCompletedCount()===3?true:undefined);for(const delivery of await q.value.getJobs(["completed"]))expect(delivery.returnvalue).toEqual({state:"completed",operationId:(delivery.data.scope as CareerProducerScope).operationId});
   expect(owner.businessCalls).toBe(3);expect(owner.documentCalls).toBe(3);expect(await recovery.pollOnce()).toEqual({delivered:0});expect(await Promise.all([live,blocked].map(state=>careerProducerSource(fixture.resource,state.scope).findOne({_id:state.scope.sourceId})))).toEqual(preserved);
  }finally{await recovery.stop();await worker?.close();await q.value.obliterate({force:true});await q.value.close();await careerProducerSource(fixture.resource,live.scope).updateOne({_id:live.scope.sourceId},{$set:{"writerIntegration.state":"cancelled","writerIntegration.leaseUntil":null,"writerIntegration.leaseToken":null}});}
 });
 it("replays expired-running owner receipts after an exhausted crash delivery using the same queue generation",async()=>{
  expect(recoveryModule.createCareerWriteOperationRecovery).toBeTypeOf("function");
  const state=await scenario("career-product","running"),owner=owners(),source=careerProducerSource(fixture.resource,state.scope);await source.updateOne({_id:state.scope.sourceId},{$set:{"writerIntegration.leaseUntil":new Date(Date.now()+60000).toISOString(),"writerIntegration.attempts":5}});
  const intent=validateCareerProducerIntent((await source.findOne({_id:state.scope.sourceId}))!.writerIntegration),request={...state.scope,leaseToken:intent.leaseToken!};await owner.business.commit(request);await owner.document.commit(request);
  await source.updateOne({_id:state.scope.sourceId},{$set:{"writerIntegration.leaseUntil":new Date(0).toISOString()}});
  const q=queue(),errors:unknown[]=[],recoveries=[0,1].map(()=>recoveryModule.createCareerWriteOperationRecovery(fixture.resource,q.value,{intervalMs:25,onError:error=>errors.push(error)}));let worker:Worker<Record<string,unknown>>|undefined;
  try{
   worker=new Worker<Record<string,unknown>>(q.name,async()=>{throw new Error("process crashed before claim");},{connection:{url:process.env.TEST_REDIS_URL!},prefix:q.prefix});const jobId=`career-write-career-product-${state.scope.operationId}-5`,delivery=await q.value.add("career.write-operation",{scope:state.scope},{jobId,attempts:1});
   await waitFor(async()=>await delivery.getState()==="failed"?true:undefined);await worker.close();worker=undefined;
   worker=new Worker(q.name,recoveryModule.createCareerWriteOperationProcessor(fixture.resource,owner.executors),{connection:{url:process.env.TEST_REDIS_URL!},prefix:q.prefix});recoveries.forEach(value=>value.start());
   await waitFor(async()=>await source.countDocuments({_id:state.scope.sourceId,"writerIntegration.state":"completed"})===1?true:undefined);await Promise.all(recoveries.map(value=>value.stop()));await waitFor(async()=>await delivery.getState()==="completed"?true:undefined);
   expect(owner.businessCalls).toBe(1);expect(owner.documentCalls).toBe(1);expect(await source.findOne({_id:state.scope.sourceId})).toMatchObject({writerIntegration:{state:"completed",attempts:6}});expect(await mongoCollections(fixture.resource.db).careerRecords.findOne({_id:state.record.id})).toMatchObject({version:2,documentVersion:1});
   expect(await mongoCollections(fixture.resource.db).outboxEvents.countDocuments({idempotencyKey:{$in:[`recovery-business-${state.scope.operationId}`,`recovery-document-${state.scope.operationId}`]}})).toBe(2);
   const settled=(await q.value.getJob(jobId))!.asJSON();for(let i=0;i<3;i++)await Promise.all(recoveries.map(value=>value.pollOnce()));const deliveries=(await q.value.getJobs(["completed","failed","waiting","active","delayed"])).filter(job=>(job.data.scope as CareerProducerScope).operationId===state.scope.operationId);expect(deliveries.map(job=>job.id)).toEqual([jobId]);expect((await q.value.getJob(jobId))!.asJSON()).toEqual(settled);expect(errors).toEqual([]);
  }finally{await Promise.all(recoveries.map(value=>value.stop()));await worker?.close();await q.value.obliterate({force:true});await q.value.close();}
 });
 it("delays a live lease without consuming a BullMQ attempt and completes after lease expiry",async()=>{
  expect(recoveryModule.createCareerWriteOperationProcessor).toBeTypeOf("function");const state=await scenario("ai-proposal","running"),owner=owners(),source=careerProducerSource(fixture.resource,state.scope);await source.updateOne({_id:state.scope.sourceId},{$set:{"writerIntegration.leaseUntil":new Date(Date.now()+60000).toISOString()}});
  const q=queue(),worker=new Worker(q.name,recoveryModule.createCareerWriteOperationProcessor(fixture.resource,owner.executors,{busyDelayMs:100}),{connection:{url:process.env.TEST_REDIS_URL!},prefix:q.prefix});
  try{const delivery=await q.value.add("career.write-operation",{scope:state.scope},{attempts:1});await waitFor(async()=>await delivery.getState()==="delayed"?true:undefined);expect((await q.value.getJob(delivery.id!))!.attemptsMade).toBe(0);expect(owner.businessCalls).toBe(0);await source.updateOne({_id:state.scope.sourceId},{$set:{"writerIntegration.leaseUntil":new Date(0).toISOString()}});await waitFor(async()=>await delivery.getState()==="completed"?true:undefined);expect(owner.businessCalls).toBe(1);expect((await q.value.getJob(delivery.id!))!.attemptsMade).toBe(1);}
  finally{await worker.close();await q.value.obliterate({force:true});await q.value.close();}
 });
 it("rejects foreign actors and changed current payloads before execution, and only replays verified completed history",async()=>{
  expect(recoveryModule.createCareerWriteOperationProcessor).toBeTypeOf("function");const state=await scenario("ai-proposal"),owner=owners(),source=careerProducerSource(fixture.resource,state.scope),processor=recoveryModule.createCareerWriteOperationProcessor(fixture.resource,owner.executors),job=(scope:CareerProducerScope)=>({data:{scope}}as unknown as Job<Record<string,unknown>> );
  await expect(processor(job({...state.scope,userId:foreignId}))).rejects.toThrow();expect(owner.businessCalls).toBe(0);
  await source.updateOne({_id:state.scope.sourceId},{$set:{"writerIntegration.business.patches":[{title:"Tampered"}]}});await expect(processor(job(state.scope))).rejects.toThrow("changed");expect(owner.businessCalls).toBe(0);
  const original=createCareerProducerIntent({...state.scope,business:{kind:"patch",recordId:state.record.id,expectedVersion:1,expectedCategoryVersion:1,patches:[{title:"After"}]},document:{kind:"markdown",recordId:state.record.id,expectedVersion:0,markdown:"After body",summary:"복구"}});await source.updateOne({_id:state.scope.sourceId},{$set:{writerIntegration:original}});await owner.coordinator.execute(state.scope);
  const completed=await owner.coordinator.pending(state.scope),current=createCareerProducerIntent({...state.scope,operationId:randomUUID(),business:{kind:"patch",recordId:state.record.id,expectedVersion:2,expectedCategoryVersion:1,patches:[{title:"Next"}]},document:null});await source.updateOne({_id:state.scope.sourceId},{$set:{writerIntegration:current,writerIntegrationHistory:[completed]}});
  expect(await processor(job(state.scope))).toMatchObject({state:"completed",operationId:state.scope.operationId});expect(owner.businessCalls).toBe(1);expect(owner.documentCalls).toBe(1);expect((await source.findOne({_id:state.scope.sourceId}))!.writerIntegration).toEqual(current);
  await source.updateOne({_id:state.scope.sourceId},{$set:{"writerIntegration.state":"cancelled"}});
 });
 it("recovers a completed queue delivery whose current Mongo intent is still pending without adding another job",async()=>{
  const state=await scenario("interview"),owner=owners(),q=queue(),source=careerProducerSource(fixture.resource,state.scope),jobId=`career-write-interview-${state.scope.operationId}-0`;let worker:Worker<Record<string,unknown>>|undefined;const recovery=recoveryModule.createCareerWriteOperationRecovery(fixture.resource,q.value);
  try{worker=new Worker(q.name,async()=>null,{connection:{url:process.env.TEST_REDIS_URL!},prefix:q.prefix});const delivery=await q.value.add("career.write-operation",{scope:state.scope},{jobId,attempts:1});await waitFor(async()=>await delivery.getState()==="completed"?true:undefined);await worker.close();worker=undefined;
   worker=new Worker(q.name,recoveryModule.createCareerWriteOperationProcessor(fixture.resource,owner.executors),{connection:{url:process.env.TEST_REDIS_URL!},prefix:q.prefix});expect(await recovery.pollOnce()).toEqual({delivered:1});await waitFor(async()=>await source.countDocuments({_id:state.scope.sourceId,"writerIntegration.state":"completed"})===1?true:undefined);await waitFor(async()=>await delivery.getState()==="completed"?true:undefined);
   expect((await q.value.getJobs(["completed","waiting","failed","active","delayed"])).filter(job=>(job.data.scope as CareerProducerScope).operationId===state.scope.operationId).map(job=>job.id)).toEqual([jobId]);expect(owner.businessCalls).toBe(1);expect(owner.documentCalls).toBe(1);
  }finally{await recovery.stop();await worker?.close();await q.value.obliterate({force:true});await q.value.close();}
 });
 it("does not enqueue or execute an inactive actor's pending intent",async()=>{
  const state=await scenario("career-product"),owner=owners(),q=queue(),recovery=recoveryModule.createCareerWriteOperationRecovery(fixture.resource,q.value),db=mongoCollections(fixture.resource.db);
  await db.users.updateOne({_id:userId},{$set:{deletionRequestedAt:new Date()}});
  try{expect(await recovery.pollOnce()).toEqual({delivered:0});expect(await q.value.getJobCountByTypes("waiting","active","delayed","completed","failed")).toBe(0);await expect(recoveryModule.createCareerWriteOperationProcessor(fixture.resource,owner.executors)({data:{scope:state.scope}}as unknown as Job<Record<string,unknown>>)).rejects.toMatchObject({statusCode:401});expect(owner.businessCalls).toBe(0);expect(await db.careerRecords.findOne({_id:state.record.id})).toMatchObject({title:"Before",version:1,documentVersion:0});}
  finally{await db.users.updateOne({_id:userId},{$set:{deletionRequestedAt:null}});await careerProducerSource(fixture.resource,state.scope).updateOne({_id:state.scope.sourceId},{$set:{"writerIntegration.state":"cancelled"}});await recovery.stop();await q.value.obliterate({force:true});await q.value.close();}
 });
 it("delivers an active actor beyond older inactive intents when the recovery batch is full",async()=>{
  const inactive=await Promise.all([0,1,2].map(()=>scenario("ai-proposal","pending",foreignId))),active=await scenario("career-product"),q=queue(),recovery=recoveryModule.createCareerWriteOperationRecovery(fixture.resource,q.value,{batchSize:1}),db=mongoCollections(fixture.resource.db);
  for(const state of inactive)await careerProducerSource(fixture.resource,state.scope).updateOne({_id:state.scope.sourceId},{$set:{updatedAt:new Date(0)}});await db.users.updateOne({_id:foreignId},{$set:{deletionRequestedAt:new Date()}});
  const before=await Promise.all([...inactive,active].map(state=>db.careerRecords.findOne({_id:state.record.id})));
  try{expect(await recovery.pollOnce()).toEqual({delivered:1});expect((await q.value.getJobs(["waiting"])).map(job=>(job.data.scope as CareerProducerScope).operationId)).toEqual([active.scope.operationId]);expect(await recovery.pollOnce()).toEqual({delivered:0});expect(await Promise.all([...inactive,active].map(state=>db.careerRecords.findOne({_id:state.record.id})))).toEqual(before);}
  finally{await db.users.updateOne({_id:foreignId},{$set:{deletionRequestedAt:null}});for(const state of [...inactive,active])await careerProducerSource(fixture.resource,state.scope).updateOne({_id:state.scope.sourceId},{$set:{"writerIntegration.state":"cancelled"}});await recovery.stop();await q.value.obliterate({force:true});await q.value.close();}
 });
});