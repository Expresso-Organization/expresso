import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import type { CareerPropertyDefinitionV2,CareerPropertySchemaChange } from "@expresso/contracts";
import { mongoCollections } from "@expresso/database";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoIdentityService } from "../identity/index.js";
import { MongoCanonicalCareerPropertySchemaService } from "./canonical-property-schema.js";
import { CanonicalCareerReadService } from "./canonical-reads.js";
import { listCanonicalCareerRecords } from "./canonical-record-list.js";

describe.skipIf(!process.env.TEST_MONGODB_URL)("reserved Career property keys with Mongo",()=>{
 let fixture:Awaited<ReturnType<typeof createMongoFixture>>,userId:string;
 let api:MongoCanonicalCareerPropertySchemaService,reader:CanonicalCareerReadService;
 beforeAll(async()=>{
  fixture=await createMongoFixture("b2keypolicy");
  userId=(await new MongoIdentityService(fixture.resource).signup({email:randomUUID()+"@example.test",password:"disposable-key-policy-password",displayName:"key"})).user.id;
  api=new MongoCanonicalCareerPropertySchemaService(fixture.resource,"disposable-preview-secret-with-more-than-32-bytes");
  reader=new CanonicalCareerReadService(fixture.resource);
 },60_000);
 afterAll(async()=>fixture?.dispose());
 async function seed(){
  const categoryId=randomUUID(),recordId=randomUUID(),propertyId=randomUUID(),now=new Date(),db=mongoCollections(fixture.resource.db);
  const definition:CareerPropertyDefinitionV2={id:propertyId,key:"note",name:"메모",type:"text",required:false,system:false,config:{},order:0,version:1,deletedAt:null};
  await db.careerCategories.insertOne({_id:categoryId,userId,key:"key_"+categoryId.replaceAll("-",""),name:"Key policy",icon:"folder",defaultView:"table",isSystem:false,propertySchema:{},propertySchemaV2:[definition],schemaVersion:1,version:1,sortOrder:0,updatedAt:now});
  await db.careerRecords.insertOne({_id:recordId,userId,categoryId,title:"unchanged",status:"draft",origin:"manual",properties:{note:"legacy sentinel"},propertyValues:[],bodyMd:"document sentinel",documentVersion:7,version:1,createdAt:now,updatedAt:now,deletedAt:null});
  return {categoryId,recordId,propertyId,definition,db};
 }
 function createInput(definition:CareerPropertyDefinitionV2,key=definition.key){const {version,deletedAt,...input}=definition;return {...input,id:randomUUID(),key};}
 async function apply(categoryId:string,change:CareerPropertySchemaChange){
  const preview=await api.previewChange(userId,categoryId,change);
  return api.applyChange(userId,categoryId,preview.categoryVersion,randomUUID(),{change,previewToken:preview.previewToken,confirmLossy:false});
 }
 it("reserves deleted keys without writes; original restore, other keys and duplicate names remain valid",async()=>{
  const {categoryId,recordId,propertyId,definition,db}=await seed(),recordBefore=await db.careerRecords.findOne({_id:recordId});
  await apply(categoryId,{kind:"delete",propertyId});
  const categoryBefore=await db.careerCategories.findOne({_id:categoryId}),eventsBefore=await db.outboxEvents.countDocuments({userId});
  await expect(api.previewChange(userId,categoryId,{kind:"create",property:createInput(definition)})).rejects.toMatchObject({statusCode:409});
  expect(await db.careerCategories.findOne({_id:categoryId})).toEqual(categoryBefore);
  expect(await db.careerRecords.findOne({_id:recordId})).toEqual(recordBefore);
  expect(await db.careerPropertyMutations.countDocuments({categoryId})).toBe(0);
  expect(await db.outboxEvents.countDocuments({userId})).toBe(eventsBefore);
  expect((await reader.getRecord(userId,recordId)).id).toBe(recordId);
  expect((await listCanonicalCareerRecords(reader,userId,{categoryId,sort:"updated_desc",limit:50})).data.map(row=>row.id)).toContain(recordId);
  await apply(categoryId,{kind:"restore",propertyId});
  await apply(categoryId,{kind:"create",property:createInput(definition,"other")});
  await apply(categoryId,{kind:"rename",propertyId,name:"메모"});
  expect((await db.careerCategories.findOne({_id:categoryId}))!.propertySchemaV2?.map(row=>row.name)).toEqual(["메모","메모"]);
  expect((await reader.getRecord(userId,recordId)).properties).toEqual({});
  expect((await listCanonicalCareerRecords(reader,userId,{categoryId,sort:"updated_desc",limit:50})).data.map(row=>row.id)).toContain(recordId);
  expect(await db.careerRecords.findOne({_id:recordId})).toEqual(recordBefore);
 },30_000);
 it.each(["key","id"] as const)("diagnoses existing duplicate %s without repair",async kind=>{
  const {categoryId,recordId,propertyId,definition,db}=await seed();
  const deleted={...definition,id:kind==="id"?propertyId:randomUUID(),key:kind==="key"?"note":"other",deletedAt:new Date(0).toISOString()};
  await db.careerCategories.updateOne({_id:categoryId},{$set:{propertySchemaV2:[definition,deleted]}});
  const before=await db.careerCategories.findOne({_id:categoryId}),recordBefore=await db.careerRecords.findOne({_id:recordId});
  for(const change of [{kind:"rename",propertyId,name:"same"},{kind:"reorder",propertyId,order:2},{kind:"restore",propertyId:deleted.id},{kind:"create",property:createInput(definition,"fresh")}] as CareerPropertySchemaChange[]){
   await expect(api.previewChange(userId,categoryId,change)).rejects.toMatchObject({statusCode:409,message:"DUPLICATE_CANONICAL_DEFINITION"});
  }
  await expect(reader.definitions(userId,before!)).rejects.toMatchObject({statusCode:409,message:"DUPLICATE_CANONICAL_DEFINITION"});
  await expect(reader.getRecord(userId,recordId)).rejects.toMatchObject({statusCode:409,message:"DUPLICATE_CANONICAL_DEFINITION"});
  expect(await db.careerCategories.findOne({_id:categoryId})).toEqual(before);
  expect(await db.careerRecords.findOne({_id:recordId})).toEqual(recordBefore);
  expect(await db.careerPropertyMutations.countDocuments({categoryId})).toBe(0);
 });
});
