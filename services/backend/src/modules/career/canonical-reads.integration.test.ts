import { randomUUID } from "node:crypto";
import { Decimal128 } from "mongodb";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import type { CareerPropertyDefinitionV2 } from "@expresso/contracts";
import { mongoCollections,registerCareerPropertyOption } from "@expresso/database";
import { MongoIdentityService } from "../identity/index.js";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { CanonicalCareerReadService } from "./canonical-reads.js";
const amount:CareerPropertyDefinitionV2={id:randomUUID(),key:"amount",name:"Amount",type:"number",required:false,system:false,config:{},order:0,version:1,deletedAt:null};
const tags:CareerPropertyDefinitionV2={...amount,id:randomUUID(),key:"tags",name:"Tags",type:"multi_select",config:{legacyFreeformTags:true,options:[]},order:1};
describe.skipIf(!process.env.TEST_MONGODB_URL)("canonical product reads with Mongo",()=>{
 let fixture:Awaited<ReturnType<typeof createMongoFixture>>,reader:CanonicalCareerReadService,userA:string,userB:string,categoryId:string,recordId:string;
 beforeAll(async()=>{
  fixture=await createMongoFixture("b2canonicalreads");reader=new CanonicalCareerReadService(fixture.resource);
  const identity=new MongoIdentityService(fixture.resource);
  userA=(await identity.signup({email:`a-${randomUUID()}@example.com`,displayName:"A",password:"disposable-read-password"})).user.id;
  userB=(await identity.signup({email:`b-${randomUUID()}@example.com`,displayName:"B",password:"disposable-read-password"})).user.id;
  const db=mongoCollections(fixture.resource.db);categoryId=randomUUID();recordId=randomUUID();const now=new Date();
  await db.careerCategories.insertOne({_id:categoryId,userId:null,key:"b2-shared",name:"Shared",icon:"note",defaultView:"table",isSystem:true,propertySchema:{amount:{id:amount.id,label:"Amount",type:"number",required:false,system:false},tags:{id:tags.id,label:"Tags",type:"tags",required:false,system:false}},propertySchemaV2:[amount,tags],schemaVersion:1,version:1,sortOrder:0,updatedAt:now});
  const option=await registerCareerPropertyOption(fixture.resource.db,{userId:userA,categoryId,propertyId:tags.id}," A secret tag ");
  await registerCareerPropertyOption(fixture.resource.db,{userId:userB,categoryId,propertyId:tags.id},"B secret tag");
  await db.careerRecords.insertOne({_id:recordId,userId:userA,categoryId,title:"Exact",status:"draft",origin:"manual",properties:{amount:999,tags:["stale"]},propertyValues:[{propertyDefinitionId:amount.id,type:"number",value:Decimal128.fromString("12345678901234567890.123400")},{propertyDefinitionId:tags.id,type:"multi_select",value:[option.optionId]}],bodyMd:"document",version:1,createdAt:now,updatedAt:now,deletedAt:null,purgeAfter:null});
 },60_000);
 afterAll(async()=>{await fixture?.dispose();});
 it("returns canonical values and preserves physical legacy/document fields",async()=>{
  const before=await mongoCollections(fixture.resource.db).careerRecords.findOne({_id:recordId});
  const record=await reader.getRecord(userA,recordId);
  expect(record.properties.amount).toBe("12345678901234567890.123400");expect(record.propertyValues).toHaveLength(2);
  expect(record).toMatchObject({bodyMd:"document",version:1});
  expect(await mongoCollections(fixture.resource.db).careerRecords.findOne({_id:recordId})).toEqual(before);
 });
 it("overlays only the authenticated user's private labels without mutating shared schema",async()=>{
  const before=await mongoCollections(fixture.resource.db).careerCategories.findOne({_id:categoryId});
  const a=(await reader.listCategories(userA)).find(row=>row.id===categoryId)!;
  const b=(await reader.listCategories(userB)).find(row=>row.id===categoryId)!;
  expect(JSON.stringify(a)).toContain(" A secret tag ");expect(JSON.stringify(a)).not.toContain("B secret tag");
  expect(JSON.stringify(b)).toContain("B secret tag");expect(JSON.stringify(b)).not.toContain(" A secret tag ");
  expect(await mongoCollections(fixture.resource.db).careerCategories.findOne({_id:categoryId})).toEqual(before);
  await expect(reader.getRecord(userB,recordId)).rejects.toMatchObject({statusCode:404});
 });
 it("derives relation cards from owned canonical edges and active targets, never legacy envelopes",async()=>{
  const db=mongoCollections(fixture.resource.db),now=new Date(),sourceId=randomUUID(),targetId=randomUUID(),trashId=randomUUID(),foreignId=randomUUID(),missingId=randomUUID(),sourceCategory=randomUUID(),targetCategory=randomUUID(),forwardId=randomUUID(),inverseId=randomUUID();
  const relation=(id:string,key:string,target:string,inverse:string):CareerPropertyDefinitionV2=>({id,key,name:key,type:"relation",required:false,system:false,config:{targetCategoryId:target,inversePropertyId:inverse,cardinality:"multiple",deletePolicy:"restrict"},order:0,version:1,deletedAt:null});
  await db.careerCategories.insertMany([
   {_id:sourceCategory,userId:userA,key:`src-${sourceCategory}`,name:"Source",icon:"note",defaultView:"table",isSystem:false,propertySchema:{},propertySchemaV2:[relation(forwardId,"related",targetCategory,inverseId)],schemaVersion:1,version:1,sortOrder:0,updatedAt:now},
   {_id:targetCategory,userId:userA,key:`tgt-${targetCategory}`,name:"Target",icon:"note",defaultView:"table",isSystem:false,propertySchema:{},propertySchemaV2:[relation(inverseId,"back",sourceCategory,forwardId)],schemaVersion:1,version:1,sortOrder:1,updatedAt:now}
  ]);
  const record=(id:string,category:string,user=userA,deletedAt:Date|null=null)=>({_id:id,userId:user,categoryId:category,title:id===targetId?"Live canonical title":"Source",status:"draft" as const,origin:"manual" as const,properties:{related:{type:"relation" as const,value:[{recordId:foreignId,title:"Stale private"}]}},propertyValues:[],bodyMd:"",version:1,createdAt:now,updatedAt:now,deletedAt,purgeAfter:null});
  await db.careerRecords.insertMany([record(sourceId,sourceCategory),record(targetId,targetCategory),record(trashId,targetCategory,userA,now),record(foreignId,targetCategory,userB)]);
  await db.careerRecordRelations.insertMany([targetId,trashId,foreignId,missingId].map(targetRecordId=>({_id:randomUUID(),userId:userA,sourceRecordId:sourceId,sourcePropertyId:forwardId,targetRecordId,inversePropertyId:inverseId,cardinality:"multiple" as const,deletePolicy:"restrict" as const,createdBy:"user" as const,createdAt:now,updatedAt:now})));
  await db.careerRecordRelations.insertOne({_id:randomUUID(),userId:userB,sourceRecordId:sourceId,sourcePropertyId:forwardId,targetRecordId:foreignId,inversePropertyId:inverseId,cardinality:"multiple",deletePolicy:"restrict",createdBy:"user",createdAt:now,updatedAt:now});
  const before=await db.careerRecords.findOne({_id:sourceId});
  expect((await reader.getRecord(userA,sourceId)).properties.related).toEqual({type:"relation",value:[{recordId:targetId,title:"Live canonical title"}]});
  expect((await reader.getRecord(userA,targetId)).properties.back).toEqual({type:"relation",value:[{recordId:sourceId,title:"Source"}]});
  expect(await db.careerRecords.findOne({_id:sourceId})).toEqual(before);
 });
});
