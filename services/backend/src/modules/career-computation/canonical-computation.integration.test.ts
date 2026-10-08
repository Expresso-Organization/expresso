import { randomUUID } from "node:crypto";
import { Decimal128, MongoNetworkError } from "mongodb";
import { mongoCollections } from "@expresso/database";
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
  it("relation definition delete clears dependent rollup and restore recreates it without business writes",async()=>{
    const state=await setupRollup();await state.service.recompute(state.event);
    expect((await state.db.careerRecords.findOne({_id:state.recordId}))?.computedProperties?.total).toMatchObject({value:3});
    const before=(await state.db.careerRecords.findOne({_id:state.recordId}))!;
    const schema=new MongoCanonicalCareerPropertySchemaService(fixture.resource,"prc-preview-secret-with-at-least-32-bytes");
    for(const kind of ["delete","restore"] as const) {
      const change={kind,propertyId:state.relation};const preview=await schema.previewChange(userId,state.categoryId,change);
      await schema.applyChange(userId,state.categoryId,preview.categoryVersion,randomUUID(),{change,previewToken:preview.previewToken,confirmLossy:true});
      const event=await state.db.outboxEvents.findOne({topic:"career.computation","payload.recordId":state.recordId,"payload.changedPropertyIds":state.relation},{sort:{createdAt:-1}});
      expect(event).not.toBeNull();
      await state.service.recompute({...event!.payload,eventId:event!._id} as any);
      const after=(await state.db.careerRecords.findOne({_id:state.recordId}))!;
      if(kind==="delete")expect(after.computedProperties?.total).toBeUndefined();else expect(after.computedProperties?.total).toMatchObject({value:3});
      expect(after).toMatchObject({version:before.version,updatedAt:before.updatedAt,propertyValues:before.propertyValues,bodyMd:before.bodyMd,documentVersion:before.documentVersion});
    }
    expect(await state.db.careerPropertyMutations.countDocuments({categoryId:state.categoryId})).toBe(0);
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
