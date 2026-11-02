import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import type { CareerPropertyDefinitionV2 } from "@expresso/contracts";
import { mongoCollections,type CareerCategoryDoc,type CareerRecordDoc } from "@expresso/database";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { CanonicalPropertyMutationWorker } from "./property-mutation.js";
import { mutationCanonicalJson,mutationFingerprint } from "./property-mutation-state.js";
import type { SpringPropertyMutationPort } from "./spring-property-mutation-port.js";

describe.skipIf(!process.env.TEST_MONGODB_URL)("relation completion computation fanout on disposable Mongo",()=>{
 let fixture:Awaited<ReturnType<typeof createMongoFixture>>;
 const now=new Date("2026-10-09T00:00:00Z");
 const definition=(id:string,key:string,type:CareerPropertyDefinitionV2["type"],config:Record<string,unknown>={}):CareerPropertyDefinitionV2=>({id,key,name:key,type,required:false,system:false,config,order:0,version:1,deletedAt:null});
 beforeAll(async()=>{fixture=await createMongoFixture("b2relfanout");},60000);
 afterAll(async()=>fixture?.dispose());
 async function setup(kind:"deletion"|"restoration"){
  const db=mongoCollections(fixture.resource.db),userId=randomUUID(),otherUser=randomUUID(),categoryId=randomUUID(),oppositeCategory=randomUUID(),propertyId=randomUUID(),inverseId=randomUUID(),scoreId=randomUUID(),sourceId=randomUUID(),targetId=randomUUID(),trashedId=randomUUID(),foreignId=randomUUID(),jobId=randomUUID(),generation=kind==="deletion"?jobId:randomUUID();
  const original=definition(propertyId,"related","relation",{targetCategoryId:oppositeCategory,inversePropertyId:inverseId,cardinality:"multiple",deletePolicy:"restrict"}),source=kind==="restoration"?{...original,deletedAt:now.toISOString()}:original,target={...original,version:2,deletedAt:kind==="deletion"?now.toISOString():null};
  const inverse=definition(inverseId,"back","relation",{targetCategoryId:categoryId,inversePropertyId:propertyId,cardinality:"multiple",deletePolicy:"restrict"});
  const cat=(id:string,defs:CareerPropertyDefinitionV2[],version:number):CareerCategoryDoc=>({_id:id,userId,key:"fanout-"+id,name:"fanout",icon:"note",defaultView:"table",propertySchemaV2:defs,schemaVersion:version,version,sortOrder:0,updatedAt:now});
  await db.careerCategories.insertMany([cat(categoryId,[target],2),cat(oppositeCategory,[inverse,definition(scoreId,"score","number")],3)]);
  const record=(id:string,catId:string,actor=userId):CareerRecordDoc=>({_id:id,userId:actor,categoryId:catId,title:"owned",status:"draft",origin:"manual",properties:{},propertyValues:[],bodyMd:"doc",version:4,createdAt:now,updatedAt:now,deletedAt:null});
  await db.careerRecords.insertMany([record(sourceId,categoryId),record(targetId,oppositeCategory),{...record(trashedId,oppositeCategory),deletedAt:now},record(foreignId,oppositeCategory,otherUser)]);
  const edge=(targetRecordId:string)=>({_id:randomUUID(),userId,sourceRecordId:sourceId,sourcePropertyId:propertyId,targetRecordId,inversePropertyId:inverseId,cardinality:"multiple" as const,deletePolicy:"restrict" as const,createdBy:"user" as const,createdAt:now,updatedAt:now});
  const forward=edge(targetId),duplicate=edge(targetId),trashed=edge(trashedId),foreign=edge(foreignId),inverseEdge={...edge(sourceId),sourceRecordId:targetId,sourcePropertyId:inverseId,inversePropertyId:propertyId};
  const plan={userId,categoryId,categoryVersion:2,schemaVersion:2,definitions:[target],recordIds:[sourceId],operation:{kind,source,target,defaultValue:null,confirmLossy:true}},fingerprint=mutationFingerprint(plan);
  await db.careerPropertyMutations.insertOne({_id:jobId,userId,categoryId,propertyId,planJson:mutationCanonicalJson(plan),operationFingerprint:fingerprint,status:"pending",active:true,cursor:1,processedCount:1,skippedCount:0,attempts:0,leaseToken:null,leaseUntil:null,lastError:null,commitFence:1,createdAt:now,updatedAt:now,completedAt:null});
  const response={_id:sourceId,userId,categoryId,title:"owned",status:"draft" as const,propertyValues:[],version:4,updatedAt:now};
  if(kind==="deletion")await db.careerRelationPropertyTombstones.insertOne({_id:randomUUID(),userId,categoryId,propertyId,recordId:sourceId,deletionMutationId:generation,definitionVersion:target.version,deletedAt:target.deletedAt!,categoryVersion:2,schemaVersion:2,config:target.config,sourceRecordVersion:4,forwardEdges:[forward,duplicate,trashed,foreign],inverseEdges:[inverseEdge],inverseDefinitionBindings:[],inverseRecordVersions:{[targetId]:4},inverseRecordReferenceVersions:{[targetId]:0},createdAt:now});
  else await db.careerPropertyMutationReceipts.insertOne({_id:randomUUID(),userId,mutationId:jobId,recordId:sourceId,operationFingerprint:fingerprint,response,changed:true,createdAt:now,relationRestoration:{deletionMutationId:generation,propertyId,forwardEdges:[forward,duplicate,trashed,foreign],inverseEdges:[inverseEdge]}});
  // 응답 소실 뒤 마지막 checkpoint까지 기록된 작업이며 completion은 receipt/edge를 다시 쓰지 않습니다.
  const port:SpringPropertyMutationPort={receipt:async()=>{throw new Error("already checkpointed");},read:async()=>{throw new Error("already checkpointed");},commit:async()=>{throw new Error("already checkpointed");}};
  return {db,userId,categoryId,oppositeCategory,sourceId,targetId,trashedId,foreignId,jobId,fingerprint,propertyId,inverseId,worker:new CanonicalPropertyMutationWorker(fixture.resource,port)};
 }
 it.each(["deletion","restoration"] as const)("durably refreshes inverse sources once after %s with no remaining live edges",async kind=>{
  const state=await setup(kind),before=await state.db.careerRecords.find({userId:state.userId}).sort({_id:1}).toArray();
  expect(await state.db.careerRecordRelations.countDocuments({userId:state.userId})).toBe(0);
  expect(await state.worker.run(state.jobId,state.fingerprint)).toBe("completed");
  const events=await state.db.outboxEvents.find({userId:state.userId,topic:"career.computation",idempotencyKey:{$regex:"^career-canonical-completed:"+state.jobId+":"}}).sort({"payload.recordId":1}).toArray();
  expect(events).toHaveLength(2);
  expect(events.find(event=>event.payload.recordId===state.targetId)?.payload).toMatchObject({userId:state.userId,recordId:state.targetId,changedPropertyIds:[state.inverseId],sourceRecordVersion:4,sourcePropertyVersions:{[state.inverseId]:1},sourceSchemaVersion:3,sourceCategoryVersion:3});
  expect(events.find(event=>event.payload.recordId===state.sourceId)?.payload).toMatchObject({changedPropertyIds:[state.propertyId],sourceSchemaVersion:2,sourceCategoryVersion:2});
  expect(events.some(event=>event.payload.recordId===state.trashedId || event.payload.recordId===state.foreignId)).toBe(false);
  expect(await state.worker.run(state.jobId,state.fingerprint)).toBe("completed");
  expect(await state.db.outboxEvents.find({userId:state.userId,topic:"career.computation"}).sort({"payload.recordId":1}).toArray()).toEqual(events);
  expect(await state.db.careerRecords.find({userId:state.userId}).sort({_id:1}).toArray()).toEqual(before);
 });
});
