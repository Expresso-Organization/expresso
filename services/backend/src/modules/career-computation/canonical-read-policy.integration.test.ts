import { randomUUID } from "node:crypto";
import { Decimal128 } from "mongodb";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import type { CareerPropertyDefinitionV2 } from "@expresso/contracts";
import { mongoCollections,type CareerCategoryDoc,type CareerRecordDoc } from "@expresso/database";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoIdentityService } from "../identity/index.js";
import { MongoCanonicalCareerPropertySchemaService } from "../career/canonical-property-schema.js";
import { mutationCanonicalJson,mutationFingerprint } from "../career/property-mutation-state.js";
import { MongoCareerComputationService } from "./service.js";

describe.skipIf(!process.env.TEST_MONGODB_URL)("canonical computation read policy on disposable Mongo",()=>{
 let fixture:Awaited<ReturnType<typeof createMongoFixture>>,userA:string,userB:string;
 const now=new Date("2026-10-09T00:00:00Z"),secret="computation-snapshot-preview-secret-with-32-bytes";
 const definition=(id:string,key:string,type:CareerPropertyDefinitionV2["type"],config:Record<string,unknown>={}):CareerPropertyDefinitionV2=>({id,key,name:key,type,required:false,system:false,config,order:0,version:1,deletedAt:null});
 function category(id:string,defs:CareerPropertyDefinitionV2[]):CareerCategoryDoc{return {_id:id,userId:userA,key:"computation-"+id,name:"computation",icon:"note",defaultView:"table",propertySchemaV2:defs,schemaVersion:1,version:1,sortOrder:0,updatedAt:now};}
 function record(id:string,categoryId:string):CareerRecordDoc{return {_id:id,userId:userA,categoryId,title:"canonical",status:"draft",origin:"manual",properties:{tags:{type:"multi_select",value:["legacy wrong"]}},propertyValues:[],bodyMd:"document sentinel",documentVersion:7,version:1,createdAt:now,updatedAt:now,deletedAt:null};}
 beforeAll(async()=>{
  fixture=await createMongoFixture("b2comppolicy");const identity=new MongoIdentityService(fixture.resource);
  userA=(await identity.signup({email:"computation-a-"+randomUUID()+"@example.test",password:"disposable-computation-password",displayName:"A"})).user.id;
  userB=(await identity.signup({email:"computation-b-"+randomUUID()+"@example.test",password:"disposable-computation-password",displayName:"B"})).user.id;
 },60000);
 afterAll(async()=>fixture?.dispose());
 async function relationState(){
  const db=mongoCollections(fixture.resource.db),sourceCategory=randomUUID(),targetCategory=randomUUID(),sourceId=randomUUID(),targetId=randomUUID(),relationId=randomUUID(),inverseId=randomUUID(),scoreId=randomUUID(),rollupId=randomUUID();
  const relation=definition(relationId,"related","relation",{targetCategoryId:targetCategory,inversePropertyId:inverseId,cardinality:"multiple",deletePolicy:"restrict"}),inverse=definition(inverseId,"back","relation",{targetCategoryId:sourceCategory,inversePropertyId:relationId,cardinality:"multiple",deletePolicy:"restrict"}),score=definition(scoreId,"score","number"),rollup=definition(rollupId,"total","rollup",{relationPropertyId:relationId,targetPropertyId:scoreId,aggregation:"sum"});
  await db.careerCategories.insertMany([category(sourceCategory,[relation,rollup]),category(targetCategory,[inverse,score])]);
  await db.careerRecords.insertMany([record(sourceId,sourceCategory),{...record(targetId,targetCategory),propertyValues:[{propertyDefinitionId:scoreId,type:"number",value:Decimal128.fromString("3.00")}]}]);
  const edge={_id:randomUUID(),userId:userA,sourceRecordId:sourceId,sourcePropertyId:relationId,targetRecordId:targetId,inversePropertyId:inverseId,cardinality:"multiple" as const,deletePolicy:"restrict" as const,createdBy:"user" as const,createdAt:now,updatedAt:now};
  await db.careerRecordRelations.insertOne(edge);
  const service=new MongoCareerComputationService(fixture.resource,"canonical"),input={categoryId:sourceCategory,recordId:sourceId,relationPropertyId:relationId,targetPropertyId:scoreId,aggregation:"sum" as const},event={eventId:randomUUID(),userId:userA,recordId:sourceId,changedPropertyIds:[relationId],sourceRecordVersion:1};
  return {db,service,input,event,sourceCategory,targetCategory,sourceId,targetId,relationId,inverseId,scoreId,rollupId,relation,inverse,score,rollup,edge};
 }
 async function inverseRollupState(mirrored=false){
  const state=await relationState(),rollup={...state.rollup,config:{relationPropertyId:state.inverseId,targetPropertyId:state.scoreId,aggregation:"sum"}};
  await state.db.careerCategories.updateOne({_id:state.sourceCategory},{$set:{propertySchemaV2:[state.relation,state.score]}});
  await state.db.careerCategories.updateOne({_id:state.targetCategory},{$set:{propertySchemaV2:[state.inverse,rollup]}});
  await state.db.careerRecords.updateOne({_id:state.sourceId},{$set:{propertyValues:[{propertyDefinitionId:state.scoreId,type:"number",value:Decimal128.fromString("7")}],version:2}});
  await state.db.careerRecords.updateOne({_id:state.targetId},{$set:{propertyValues:[]}});
  if(mirrored)await state.db.careerRecordRelations.insertOne({...state.edge,_id:randomUUID(),sourceRecordId:state.targetId,sourcePropertyId:state.inverseId,targetRecordId:state.sourceId,inversePropertyId:state.relationId});
  return state;
 }
 it.each([false,true])("refreshes inverse rollups once after a value change (mirrored=%s)",async mirrored=>{
  const state=await inverseRollupState(mirrored),event={eventId:randomUUID(),userId:userA,recordId:state.sourceId,changedPropertyIds:[state.scoreId],sourceRecordVersion:2};
  expect(await state.service.recompute(event)).toBe("applied");
  const events=await state.db.outboxEvents.find({userId:userA,topic:"career.computation","payload.recordId":state.targetId}).toArray();
  expect(events).toHaveLength(1);
  expect(events[0]!.payload).toMatchObject({recordId:state.targetId,changedPropertyIds:[state.inverseId],sourceRecordVersion:1});
  expect(await state.service.recompute({...events[0]!.payload,eventId:events[0]!._id} as typeof event)).toBe("applied");
  expect((await state.db.careerRecords.findOne({_id:state.targetId}))?.computedProperties?.total).toMatchObject({value:7});
  expect(await state.service.recompute(event)).toBe("duplicate");
  expect(await state.db.outboxEvents.countDocuments({topic:"career.computation","payload.recordId":state.targetId})).toBe(1);
 });
 it("durably refreshes inverse rollups after incoming-only source trash and restoration",async()=>{
  const state=await inverseRollupState();
  for(const [version,deletedAt,value] of [[3,now,null],[4,null,7]] as const){
   await state.db.careerRecords.updateOne({_id:state.sourceId},{$set:{version,deletedAt}});
   await state.service.invalidateTargetState(userA,state.sourceId,version);
   const events=await state.db.outboxEvents.find({topic:"career.computation","payload.recordId":state.targetId,"payload.refreshCause":`target:${state.sourceId}:v${version}`}).toArray();
   expect(events).toHaveLength(1);
   expect(await state.service.recompute({...events[0]!.payload,eventId:events[0]!._id} as typeof state.event)).toBe("applied");
   expect((await state.db.careerRecords.findOne({_id:state.targetId}))?.computedProperties?.total).toMatchObject({value});
   await state.service.invalidateTargetState(userA,state.sourceId,version);
   expect(await state.db.outboxEvents.countDocuments({topic:"career.computation","payload.recordId":state.targetId,"payload.refreshCause":`target:${state.sourceId}:v${version}`})).toBe(1);
  }
  expect(await state.db.careerRecordRelations.findOne({_id:state.edge._id})).toEqual(state.edge);
 });
 async function pendingRelation(state:Awaited<ReturnType<typeof relationState>>,inverseJob=false,kind:"deletion"|"restoration"="restoration"){
  const property=inverseJob?state.inverse:state.relation,categoryId=inverseJob?state.targetCategory:state.sourceCategory,recordId=inverseJob?state.targetId:state.sourceId;
  const target={...property,version:2,deletedAt:kind==="deletion"?now.toISOString():null},source=kind==="restoration"?{...property,deletedAt:now.toISOString()}:property,defs=inverseJob?[target,state.score]:[target,state.rollup];
  await state.db.careerCategories.updateOne({_id:categoryId},{$set:{version:2,schemaVersion:2,propertySchemaV2:defs}});
  const plan={userId:userA,categoryId,categoryVersion:2,schemaVersion:2,definitions:defs,recordIds:[recordId],operation:{kind,source,target,defaultValue:null,confirmLossy:true}},jobId=randomUUID();
  await state.db.careerPropertyMutations.insertOne({_id:jobId,userId:userA,categoryId,propertyId:property.id,planJson:mutationCanonicalJson(plan),operationFingerprint:mutationFingerprint(plan),status:"running",active:true,cursor:0,processedCount:0,skippedCount:0,attempts:1,leaseToken:null,leaseUntil:null,lastError:null,commitFence:1,createdAt:now,updatedAt:now,completedAt:null});
  return jobId;
 }
 it.each([false,true])("blocks partial restoration preview and leaves recomputation unwritten (inverse job=%s)",async inverseJob=>{
  const state=await relationState(),jobId=await pendingRelation(state,inverseJob),before=await state.db.careerRecords.findOne({_id:state.sourceId});
  await expect(state.service.previewRollup(userA,state.input)).rejects.toMatchObject({statusCode:409,message:"CAREER_RELATION_PROJECTION_PENDING"});
  expect(await state.service.recompute(state.event)).toBe("stale");
  expect(await state.db.careerRecords.findOne({_id:state.sourceId})).toEqual(before);
  expect(await state.db.outboxEvents.countDocuments({"payload.recordId":state.sourceId})).toBe(0);
  await state.db.careerPropertyMutations.updateOne({_id:jobId},{$set:{status:"completed",active:false,cursor:1,processedCount:1,completedAt:now}});
  expect((await state.service.previewRollup(userA,state.input)).value).toMatchObject({value:3});
  expect(await state.service.recompute(state.event)).toBe("applied");
 });
 it.each([false,true])("blocks pending deletion before evaluating a disappeared relation (inverse job=%s)",async inverseJob=>{
  const state=await relationState();await pendingRelation(state,inverseJob,"deletion");const before=await state.db.careerRecords.findOne({_id:state.sourceId});
  await expect(state.service.previewRollup(userA,state.input)).rejects.toMatchObject({statusCode:409,message:"CAREER_RELATION_PROJECTION_PENDING"});
  expect(await state.service.recompute(state.event)).toBe("stale");
  expect(await state.db.careerRecords.findOne({_id:state.sourceId})).toEqual(before);
  expect(await state.db.outboxEvents.countDocuments({"payload.recordId":state.sourceId})).toBe(0);
 });
 it.each(["inverse","moved"] as const)("excludes %s-invalid canonical edges without changing relation state",async kind=>{
  const state=await relationState();
  if(kind==="inverse")await state.db.careerCategories.updateOne({_id:state.targetCategory},{$set:{propertySchemaV2:[state.score]}});
  else {const moved=randomUUID();await state.db.careerCategories.insertOne(category(moved,[state.inverse,state.score]));await state.db.careerRecords.updateOne({_id:state.targetId},{$set:{categoryId:moved}});}
  expect((await state.service.previewRollup(userA,state.input)).value).toMatchObject({value:null});
  expect(await state.service.recompute(state.event)).toBe("applied");
  expect((await state.db.careerRecords.findOne({_id:state.sourceId}))?.computedProperties?.total).toMatchObject({value:null});
  expect(await state.db.careerRecordRelations.findOne({_id:state.edge._id})).toEqual(state.edge);
 });
 async function tagState(freeform=true){
  const db=mongoCollections(fixture.resource.db),categoryId=randomUUID(),recordId=randomUUID(),propertyId=randomUUID(),formulaId=randomUUID(),commonId=randomUUID();
  const tags=definition(propertyId,"tags","multi_select",{legacyFreeformTags:freeform,options:[{id:commonId,label:"JavaScript"}]}),formula=definition(formulaId,"joined","formula",{source:`join(prop("${propertyId}"), ", ")`});
  await db.careerCategories.insertOne(category(categoryId,[tags,formula]));
  const schema=new MongoCanonicalCareerPropertySchemaService(fixture.resource,secret),privateId=freeform?(await schema.registerOption(userA,categoryId,propertyId,{label:" Exact label "})).data.id:null;
  if(freeform)await db.careerPropertyOptions.insertOne({_id:randomUUID(),userId:userB,categoryId,propertyId,optionId:privateId!,rawLabel:"Foreign secret",version:1,createdAt:now});
  const ids=privateId?[commonId,privateId]:[commonId];
  await db.careerRecords.insertOne({...record(recordId,categoryId),propertyValues:[{propertyDefinitionId:propertyId,type:"multi_select",value:ids}]});
  const service=new MongoCareerComputationService(fixture.resource,"canonical"),event={eventId:randomUUID(),userId:userA,recordId,changedPropertyIds:[propertyId],sourceRecordVersion:1};
  return {db,categoryId,recordId,propertyId,formulaId,commonId,privateId,ids,tags,formula,schema,service,event};
 }
 it("uses exact owner labels for legacy freeform formulas and rollups while preserving fixed IDs",async()=>{
  const state=await tagState(),before=await state.db.careerRecords.findOne({_id:state.recordId});
  const preview=await state.service.previewFormula(userA,{categoryId:state.categoryId,recordId:state.recordId,source:`join(prop("${state.propertyId}"), ", ")`});
  expect(preview.value).toMatchObject({value:"JavaScript,  Exact label "});
  expect((await state.service.previewFormula(userA,{categoryId:state.categoryId,recordId:state.recordId,source:`contains(prop("${state.propertyId}"), "JavaScript")`})).value).toMatchObject({value:true});
  expect(await state.service.recompute(state.event)).toBe("applied");
  const after=await state.db.careerRecords.findOne({_id:state.recordId});
  expect(after?.computedProperties?.joined).toMatchObject({value:"JavaScript,  Exact label "});
  expect(after).toMatchObject({version:before!.version,propertyValues:before!.propertyValues,properties:before!.properties,bodyMd:before!.bodyMd,documentVersion:before!.documentVersion});
  const sourceCategory=randomUUID(),sourceId=randomUUID(),relationId=randomUUID(),relation=definition(relationId,"targets","relation",{targetCategoryId:state.categoryId,inversePropertyId:null,cardinality:"multiple",deletePolicy:"restrict"});
  await state.db.careerCategories.insertOne(category(sourceCategory,[relation]));await state.db.careerRecords.insertOne(record(sourceId,sourceCategory));
  await state.db.careerRecordRelations.insertOne({_id:randomUUID(),userId:userA,sourceRecordId:sourceId,sourcePropertyId:relationId,targetRecordId:state.recordId,inversePropertyId:null,cardinality:"multiple",deletePolicy:"restrict",createdBy:"user",createdAt:now,updatedAt:now});
  expect((await state.service.previewRollup(userA,{categoryId:sourceCategory,recordId:sourceId,relationPropertyId:relationId,targetPropertyId:state.propertyId,aggregation:"show_unique"})).value).toMatchObject({value:["JavaScript"," Exact label "]});
  const fixed=await tagState(false);
  expect((await fixed.service.previewFormula(userA,{categoryId:fixed.categoryId,recordId:fixed.recordId,source:`join(prop("${fixed.propertyId}"), ", ")`})).value).toMatchObject({value:fixed.commonId});
 });
 it("uses immutable source option labels during a same-type conversion and rejects foreign IDs",async()=>{
  const state=await tagState(),change={kind:"type-change" as const,propertyId:state.propertyId,type:"multi_select" as const,config:{options:[],legacyFreeformTags:true}},preview=await state.schema.previewChange(userA,state.categoryId,change);
  await state.schema.applyChange(userA,state.categoryId,preview.categoryVersion,randomUUID(),{change,previewToken:preview.previewToken,confirmLossy:true});
  await state.schema.registerOption(userA,state.categoryId,state.propertyId,{label:"Added later"});
  expect((await state.service.previewFormula(userA,{categoryId:state.categoryId,recordId:state.recordId,source:`join(prop("${state.propertyId}"), ", ")`})).value).toMatchObject({value:"JavaScript,  Exact label "});
  expect(await state.service.recompute(state.event)).toBe("applied");
  expect((await state.db.careerRecords.findOne({_id:state.recordId}))?.computedProperties?.joined).toMatchObject({value:"JavaScript,  Exact label "});
  const sourceCategory=randomUUID(),sourceId=randomUUID(),relationId=randomUUID(),relation=definition(relationId,"targets","relation",{targetCategoryId:state.categoryId,inversePropertyId:null,cardinality:"multiple",deletePolicy:"restrict"});
  await state.db.careerCategories.insertOne(category(sourceCategory,[relation]));await state.db.careerRecords.insertOne(record(sourceId,sourceCategory));
  await state.db.careerRecordRelations.insertOne({_id:randomUUID(),userId:userA,sourceRecordId:sourceId,sourcePropertyId:relationId,targetRecordId:state.recordId,inversePropertyId:null,cardinality:"multiple",deletePolicy:"restrict",createdBy:"user",createdAt:now,updatedAt:now});
  expect((await state.service.previewRollup(userA,{categoryId:sourceCategory,recordId:sourceId,relationPropertyId:relationId,targetPropertyId:state.propertyId,aggregation:"show_unique"})).value).toMatchObject({value:["JavaScript"," Exact label "]});
  const foreign=await tagState(),foreignId=randomUUID();
  await foreign.db.careerPropertyOptions.insertOne({_id:randomUUID(),userId:userB,categoryId:foreign.categoryId,propertyId:foreign.propertyId,optionId:foreignId,rawLabel:"Foreign only",version:1,createdAt:now});
  await foreign.db.careerRecords.updateOne({_id:foreign.recordId},{$set:{propertyValues:[{propertyDefinitionId:foreign.propertyId,type:"multi_select",value:[foreignId]}]}});
  await expect(foreign.service.previewFormula(userA,{categoryId:foreign.categoryId,recordId:foreign.recordId,source:`join(prop("${foreign.propertyId}"), ", ")`})).rejects.toMatchObject({statusCode:409,message:"CANONICAL_OPTION_LABEL_UNAVAILABLE"});
 });
});
