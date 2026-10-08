import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mongoCollections } from "@expresso/database";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoIdentityService } from "../identity/index.js";
import { CareerService } from "./service.js";
import { MongoCanonicalCareerPropertySchemaService } from "./canonical-property-schema.js";
import type { CareerPropertyDefinitionV2, CareerPropertySchemaChange } from "@expresso/contracts";
import { mutationCanonicalJson,mutationFingerprint } from "./property-mutation-state.js";

describe.skipIf(!process.env.TEST_MONGODB_URL)("inactive canonical schema orchestration", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;let api: MongoCanonicalCareerPropertySchemaService;let userId: string;let categoryId: string;let propertyId: string;
  const secret="prc-preview-secret-with-at-least-32-bytes";
  beforeAll(async () => {
    fixture=await createMongoFixture("prcschema");
    const identity=new MongoIdentityService(fixture.resource);
    userId=(await identity.signup({email:`${randomUUID()}@example.test`,password:"correct-horse-battery",displayName:"test"})).user.id;
  },60_000);
  afterAll(async()=>fixture?.dispose());
  async function setup() {
    propertyId=randomUUID();const legacy=new CareerService(fixture.resource);
    const category=await legacy.createCategory(userId,{key:`prc_${randomUUID().replaceAll("-","")}`,name:"test",icon:"folder",defaultView:"table",propertySchema:{p:{id:propertyId,label:"속성",type:"text",required:false,system:false}}});categoryId=category.id;
    const definition: CareerPropertyDefinitionV2={id:propertyId,key:"p",name:"속성",type:"text",required:false,system:false,config:{},order:0,version:1,deletedAt:null};
    await mongoCollections(fixture.resource.db).careerCategories.updateOne({_id:categoryId},{$set:{propertySchemaV2:[definition],schemaVersion:1}});
    const id=randomUUID();await fixture.resource.db.collection<import("mongodb").Document & {_id:string}>("career_records").insertOne({_id:id,userId,categoryId,title:"record",status:"draft",origin:"manual",properties:{p:"legacy sentinel"},bodyMd:"doc sentinel",blockBody:[{opaque:true}],documentVersion:7,latestSnapshotId:randomUUID(),version:1,updatedAt:new Date(0),deletedAt:null,propertyValues:[{propertyDefinitionId:propertyId,type:"text",value:"42.1200"}]});
    api=new MongoCanonicalCareerPropertySchemaService(fixture.resource,secret);return id;
  }
  async function apply(change: CareerPropertySchemaChange,confirmLossy=false) {const preview=await api.previewChange(userId,categoryId,change);return api.applyChange(userId,categoryId,preview.categoryVersion,randomUUID(),{change,previewToken:preview.previewToken,confirmLossy});}
  it("schema-only rename and reorder preserve the entire record and create no migration job",async()=>{
    const id=await setup();const before=await fixture.resource.db.collection<import("mongodb").Document & {_id:string}>("career_records").findOne({_id:id});
    await apply({kind:"rename",propertyId,name:"새 이름"});await apply({kind:"reorder",propertyId,order:3});
    expect(await fixture.resource.db.collection<import("mongodb").Document & {_id:string}>("career_records").findOne({_id:id})).toEqual(before);
    expect(await mongoCollections(fixture.resource.db).careerPropertyMutations.countDocuments({categoryId})).toBe(0);
  });
  it("type apply publishes an immutable job without rewriting canonical or legacy values",async()=>{
    const id=await setup();const before=await fixture.resource.db.collection<import("mongodb").Document & {_id:string}>("career_records").findOne({_id:id});
    const change: CareerPropertySchemaChange={kind:"type-change",propertyId,type:"number"};const preview=await api.previewChange(userId,categoryId,change);
    expect(preview.impact).toMatchObject({affectedRecordCount:1,convertibleCount:1});await apply(change);
    expect(await fixture.resource.db.collection<import("mongodb").Document & {_id:string}>("career_records").findOne({_id:id})).toEqual(before);
    const job=await mongoCollections(fixture.resource.db).careerPropertyMutations.findOne({categoryId});expect(job?.status).toBe("pending");
    expect(JSON.parse(job!.planJson).recordIds).toEqual([id]);
    await expect(apply({kind:"rename",propertyId,name:"blocked"})).rejects.toMatchObject({statusCode:409});
  });
  it("stale preview detects same-version option/config tampering",async()=>{
    await setup();const change: CareerPropertySchemaChange={kind:"rename",propertyId,name:"next"};const preview=await api.previewChange(userId,categoryId,change);
    await mongoCollections(fixture.resource.db).careerCategories.updateOne({_id:categoryId},{$set:{"propertySchemaV2.0.config":{tampered:true}}});
    await expect(api.applyChange(userId,categoryId,preview.categoryVersion,randomUUID(),{change,previewToken:preview.previewToken,confirmLossy:false})).rejects.toMatchObject({statusCode:409});
  });
  it("deletion requires confirmation and stores ISO definition deletion without touching records",async()=>{
    const id=await setup();const before=await fixture.resource.db.collection<import("mongodb").Document & {_id:string}>("career_records").findOne({_id:id});
    await expect(apply({kind:"delete",propertyId})).rejects.toMatchObject({statusCode:409});await apply({kind:"delete",propertyId},true);
    const category=await mongoCollections(fixture.resource.db).careerCategories.findOne({_id:categoryId});expect(category!.propertySchemaV2![0]!.deletedAt).toMatch(/^\d{4}-/);
    expect(await fixture.resource.db.collection<import("mongodb").Document & {_id:string}>("career_records").findOne({_id:id})).toEqual(before);
  });
  it("adds schema only without a default and materializes defaults only for missing stable IDs",async()=>{
    const id=await setup();const db=mongoCollections(fixture.resource.db);const before=await db.careerRecords.findOne({_id:id});const createdId=randomUUID();
    await apply({kind:"create",property:{id:createdId,key:"new",name:"new",type:"text",required:false,system:false,config:{}}});
    expect(await db.careerRecords.findOne({_id:id})).toEqual(before);expect(await db.careerPropertyMutations.countDocuments({categoryId})).toBe(0);
    await expect(apply({kind:"create",property:{key:"required",name:"required",type:"text",required:true,system:false,config:{}}})).rejects.toMatchObject({statusCode:409});
    const defaultId=randomUUID();await apply({kind:"create",property:{id:defaultId,key:"default",name:"default",type:"number",required:false,system:false,config:{defaultValue:{type:"number",value:"1.2300"}}}});
    const job=await db.careerPropertyMutations.findOne({categoryId});expect(JSON.parse(job!.planJson).operation.defaultValue).toEqual({propertyDefinitionId:defaultId,type:"number",value:"1.2300"});expect(await db.careerRecords.findOne({_id:id})).toEqual(before);
  });
  it("option label/order changes need no migration; removing an ID selects only affected values",async()=>{
    const id=await setup();const db=mongoCollections(fixture.resource.db),a=randomUUID(),b=randomUUID();const option=(id:string,label:string,order:number)=>({id,name:label,order});
    const definition=(await db.careerCategories.findOne({_id:categoryId}))!.propertySchemaV2![0]!;
    await db.careerCategories.updateOne({_id:categoryId},{$set:{propertySchemaV2:[{...definition,type:"select",config:{options:[option(a,"a",0),option(b,"b",1)]}}]}});
    await db.careerRecords.updateOne({_id:id},{$set:{propertyValues:[{propertyDefinitionId:propertyId,type:"select",value:a}]}});
    const source=(await db.careerRecords.findOne({_id:id}))!;await db.careerRecords.insertOne({...source,_id:randomUUID(),propertyValues:[{propertyDefinitionId:propertyId,type:"select",value:b}]});
    await apply({kind:"type-change",propertyId,type:"select",config:{options:[option(b,"B",0),option(a,"A",1)]}});expect(await db.careerPropertyMutations.countDocuments({categoryId})).toBe(0);
    const change: CareerPropertySchemaChange={kind:"type-change",propertyId,type:"select",config:{options:[option(b,"B",0)]}};
    const preview=await api.previewChange(userId,categoryId,change);expect(preview.impact.affectedRecordCount).toBe(1);await expect(apply(change)).rejects.toMatchObject({statusCode:409});await apply(change,true);
    expect(JSON.parse((await db.careerPropertyMutations.findOne({categoryId}))!.planJson).recordIds).toEqual([id]);
  });
  it("rejects unsupported conversion even when lossy confirmation is supplied",async()=>{
    await setup();const change: CareerPropertySchemaChange={kind:"type-change",propertyId,type:"file"};const preview=await api.previewChange(userId,categoryId,change);expect(preview.impact.convertibleCount).toBe(0);await expect(apply(change,true)).rejects.toMatchObject({statusCode:409});
  });
  it("restore rejects a changed tombstone type before publishing schema or job",async()=>{
    const id=await setup();const db=mongoCollections(fixture.resource.db);await db.careerCategories.updateOne({_id:categoryId},{$set:{"propertySchemaV2.0.deletedAt":new Date().toISOString()}});
    await fixture.resource.db.collection<import("mongodb").Document & {_id:string}>("career_records").updateOne({_id:id},{$set:{propertyValues:[],[`propertyValueTombstones.${propertyId}`]:{propertyDefinitionId:propertyId,type:"checkbox",value:true}}});
    await expect(apply({kind:"restore",propertyId},true)).rejects.toMatchObject({statusCode:409});
  });
  it("restore schedules consumption of a matching generation tombstone even when the current value exists",async()=>{
    const id=await setup(),db=mongoCollections(fixture.resource.db),deletionMutationId=randomUUID(),now=new Date();
    const source=(await db.careerCategories.findOne({_id:categoryId}))!.propertySchemaV2![0]!;
    const deleted={...source,version:2,deletedAt:now.toISOString()};
    await db.careerCategories.updateOne({_id:categoryId},{$set:{propertySchemaV2:[deleted],version:2,schemaVersion:2}});
    const plan={userId,categoryId,categoryVersion:2,schemaVersion:2,definitions:[deleted],recordIds:[id],operation:{kind:"deletion",source,target:deleted,defaultValue:null,confirmLossy:true}};
    await db.careerPropertyMutations.insertOne({_id:deletionMutationId,userId,categoryId,propertyId,planJson:mutationCanonicalJson(plan),operationFingerprint:mutationFingerprint(plan),status:"completed",active:false,cursor:1,processedCount:1,skippedCount:0,attempts:1,leaseToken:null,leaseUntil:null,lastError:null,commitFence:1,createdAt:now,updatedAt:now,completedAt:now});
    const backup={propertyDefinitionId:propertyId,deletionMutationId,definitionVersion:2,type:"text",config:{},categoryId,categoryVersion:2,schemaVersion:2,deletedAt:deleted.deletedAt,value:{propertyDefinitionId:propertyId,type:"text",value:"old"}};
    await db.careerRecords.updateOne({_id:id},{$set:{propertyValues:[{propertyDefinitionId:propertyId,type:"text",value:"new"}],[`propertyValueTombstones.${propertyId}`]:backup}} as never);
    await apply({kind:"restore",propertyId});
    const job=await db.careerPropertyMutations.findOne({categoryId,active:true});expect(JSON.parse(job!.planJson).recordIds).toEqual([id]);
    expect((await db.careerRecords.findOne({_id:id}))?.propertyValues?.[0]).toMatchObject({value:"new"});
  });
  it("formula config emits recomputation but never a canonical mutation job",async()=>{
    const id=await setup();const formulaId=randomUUID();await apply({kind:"create",property:{id:formulaId,key:"derived",name:"derived",type:"formula",required:false,system:false,config:{source:`prop("${propertyId}")`,ast:null,diagnostics:[]}}});
    expect(await mongoCollections(fixture.resource.db).careerPropertyMutations.countDocuments({categoryId})).toBe(0);expect(await mongoCollections(fixture.resource.db).outboxEvents.findOne({topic:"career.computation","payload.recordId":id})).toMatchObject({payload:{changedPropertyIds:[formulaId]}});
  });
  it("rejects decimal scale loss before publishing schema or leaving an active job lock",async()=>{
    const id=await setup();const db=mongoCollections(fixture.resource.db);await db.careerRecords.updateOne({_id:id},{$set:{propertyValues:[{propertyDefinitionId:propertyId,type:"text",value:"1."+"0".repeat(34)}]}});
    const before=await db.careerCategories.findOne({_id:categoryId});const change:CareerPropertySchemaChange={kind:"type-change",propertyId,type:"number"};expect((await api.previewChange(userId,categoryId,change)).impact.convertibleCount).toBe(0);
    await expect(apply(change,true)).rejects.toMatchObject({statusCode:409});expect(await db.careerCategories.findOne({_id:categoryId})).toEqual(before);expect(await db.careerPropertyMutations.countDocuments({categoryId})).toBe(0);
  });
});
