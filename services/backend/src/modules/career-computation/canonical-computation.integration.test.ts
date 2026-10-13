import { randomUUID } from "node:crypto";
import { Decimal128, MongoNetworkError } from "mongodb";
import { mongoCollections,readCanonicalCareerPropertyValues,type CareerRecordDoc,type CareerRecordRelationDoc } from "@expresso/database";
import { CanonicalPropertyMutationWorker,type SpringPropertyMutationPort } from "../career/index.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import type { CareerPropertyDefinitionV2 } from "@expresso/contracts";
import { afterAll,beforeAll,describe,expect,it,vi } from "vitest";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoIdentityService } from "../identity/index.js";
import { CareerService } from "../career/service.js";
import { MongoCareerComputationService } from "./service.js";
import { MongoCareerComputationRepository } from "./repository.js";
import { MongoCanonicalCareerPropertySchemaService } from "../career/canonical-property-schema.js";
import { createCareerComputationProcessor } from "../../worker/processors/career-computation.js";
import { createCareerComputationTargetStateProcessor } from "../../worker/processors/career-computation-target-state.js";

describe.skipIf(!process.env.TEST_MONGODB_URL)("prepared canonical computation",()=>{
  let fixture:Awaited<ReturnType<typeof createMongoFixture>>,userId:string;
  beforeAll(async()=>{fixture=await createMongoFixture("prccompute");userId=(await new MongoIdentityService(fixture.resource).signup({email:`${randomUUID()}@example.test`,password:"correct-horse-battery",displayName:"test"})).user.id;},60_000);
  afterAll(async()=>fixture?.dispose());
  async function setup() {
    const career=new CareerService(fixture.resource),db=mongoCollections(fixture.resource.db);
    const category=await career.createCategory(userId,{key:`prc_${randomUUID().replaceAll("-","")}`,name:"계산",icon:"folder",defaultView:"table",propertySchema:{score:{label:"점수",type:"number",required:false,system:false}}});
    const score=randomUUID(),formula=randomUUID();
    const definition=(id:string,key:string,type:CareerPropertyDefinitionV2["type"],config={}):CareerPropertyDefinitionV2=>({id,key,name:key,type,required:false,system:false,config,order:0,version:1,deletedAt:null});
    await db.careerCategories.updateOne({_id:category.id},{$set:{schemaVersion:1,propertySchemaV2:[definition(score,"score","number"),definition(formula,"double","formula",{source:`prop("${score}") * 2`})]}});
    const record=(await career.createRecord(userId,randomUUID(),{categoryId:category.id,title:"test",properties:{score:{type:"number",value:99}},bodyMd:"doc sentinel"})).record;
    await db.careerRecords.updateOne({_id:record.id},{$set:{propertyValues:[{propertyDefinitionId:score,type:"number",value:Decimal128.fromString("3.00")}],documentVersion:7,latestSnapshotId:randomUUID()}} as never);
    const service=new MongoCareerComputationService(fixture.resource,"canonical");
    const event={eventId:randomUUID(),userId,recordId:record.id,changedPropertyIds:[score],sourceRecordVersion:1};
    return {db,categoryId:category.id,recordId:record.id,score,formula,service,event};
  }
  async function setupRollup() {
    const state=await setup(),relation=randomUUID(),rollup=randomUUID(),target=randomUUID();
    const defs=(await state.db.careerCategories.findOne({_id:state.categoryId}))!.propertySchemaV2!;
    const base={required:false,system:false,order:0,version:1,deletedAt:null};
    await state.db.careerCategories.updateOne({_id:state.categoryId},{$set:{propertySchemaV2:[...defs,{...base,id:relation,key:"targets",name:"targets",type:"relation",config:{targetCategoryId:state.categoryId,inversePropertyId:null,cardinality:"multiple",deletePolicy:"restrict"}},{...base,id:rollup,key:"total",name:"total",type:"rollup",config:{relationPropertyId:relation,targetPropertyId:state.score,aggregation:"sum"}}]}});
    const source=(await state.db.careerRecords.findOne({_id:state.recordId}))!,now=new Date();
    await state.db.careerRecords.insertOne({...source,_id:target,createIdempotencyKey:randomUUID()});
    await state.db.careerRecordRelations.insertOne({_id:randomUUID(),userId,sourceRecordId:state.recordId,sourcePropertyId:relation,targetRecordId:target,inversePropertyId:null,cardinality:"multiple",deletePolicy:"restrict",createdBy:"user",createdAt:now,updatedAt:now});
    return {...state,relation,rollup,target,event:{...state.event,changedPropertyIds:[relation]}};
  }
  it("relation jobs complete before refreshing rollups and preserve body and scalar values",async()=>{
    const state=await setupRollup();await state.service.recompute(state.event);
    expect((await state.db.careerRecords.findOne({_id:state.recordId}))?.computedProperties?.total).toMatchObject({value:3});
    const before=(await state.db.careerRecords.findOne({_id:state.recordId}))!,originalEdge=(await state.db.careerRecordRelations.findOne({sourceRecordId:state.recordId}))!;
    const schema=new MongoCanonicalCareerPropertySchemaService(fixture.resource,"prc-preview-secret-with-at-least-32-bytes");
    const business=(record:Pick<CareerRecordDoc,"_id"|"userId"|"categoryId"|"title"|"status"|"version"|"updatedAt"|"propertyValues">)=>({id:record._id,userId:record.userId,categoryId:record.categoryId,title:record.title,status:record.status,version:record.version,updatedAt:record.updatedAt.toISOString(),propertyValues:readCanonicalCareerPropertyValues(record)});
    const wire=(edge:CareerRecordRelationDoc)=>{const {_id,createdAt,updatedAt,...fields}=edge;return {...fields,id:_id,createdAt:createdAt.toISOString(),updatedAt:updatedAt.toISOString()};};
    // 외부 Spring 경계 대역만 business commit을 수행하며 Node worker는 실제 metadata 원장을 사용합니다.
    const spring:SpringPropertyMutationPort={
      async receipt(actor,mutationId,recordId,operationFingerprint){const receipt=await state.db.careerPropertyMutationReceipts.findOne({userId:actor,mutationId,recordId,operationFingerprint});return receipt?{data:business(receipt.response),changed:receipt.changed,replayed:true}:null;},
      async read(actor,mutationId,recordId){
        const job=(await state.db.careerPropertyMutations.findOne({_id:mutationId,userId:actor}))!,record=(await state.db.careerRecords.findOne({_id:recordId,userId:actor}))!,backup=await state.db.careerRelationPropertyTombstones.findOne({userId:actor,recordId,propertyId:job.propertyId});
        const edges=await state.db.careerRecordRelations.find({userId:actor,sourceRecordId:recordId,sourcePropertyId:job.propertyId}).toArray(),targetRecordVersions:Record<string,number>={};
        for(const id of new Set([...edges.map(edge=>edge.targetRecordId),...Object.keys(backup?.inverseRecordVersions??{})]))targetRecordVersions[id]=(await state.db.careerRecords.findOne({_id:id,userId:actor}))!.version;
        const tombstone=backup?{deletionMutationId:backup.deletionMutationId,propertyId:backup.propertyId,definitionVersion:backup.definitionVersion,deletedAt:backup.deletedAt,categoryVersion:backup.categoryVersion,schemaVersion:backup.schemaVersion,config:backup.config,sourceRecordVersion:backup.sourceRecordVersion,forwardEdges:backup.forwardEdges.map(wire),inverseEdges:backup.inverseEdges.map(wire),inverseDefinitionBindings:backup.inverseDefinitionBindings,inverseRecordVersions:backup.inverseRecordVersions,inverseRecordReferenceVersions:backup.inverseRecordReferenceVersions}:null;
        return {data:business(record),relation:{edges:edges.map(wire),inverseEdges:[],targetRecordVersions,tombstone}};
      },
      async commit(actor,command){if(!("relationChanges" in command))throw new Error("relation boundary expected");
        return inTransaction(fixture.resource,async tx=>{
          const db=mongoCollections(tx.db),options={session:tx.session},job=(await db.careerPropertyMutations.findOne({_id:command.mutationId,userId:actor},options))!,plan=JSON.parse(job.planJson),current=(await db.careerRecords.findOne({_id:command.recordId,userId:actor},options))!,now=new Date();
          const fence=await db.careerPropertyMutations.updateOne({_id:job._id,userId:actor,status:"running",active:true,leaseToken:command.leaseToken,operationFingerprint:command.operationFingerprint,leaseUntil:{$gt:now}},{$inc:{commitFence:1}},options);expect(fence.matchedCount).toBe(1);
          expect(current.version).toBe(command.expectedVersion);
          if(plan.operation.kind==="deletion"){
            const edges=await db.careerRecordRelations.find({userId:actor,sourceRecordId:current._id,sourcePropertyId:job.propertyId},options).toArray(),inverseRecordVersions:Record<string,number>={},inverseRecordReferenceVersions:Record<string,number>={};
            for(const targetId of new Set(edges.map(edge=>edge.targetRecordId))){const target=(await db.careerRecords.findOne({_id:targetId,userId:actor},options))!;inverseRecordVersions[targetId]=target.version;inverseRecordReferenceVersions[targetId]=(target.referenceVersion??0)+1;await db.careerRecords.updateOne({_id:targetId,userId:actor},{$inc:{referenceVersion:1}},options);}
            await db.careerRelationPropertyTombstones.insertOne({_id:randomUUID(),userId:actor,categoryId:job.categoryId,propertyId:job.propertyId,recordId:current._id,deletionMutationId:job._id,definitionVersion:plan.operation.target.version,deletedAt:plan.operation.target.deletedAt,categoryVersion:plan.categoryVersion,schemaVersion:plan.schemaVersion,config:plan.operation.target.config,sourceRecordVersion:current.version+1,forwardEdges:edges,inverseEdges:[],inverseDefinitionBindings:[],inverseRecordVersions,inverseRecordReferenceVersions,createdAt:now},options);
            await db.careerRecordRelations.deleteMany({userId:actor,sourceRecordId:current._id,sourcePropertyId:job.propertyId},options);
          }else{
            const backup=(await db.careerRelationPropertyTombstones.findOne({userId:actor,recordId:current._id,propertyId:job.propertyId},options))!;
            expect(backup.sourceRecordVersion).toBe(current.version);expect(command.relationChanges.targetRecordIds).toEqual([state.target]);
            await db.careerRecordRelations.insertMany(backup.forwardEdges,options);await db.careerRelationPropertyTombstones.deleteOne({_id:backup._id,userId:actor},options);
          }
          const updated=await db.careerRecords.findOneAndUpdate({_id:current._id,userId:actor,version:command.expectedVersion},{$inc:{version:1,referenceVersion:1},$set:{updatedAt:now}},{...options,returnDocument:"after"});expect(updated).not.toBeNull();
          const response={_id:updated!._id,userId:actor,categoryId:updated!.categoryId,title:updated!.title,status:updated!.status,propertyValues:updated!.propertyValues!,version:updated!.version,updatedAt:updated!.updatedAt};
          await db.careerPropertyMutationReceipts.insertOne({_id:randomUUID(),userId:actor,mutationId:job._id,recordId:current._id,operationFingerprint:job.operationFingerprint,response,changed:true,createdAt:now},options);
          return {data:business(response),changed:true,replayed:false};
        });
      },
    };
    for(const [index,kind] of (["delete","restore"] as const).entries()){
      const change={kind,propertyId:state.relation},preview=await schema.previewChange(userId,state.categoryId,change);
      await schema.applyChange(userId,state.categoryId,preview.categoryVersion,randomUUID(),{change,previewToken:preview.previewToken,confirmLossy:true});
      const job=(await state.db.careerPropertyMutations.findOne({userId,categoryId:state.categoryId,active:true}))!;
      expect(job).not.toBeNull();
      expect(await state.db.outboxEvents.findOne({topic:"career.computation","payload.recordId":state.recordId,"payload.sourceSchemaVersion":preview.categoryVersion+1})).toBeNull();
      await new CanonicalPropertyMutationWorker(fixture.resource,spring).run(job._id,job.operationFingerprint);
      const event=(await state.db.outboxEvents.findOne({topic:"career.computation","payload.recordId":state.recordId,idempotencyKey:"career-canonical-completed:"+job._id+":"+state.recordId}))!;
      expect(event).not.toBeNull();expect(event.payload.sourceRecordVersion).toBe(before.version+index+1);
      await state.service.recompute({...event.payload,eventId:event._id} as any);
      const after=(await state.db.careerRecords.findOne({_id:state.recordId}))!;
      if(kind==="delete"){expect(after.computedProperties?.total).toBeUndefined();expect(await state.db.careerRecordRelations.countDocuments({sourceRecordId:state.recordId})).toBe(0);}
      else{expect(after.computedProperties?.total).toMatchObject({value:3});expect(await state.db.careerRecordRelations.findOne({_id:originalEdge._id})).toEqual(originalEdge);}
      expect(after).toMatchObject({version:before.version+index+1,propertyValues:before.propertyValues,properties:before.properties,bodyMd:before.bodyMd,documentVersion:before.documentVersion,latestSnapshotId:before.latestSnapshotId});
    }
    expect(await state.db.careerPropertyMutations.countDocuments({categoryId:state.categoryId,status:"completed",active:false})).toBe(2);
    expect(await state.db.careerRelationPropertyTombstones.countDocuments({categoryId:state.categoryId})).toBe(0);
  });
  it("published refreshes at the same business version have distinct schema identities",async()=>{
    const state=await setup();await state.db.outboxEvents.deleteMany({"payload.recordId":state.recordId});const stale={...state.event,sourceRecordVersion:0};
    expect(await state.service.recompute(stale)).toBe("stale");
    const first=(await state.db.outboxEvents.findOne({"payload.recordId":state.recordId,idempotencyKey:{$regex:"^career-computation-fresh:"}}))!;expect(first).not.toBeNull();
    await state.db.outboxEvents.updateOne({_id:first._id},{$set:{state:"published"}});
    await state.db.careerCategories.updateOne({_id:state.categoryId},{$inc:{version:1,schemaVersion:1,"propertySchemaV2.1.version":1},$set:{"propertySchemaV2.1.config.source":`prop("${state.score}") * 3`}});
    expect(await state.service.recompute({...stale,eventId:randomUUID()})).toBe("stale");
    const refreshes=await state.db.outboxEvents.find({"payload.recordId":state.recordId,idempotencyKey:{$regex:"^career-computation-fresh:"}}).toArray();
    expect(refreshes).toHaveLength(2);expect(new Set(refreshes.map(row=>row.idempotencyKey)).size).toBe(2);
    const latest=refreshes.find(row=>row._id!==first._id)!;
    expect(await state.service.recompute({...latest.payload,eventId:latest._id} as any)).toBe("applied");
    expect((await state.db.careerRecords.findOne({_id:state.recordId}))?.computedProperties?.double).toMatchObject({value:9});
    expect(await state.service.recompute({...latest.payload,eventId:latest._id} as any)).toBe("duplicate");
    expect(await state.service.recompute({...stale,eventId:randomUUID()})).toBe("stale");
    expect(await state.db.outboxEvents.countDocuments({"payload.recordId":state.recordId,idempotencyKey:{$regex:"^career-computation-fresh:"}})).toBe(2);
  });
  it.each(["trash","restore"] as const)("rejects a rollup target %s race and emits a corrective refresh",async direction=>{
    const state=await setupRollup();await state.service.recompute(state.event);
    if(direction==="restore")await state.db.careerRecords.updateOne({_id:state.target},{$set:{deletedAt:new Date()},$inc:{version:1}});
    const original=MongoCareerComputationRepository.prototype.readableCategory;let reads=0,mutated=false;
    const spy=vi.spyOn(MongoCareerComputationRepository.prototype,"readableCategory").mockImplementation(async function(this:MongoCareerComputationRepository,...args){
      const category=await original.apply(this,args);
      if(this.options().session && ++reads===2 && !mutated) {
        mutated=true;await state.db.careerRecords.updateOne({_id:state.target},{$set:{deletedAt:direction==="trash"?new Date():null},$inc:{version:1}});
      }
      return category;
    });
    try {expect(await state.service.recompute({...state.event,eventId:randomUUID()})).toBe("stale");}finally{spy.mockRestore();}
    expect(mutated).toBe(true);
    const fresh=await state.db.outboxEvents.findOne({"payload.recordId":state.recordId,idempotencyKey:{$regex:"^career-computation-fresh:"}},{sort:{createdAt:-1}});
    expect(fresh).not.toBeNull();await state.service.recompute({...fresh!.payload,eventId:fresh!._id} as any);
    const after=(await state.db.careerRecords.findOne({_id:state.recordId}))!;
    expect(after.computedProperties?.total).toMatchObject({value:direction==="trash"?null:3});
    expect(after).toMatchObject({version:1,bodyMd:"doc sentinel",documentVersion:7});
  });
  it("prepared lifecycle invalidation republishes dependent projections idempotently on trash and restore",async()=>{
    const state=await setupRollup();await state.service.recompute(state.event);
    for(const deletedAt of [new Date(),null]) {
      const target=await state.db.careerRecords.findOneAndUpdate({_id:state.target},{$set:{deletedAt},$inc:{version:1}},{returnDocument:"after"});
      const processor=createCareerComputationTargetStateProcessor(state.service);
      const job={data:{userId,targetRecordId:state.target,targetRecordVersion:target!.version}} as any;
      await processor(job);await processor(job);
      const refreshes=await state.db.outboxEvents.find({"payload.recordId":state.recordId,"payload.refreshCause":`target:${state.target}:v${target!.version}`}).toArray();
      expect(refreshes).toHaveLength(1);
      await state.service.recompute({...refreshes[0]!.payload,eventId:refreshes[0]!._id} as any);
      const after=(await state.db.careerRecords.findOne({_id:state.recordId}))!;
      expect(after.computedProperties?.total).toMatchObject({value:deletedAt===null?3:null});
      expect(after).toMatchObject({version:1,bodyMd:"doc sentinel",documentVersion:7});
    }
  });
  it("pending refreshes preserve their own schema binding and the processor rejects obsolete binding",async()=>{
    const state=await setup();await state.db.outboxEvents.deleteMany({"payload.recordId":state.recordId});
    const stale={...state.event,sourceRecordVersion:0};await state.service.recompute(stale);
    const old=(await state.db.outboxEvents.findOne({"payload.recordId":state.recordId}))!;
    await state.db.careerCategories.updateOne({_id:state.categoryId},{$inc:{version:1,schemaVersion:1,"propertySchemaV2.1.version":1},$set:{"propertySchemaV2.1.config.source":`prop("${state.score}") * 4`}});
    await state.service.recompute({...stale,eventId:randomUUID()});
    expect((await state.db.outboxEvents.findOne({_id:old._id}))?.payload).toEqual(old.payload);
    const fresh=(await state.db.outboxEvents.findOne({"payload.recordId":state.recordId,"payload.sourceSchemaVersion":2}))!;
    const processor=createCareerComputationProcessor(state.service);
    expect(await processor({id:old._id,data:old.payload} as any)).toBe("stale");
    expect(await processor({id:fresh._id,data:fresh.payload} as any)).toBe("applied");
    expect((await state.db.careerRecords.findOne({_id:state.recordId}))?.computedProperties?.double).toMatchObject({value:12});
  });
  it("delayed lifecycle delivery after target purge clears stale rollup and replays idempotently",async()=>{
    const state=await setupRollup();await state.service.recompute(state.event);
    const before=(await state.db.careerRecords.findOne({_id:state.recordId}))!;
    expect(before.computedProperties?.total).toMatchObject({value:3});
    await state.db.careerRecords.updateOne({_id:state.target},{$set:{deletedAt:new Date()},$inc:{version:1}});
    await state.db.careerRecords.deleteOne({_id:state.target});
    expect(await state.db.careerRecordRelations.countDocuments({targetRecordId:state.target})).toBe(1);
    const delivery={data:{userId,targetRecordId:state.target,targetRecordVersion:2}} as any;
    const processor=createCareerComputationTargetStateProcessor(state.service);
    await processor(delivery);await processor(delivery);
    const refreshes=await state.db.outboxEvents.find({"payload.recordId":state.recordId,"payload.refreshCause":`target:${state.target}:missing:v2`}).toArray();
    expect(refreshes).toHaveLength(1);
    const refresh=refreshes[0]!;
    expect(await state.service.recompute({...refresh.payload,eventId:refresh._id} as any)).toBe("applied");
    const after=(await state.db.careerRecords.findOne({_id:state.recordId}))!;
    expect(after.computedProperties?.total).toMatchObject({value:null});
    const {computedProperties:oldComputed,computedAt:oldAt,computationVersion:oldRevision,...businessBefore}=before;
    const {computedProperties:newComputed,computedAt:newAt,computationVersion:newRevision,...businessAfter}=after;
    expect(businessAfter).toEqual(businessBefore);
    expect(await state.service.recompute({...refresh.payload,eventId:refresh._id} as any)).toBe("duplicate");
    expect(await state.db.careerRecords.findOne({_id:state.recordId})).toEqual(after);
  });
  it("purged target refresh respects concurrent source and schema changes",async()=>{
    const state=await setupRollup();await state.service.recompute(state.event);
    await state.db.careerRecords.deleteOne({_id:state.target});
    await state.service.invalidateTargetState(userId,state.target,2);
    const stale=(await state.db.outboxEvents.findOne({"payload.recordId":state.recordId,"payload.refreshCause":`target:${state.target}:missing:v2`}))!;
    expect(stale).not.toBeNull();
    await state.db.careerRecords.updateOne({_id:state.recordId},{$inc:{version:1},$set:{title:"concurrent user edit",updatedAt:new Date()}});
    await state.db.careerCategories.updateOne({_id:state.categoryId},{$inc:{version:1,schemaVersion:1,"propertySchemaV2.1.version":1},$set:{"propertySchemaV2.1.config.source":`prop("${state.score}") * 4`}});
    expect(await state.service.recompute({...stale.payload,eventId:stale._id} as any)).toBe("stale");
    await state.service.invalidateTargetState(userId,state.target,2);
    const fresh=(await state.db.outboxEvents.findOne({"payload.recordId":state.recordId,"payload.refreshCause":`target:${state.target}:missing:v2`,"payload.sourceRecordVersion":2,"payload.sourceSchemaVersion":2}))!;
    expect(fresh).not.toBeNull();expect(fresh._id).not.toBe(stale._id);
    const before=(await state.db.careerRecords.findOne({_id:state.recordId}))!;
    expect(await state.service.recompute({...fresh.payload,eventId:fresh._id} as any)).toBe("applied");
    const after=(await state.db.careerRecords.findOne({_id:state.recordId}))!;
    expect(after.computedProperties?.total).toMatchObject({value:null});expect(after.computedProperties?.double).toMatchObject({value:12});
    expect(after).toMatchObject({title:before.title,version:before.version,updatedAt:before.updatedAt,propertyValues:before.propertyValues,bodyMd:before.bodyMd,documentVersion:before.documentVersion});
  });
  it("target lookup errors remain retryable failures rather than missing-target refreshes",async()=>{
    const state=await setupRollup();await state.db.careerRecords.deleteOne({_id:state.target});
    const original=MongoCareerComputationRepository.prototype.records;
    const outage=new MongoNetworkError("injected target lookup outage");
    const spy=vi.spyOn(MongoCareerComputationRepository.prototype,"records").mockImplementation(function(this:MongoCareerComputationRepository){
      const records=original.call(this);
      return new Proxy(records,{get(collection,key){
        if(key==="findOne")return (...args:Parameters<typeof collection.findOne>)=>{
          if(args[0]?._id===state.target)throw outage;
          return collection.findOne(...args);
        };
        const value=Reflect.get(collection,key);return typeof value==="function"?value.bind(collection):value;
      }});
    });
    try {await expect(state.service.invalidateTargetState(userId,state.target,2)).rejects.toBe(outage);}finally{spy.mockRestore();}
    expect(await state.db.outboxEvents.countDocuments({"payload.recordId":state.recordId,"payload.refreshCause":`target:${state.target}:missing:v2`})).toBe(0);
    await state.service.invalidateTargetState(userId,state.target,2);
    expect(await state.db.outboxEvents.countDocuments({"payload.recordId":state.recordId,"payload.refreshCause":`target:${state.target}:missing:v2`})).toBe(1);
  });
  it("reads canonical input and writes derived metadata only, including duplicate retry",async()=>{
    const state=await setup();const before=await state.db.careerRecords.findOne({_id:state.recordId});expect(await state.service.recompute(state.event)).toBe("applied");
    const after=await state.db.careerRecords.findOne({_id:state.recordId});expect(after?.computedProperties?.double).toMatchObject({value:6});
    expect(after).toMatchObject({version:1,updatedAt:before!.updatedAt,properties:before!.properties,propertyValues:before!.propertyValues,bodyMd:before!.bodyMd,documentVersion:7,latestSnapshotId:(before as any).latestSnapshotId,computationVersion:1});
    expect(await state.service.recompute(state.event)).toBe("duplicate");expect(await state.db.careerRecords.findOne({_id:state.recordId})).toEqual(after);
  });
  it("concurrent projections serialize without incrementing business version",async()=>{
    const state=await setup();expect(await Promise.all([state.service.recompute(state.event),state.service.recompute({...state.event,eventId:randomUUID()})])).toEqual(["applied","applied"]);
    expect(await state.db.careerRecords.findOne({_id:state.recordId})).toMatchObject({version:1,computationVersion:2});
  });
  it("rejects stale record/schema events and removes deleted derived output",async()=>{
    const state=await setup();await state.service.recompute(state.event);
    await state.db.careerRecords.updateOne({_id:state.recordId},{$inc:{version:1}});
    expect(await state.service.recompute({...state.event,eventId:randomUUID()})).toBe("stale");
    await state.db.careerCategories.updateOne({_id:state.categoryId,"propertySchemaV2.id":state.formula},{$set:{"propertySchemaV2.$.deletedAt":new Date().toISOString()},$inc:{"propertySchemaV2.$.version":1,version:1,schemaVersion:1}});
    expect(await state.service.recompute({...state.event,eventId:randomUUID(),sourceRecordVersion:2,changedPropertyIds:[state.formula],sourcePropertyVersions:{[state.formula]:1}})).toBe("stale");
    expect(await state.service.recompute({...state.event,eventId:randomUUID(),sourceRecordVersion:2,changedPropertyIds:[state.formula],sourcePropertyVersions:{[state.formula]:2}})).toBe("applied");
    expect((await state.db.careerRecords.findOne({_id:state.recordId}))?.computedProperties?.double).toBeUndefined();
  });
  it("rollup reads target canonical values rather than legacy properties",async()=>{
    const state=await setup();const relation=randomUUID(),rollup=randomUUID();
    const defs=(await state.db.careerCategories.findOne({_id:state.categoryId}))!.propertySchemaV2!;
    const base={required:false,system:false,order:0,version:1,deletedAt:null};
    await state.db.careerCategories.updateOne({_id:state.categoryId},{$set:{propertySchemaV2:[...defs,{...base,id:relation,key:"targets",name:"targets",type:"relation",config:{targetCategoryId:state.categoryId,inversePropertyId:null,cardinality:"multiple",deletePolicy:"restrict"}},{...base,id:rollup,key:"total",name:"total",type:"rollup",config:{relationPropertyId:relation,targetPropertyId:state.score,aggregation:"sum"}}]}});
    const target=randomUUID(),now=new Date();const source=(await state.db.careerRecords.findOne({_id:state.recordId}))!;await state.db.careerRecords.insertOne({...source,_id:target,createIdempotencyKey:randomUUID()});
    await state.db.careerRecordRelations.insertOne({_id:randomUUID(),userId,sourceRecordId:state.recordId,sourcePropertyId:relation,targetRecordId:target,inversePropertyId:null,cardinality:"multiple",deletePolicy:"restrict",createdBy:"user",createdAt:now,updatedAt:now});
    await state.service.recompute({...state.event,changedPropertyIds:[relation]});expect((await state.db.careerRecords.findOne({_id:state.recordId}))?.computedProperties?.total).toMatchObject({value:3});
  });
});
