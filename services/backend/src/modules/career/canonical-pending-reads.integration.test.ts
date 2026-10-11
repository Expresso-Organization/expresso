import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import type { CareerPropertyDefinitionV2 } from "@expresso/contracts";
import { mongoCollections,type CareerCategoryDoc,type CareerRecordDoc } from "@expresso/database";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoIdentityService } from "../identity/index.js";
import { CanonicalCareerReadService } from "./canonical-reads.js";
import { MongoCanonicalCareerPropertySchemaService } from "./canonical-property-schema.js";
import { mutationCanonicalJson,mutationFingerprint } from "./property-mutation-state.js";
describe.skipIf(!process.env.TEST_MONGODB_URL)("pending canonical read policy on disposable Mongo",()=>{
 let fixture:Awaited<ReturnType<typeof createMongoFixture>>,reader:CanonicalCareerReadService,userA:string,userB:string;
 const now=new Date("2026-10-09T00:00:00Z"),secret="snapshot-read-preview-secret-with-32-characters";
 const definition=(id:string,key:string,type:CareerPropertyDefinitionV2["type"],config:Record<string,unknown>={}):CareerPropertyDefinitionV2=>({id,key,name:key,type,required:false,system:false,config,order:0,version:1,deletedAt:null});
 function category(id:string,defs:CareerPropertyDefinitionV2[],user=userA):CareerCategoryDoc{return {_id:id,userId:user,key:"pending-"+id,name:"pending",icon:"note",defaultView:"table",isSystem:false,propertySchema:{},propertySchemaV2:defs,schemaVersion:1,version:1,sortOrder:0,updatedAt:now};}
 function record(id:string,categoryId:string,title:string,user=userA):CareerRecordDoc{return {_id:id,userId:user,categoryId,title,status:"draft",origin:"manual",properties:{opaque:"legacy sentinel"},propertyValues:[],bodyMd:"document sentinel",version:1,createdAt:now,updatedAt:now,deletedAt:null};}
 beforeAll(async()=>{
  fixture=await createMongoFixture("b2pendingreads");reader=new CanonicalCareerReadService(fixture.resource);
  const identity=new MongoIdentityService(fixture.resource);
  userA=(await identity.signup({email:"pending-a-"+randomUUID()+"@example.test",password:"disposable-pending-password",displayName:"A"})).user.id;
  userB=(await identity.signup({email:"pending-b-"+randomUUID()+"@example.test",password:"disposable-pending-password",displayName:"B"})).user.id;
 },60000);
 afterAll(async()=>fixture?.dispose());
 async function privateJob(){
  const db=mongoCollections(fixture.resource.db),categoryId=randomUUID(),propertyId=randomUUID(),otherId=randomUUID(),removed=randomUUID(),recordId=randomUUID();
  const source=definition(propertyId,"tags","multi_select",{legacyFreeformTags:true,options:[{id:removed,name:"Removed common"}]}),other=definition(otherId,"other","multi_select",{legacyFreeformTags:true,options:[]});
  await db.careerCategories.insertOne(category(categoryId,[source,other]));
  const schema=new MongoCanonicalCareerPropertySchemaService(fixture.resource,secret),frozen=(await schema.registerOption(userA,categoryId,propertyId,{label:" Frozen "})).data.id;
  await schema.registerOption(userA,categoryId,otherId,{label:"Other original"});
  await db.careerRecords.insertOne({...record(recordId,categoryId,"private"),propertyValues:[{propertyDefinitionId:propertyId,type:"multi_select",value:[removed,frozen]}]});
  const change={kind:"type-change" as const,propertyId,type:"multi_select" as const,config:{options:[],legacyFreeformTags:true}},preview=await schema.previewChange(userA,categoryId,change);
  await schema.applyChange(userA,categoryId,preview.categoryVersion,randomUUID(),{change,previewToken:preview.previewToken,confirmLossy:true});
  const job=(await db.careerPropertyMutations.findOne({userId:userA,categoryId,active:true}))!;
  return {db,categoryId,propertyId,otherId,recordId,job,schema,frozen,source};
 }
 it("uses frozen private labels for source and target while unrelated options stay live and other owners stay private",async()=>{
  const state=await privateJob();
  await state.schema.registerOption(userA,state.categoryId,state.propertyId,{label:" Added later "});
  await state.schema.registerOption(userA,state.categoryId,state.otherId,{label:"Other later"});
  await state.db.careerPropertyOptions.insertOne({_id:randomUUID(),userId:userB,categoryId:state.categoryId,propertyId:state.propertyId,optionId:randomUUID(),rawLabel:"B secret",version:1,createdAt:now});
  const before=await state.db.careerRecords.findOne({_id:state.recordId}),rawCategory=(await state.db.careerCategories.findOne({_id:state.categoryId}))!;
  const result=await reader.getRecord(userA,state.recordId),source=result.pendingPropertyMutation!.sourceProperty!;
  expect(JSON.stringify(source)).toContain(" Frozen ");expect(JSON.stringify(source)).toContain("Removed common");expect(JSON.stringify(source)).not.toContain(" Added later ");expect(JSON.stringify(source)).not.toContain("B secret");
  const defs=await reader.definitions(userA,rawCategory);
  expect(defs.find(def=>def.id===state.propertyId)!.config.options).toEqual([{id:state.frozen,label:" Frozen ",name:" Frozen "}]);
  expect(JSON.stringify(defs.find(def=>def.id===state.otherId))).toContain("Other later");
  expect(JSON.stringify((await reader.listCategories(userA)).find(cat=>cat.id===state.categoryId))).not.toContain(" Added later ");
  expect((await reader.listCategories(userB)).some(cat=>cat.id===state.categoryId)).toBe(false);
  expect(await state.db.careerRecords.findOne({_id:state.recordId})).toEqual(before);
  expect(await state.db.careerCategories.findOne({_id:state.categoryId})).toEqual(rawCategory);
 });
 it("rejects missing, corrupt, or foreign frozen policies before projecting private-dependent jobs",async()=>{
  for(const kind of ["missing","corrupt","foreign"] as const){
   const state=await privateJob(),filter={_id:state.job._id};
   if(kind==="missing")await state.db.careerPropertyMutations.updateOne(filter,{$unset:{privateOptionSnapshotJson:"",privateOptionSnapshotFingerprint:""}});
   if(kind==="corrupt")await state.db.careerPropertyMutations.updateOne(filter,{$set:{privateOptionSnapshotFingerprint:"f".repeat(64)}});
   if(kind==="foreign"){
    const rows=JSON.parse(state.job.privateOptionSnapshotJson!);rows[0].userId=userB;const json=mutationCanonicalJson(rows);
    await state.db.careerPropertyMutations.updateOne(filter,{$set:{privateOptionSnapshotJson:json,privateOptionSnapshotFingerprint:mutationFingerprint(rows)}});
   }
   await expect(reader.getRecord(userA,state.recordId)).rejects.toMatchObject({statusCode:409,message:kind==="missing"?"CAREER_PRIVATE_OPTIONS_SNAPSHOT_REQUIRED":"CAREER_PRIVATE_OPTIONS_SNAPSHOT_INVALID"});
  }
 });
 async function relationJob(kind:"deletion"|"restoration"){
  const db=mongoCollections(fixture.resource.db),sourceCategory=randomUUID(),targetCategory=randomUUID(),propertyId=randomUUID(),inverseId=randomUUID(),sourceId=randomUUID(),otherId=randomUUID(),targetId=randomUUID();
  const source=definition(propertyId,"related","relation",{targetCategoryId:targetCategory,inversePropertyId:inverseId,cardinality:"multiple",deletePolicy:"restrict"}),inverse=definition(inverseId,"back","relation",{targetCategoryId:sourceCategory,inversePropertyId:propertyId,cardinality:"multiple",deletePolicy:"restrict"});
  const target={...source,version:2,deletedAt:kind==="deletion"?now.toISOString():null},old=kind==="restoration"?{...source,version:1,deletedAt:now.toISOString()}:source;
  await db.careerCategories.insertMany([{...category(sourceCategory,[target]),version:2,schemaVersion:2},category(targetCategory,[inverse])]);
  await db.careerRecords.insertMany([record(sourceId,sourceCategory,"Source A"),record(otherId,sourceCategory,"Source B"),record(targetId,targetCategory,"Target")]);
  const edge=(sourceRecordId:string)=>({_id:randomUUID(),userId:userA,sourceRecordId,sourcePropertyId:propertyId,targetRecordId:targetId,inversePropertyId:inverseId,cardinality:"multiple" as const,deletePolicy:"restrict" as const,createdBy:"user" as const,createdAt:now,updatedAt:now});
  const forward=edge(sourceId);
  await db.careerRecordRelations.insertMany([forward,{...edge(targetId),sourcePropertyId:inverseId,targetRecordId:sourceId,inversePropertyId:propertyId}]);
  const plan={userId:userA,categoryId:sourceCategory,categoryVersion:2,schemaVersion:2,definitions:[target],recordIds:[sourceId,otherId].sort(),operation:{kind,source:old,target,defaultValue:null,confirmLossy:true}},jobId=randomUUID();
  await db.careerPropertyMutations.insertOne({_id:jobId,userId:userA,categoryId:sourceCategory,propertyId,planJson:mutationCanonicalJson(plan),operationFingerprint:mutationFingerprint(plan),status:"running",active:true,cursor:1,processedCount:1,skippedCount:0,attempts:1,leaseToken:null,leaseUntil:null,lastError:null,commitFence:1,createdAt:now,updatedAt:now,completedAt:null});
  return {db,sourceCategory,targetCategory,propertyId,inverseId,sourceId,otherId,targetId,jobId,forward};
 }
 it.each(["deletion","restoration"] as const)("hides partial relation %s and inverse mirror projections until the generation is complete",async(kind)=>{
  const state=await relationJob(kind),edgesBefore=await state.db.careerRecordRelations.find({userId:userA,sourcePropertyId:{$in:[state.propertyId,state.inverseId]}}).sort({_id:1}).toArray();
  const source=await reader.getRecord(userA,state.sourceId),inverse=await reader.getRecord(userA,state.targetId);
  expect(source.properties).not.toHaveProperty("related");
  expect(inverse.properties).not.toHaveProperty("back");
  expect(source.pendingRelationPropertyIds).toEqual([state.propertyId]);
  expect(inverse.pendingRelationPropertyIds).toEqual([state.inverseId]);
  expect(inverse.pendingPropertyMutation).toBeUndefined();
  expect(inverse).toMatchObject({title:"Target",status:"draft"});
  const raw=(await state.db.careerRecords.findOne({_id:state.targetId}))!,category=(await state.db.careerCategories.findOne({_id:state.targetCategory}))!;
  expect((await reader.relationProjection(raw,await reader.definitions(userA,category))).blockedPropertyIds).toEqual([state.inverseId]);
  expect(source.pendingPropertyMutation).toMatchObject({jobId:state.jobId,status:"running"});
  await expect(reader.getRecord(userB,state.sourceId)).rejects.toMatchObject({statusCode:404});
  expect(await state.db.careerRecordRelations.find({userId:userA,sourcePropertyId:{$in:[state.propertyId,state.inverseId]}}).sort({_id:1}).toArray()).toEqual(edgesBefore);
  if(kind==="restoration"){
   await state.db.careerPropertyMutations.updateOne({_id:state.jobId},{$set:{status:"completed",active:false,cursor:2,processedCount:2,completedAt:now}});
   expect((await reader.getRecord(userA,state.sourceId)).properties.related).toEqual({type:"relation",value:[{recordId:state.targetId,title:"Target"}]});
   expect((await reader.getRecord(userA,state.targetId)).properties.back).toEqual({type:"relation",value:[{recordId:state.sourceId,title:"Source A"}]});
   expect((await reader.getRecord(userA,state.sourceId)).pendingRelationPropertyIds).toBeUndefined();
   expect((await reader.getRecord(userA,state.targetId)).pendingRelationPropertyIds).toBeUndefined();
  }
 });
 it("never projects a backup as an edge and keeps an empty pending inverse distinct from completed empty",async()=>{
  const state=await relationJob("restoration"),sourceCategory=(await state.db.careerCategories.findOne({_id:state.sourceCategory}))!;
  const mirror=(await state.db.careerRecordRelations.findOne({userId:userA,sourceRecordId:state.targetId,sourcePropertyId:state.inverseId}))!;
  const backup={_id:randomUUID(),userId:userA,categoryId:state.sourceCategory,propertyId:state.propertyId,recordId:state.sourceId,deletionMutationId:randomUUID(),definitionVersion:1,deletedAt:now.toISOString(),categoryVersion:1,schemaVersion:1,config:sourceCategory.propertySchemaV2![0]!.config,sourceRecordVersion:1,forwardEdges:[state.forward],inverseEdges:[mirror],inverseDefinitionBindings:[],inverseRecordVersions:{[state.targetId]:1},inverseRecordReferenceVersions:{[state.targetId]:0},createdAt:now};
  await state.db.careerRelationPropertyTombstones.insertOne(backup);
  await state.db.careerRecordRelations.deleteMany({userId:userA,sourcePropertyId:{$in:[state.propertyId,state.inverseId]}});
  expect((await reader.getRecord(userA,state.sourceId)).pendingRelationPropertyIds).toEqual([state.propertyId]);
  const pendingInverse=await reader.getRecord(userA,state.targetId);
  expect(pendingInverse.pendingRelationPropertyIds).toEqual([state.inverseId]);expect(pendingInverse.properties).not.toHaveProperty("back");
  await state.db.careerPropertyMutations.updateOne({_id:state.jobId},{$set:{status:"completed",active:false,cursor:2,processedCount:2,completedAt:now}});
  const source=await reader.getRecord(userA,state.sourceId),inverse=await reader.getRecord(userA,state.targetId);
  expect(source.properties.related).toEqual({type:"relation",value:[]});expect(inverse.properties.back).toEqual({type:"relation",value:[]});
  expect(source.pendingRelationPropertyIds).toBeUndefined();expect(inverse.pendingRelationPropertyIds).toBeUndefined();
  expect(await state.db.careerRelationPropertyTombstones.findOne({_id:backup._id})).toEqual(backup);
  expect(await state.db.careerRecordRelations.countDocuments({userId:userA,sourcePropertyId:{$in:[state.propertyId,state.inverseId]}})).toBe(0);
 });
});