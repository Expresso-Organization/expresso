import {randomUUID} from "node:crypto";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {mongoCollections,type CareerRecordDoc} from "@expresso/database";
import type {CareerPropertyDefinitionV2} from "@expresso/contracts";
import {createMongoFixture} from "../../../test/support/mongodb.js";
import {MongoIdentityService} from "../identity/index.js";
import {CanonicalCareerReadService,MongoCanonicalCareerPropertySchemaService} from "../career/index.js";
import {MaterialsService} from "./service.js";

describe.skipIf(!process.env.TEST_MONGODB_URL)("canonical material period display",()=>{
 let fixture:Awaited<ReturnType<typeof createMongoFixture>>,reader:CanonicalCareerReadService,userId:string,other:string;
 const now=new Date("2026-10-09T00:00:00Z");
 beforeAll(async()=>{fixture=await createMongoFixture("b2matperiod");reader=new CanonicalCareerReadService(fixture.resource);const identity=new MongoIdentityService(fixture.resource);userId=(await identity.signup({email:randomUUID()+"@example.test",password:"correct-horse-battery",displayName:"Material owner"})).user.id;other=(await identity.signup({email:randomUUID()+"@example.test",password:"correct-horse-battery",displayName:"Other"})).user.id;},60000);
 afterAll(async()=>fixture?.dispose());
 async function setup(value?:{precision:"day"|"month";start:string;end:string|null}|{precision:"datetime";start:string;end:string|null;timezone:string|null},legacy=true){
  const categoryId=randomUUID(),propertyId=randomUUID(),recordId=randomUUID(),brewId=randomUUID(),db=mongoCollections(fixture.resource.db);
  const definition:CareerPropertyDefinitionV2={id:propertyId,key:"period",name:"Period",type:"date",required:false,system:false,config:{},order:0,version:1,deletedAt:null};
  await db.careerCategories.insertOne({_id:categoryId,userId,key:"period-"+categoryId,name:"Period",icon:"folder",defaultView:"table",isSystem:false,propertySchema:{},propertySchemaV2:[definition],schemaVersion:1,version:1,sortOrder:0,updatedAt:now});
  const record:CareerRecordDoc={_id:recordId,userId,categoryId,title:"Current material",status:"organized",origin:"manual",properties:{period:"2030-01"},propertyValues:value?[{propertyDefinitionId:propertyId,type:"date",value}]:[],bodyMd:"",version:1,createdAt:now,updatedAt:now,deletedAt:null,...(legacy?{periodStart:"2030-01-01",periodEnd:"2031-01-01"}:{})};
  await db.careerRecords.insertOne(record);await db.brews.insertOne({_id:brewId,userId,jobAnalysisId:randomUUID(),mode:"solo",status:"draft",lengthPreset:"single",createdAt:now,updatedAt:now});await db.brewSources.insertOne({_id:randomUUID(),userId,brewId,recordId,rank:0,selectedBy:"auto",excludedReason:null,score:0,reasonText:"Current material",isSelected:true,updatedAt:now});
  return{recordId,categoryId,propertyId,brewId,definition};
 }
 const material=async(brewId:string)=>{const result=await new MaterialsService(fixture.resource,reader).getMaterials(userId,brewId);return result.materials[0]!;};
 it("reflects canonical edits instead of stale legacy columns without read-time writes",async()=>{
  const item=await setup({precision:"day",start:"2026-03-02",end:"2026-09-30"}),db=mongoCollections(fixture.resource.db);
  await db.careerRecords.updateOne({_id:item.recordId},{$set:{propertyValues:[{propertyDefinitionId:item.propertyId,type:"date",value:{precision:"day",start:"2026-04-05",end:null}}],version:2}});
  const before=await db.careerRecords.findOne({_id:item.recordId}),category=await db.careerCategories.findOne({_id:item.categoryId});
  expect(await material(item.brewId)).toMatchObject({periodFrom:"2026-04-05",periodTo:null});expect(await db.careerRecords.findOne({_id:item.recordId})).toEqual(before);expect(await db.careerCategories.findOne({_id:item.categoryId})).toEqual(category);
  await expect(new MaterialsService(fixture.resource,reader).getMaterials(other,item.brewId)).rejects.toMatchObject({statusCode:404});
 });
 it.each([false,true])("reads newly created canonical periods when legacy columns are present=%s",async legacy=>{const item=await setup({precision:"day",start:"2026-01-31",end:"2026-02-28"},legacy);expect(await material(item.brewId)).toMatchObject({periodFrom:"2026-01-31",periodTo:"2026-02-28"});});
 it("keeps month display anchors and datetime local calendar dates without normalizing original values",async()=>{
  const month=await setup({precision:"month",start:"2026-02",end:"2026-10"}),value={precision:"datetime" as const,start:"2026-10-01T00:30:00.123456789+09:00",end:"2026-10-31T23:45:00.987654321-08:00",timezone:"Asia/Seoul"},datetime=await setup(value),db=mongoCollections(fixture.resource.db),before=await db.careerRecords.findOne({_id:datetime.recordId});
  expect(await material(month.brewId)).toMatchObject({periodFrom:"2026-02-01",periodTo:"2026-10-01"});expect(await material(datetime.brewId)).toMatchObject({periodFrom:"2026-10-01",periodTo:"2026-10-31"});expect(await db.careerRecords.findOne({_id:datetime.recordId})).toEqual(before);
 });
 it("returns missing or cleared canonical periods as null without legacy fallback",async()=>{
  const missing=await setup(),cleared=await setup({precision:"day",start:"2026-03-02",end:"2026-09-30"}),db=mongoCollections(fixture.resource.db);await db.careerRecords.updateOne({_id:cleared.recordId},{$set:{propertyValues:[]}});
  expect(await material(missing.brewId)).toMatchObject({periodFrom:null,periodTo:null});expect(await material(cleared.brewId)).toMatchObject({periodFrom:null,periodTo:null});
 });
 it("uses the validated pending source definition until that record is converted",async()=>{
  const item=await setup({precision:"month",start:"2026-03",end:null}),schema=new MongoCanonicalCareerPropertySchemaService(fixture.resource,"material-preview-secret-at-least-32-bytes"),change={kind:"type-change" as const,propertyId:item.propertyId,type:"text" as const},preview=await schema.previewChange(userId,item.categoryId,change);
  await schema.applyChange(userId,item.categoryId,preview.categoryVersion,randomUUID(),{change,previewToken:preview.previewToken,confirmLossy:true});const db=mongoCollections(fixture.resource.db),before=await db.careerRecords.findOne({_id:item.recordId}),job=await db.careerPropertyMutations.findOne({categoryId:item.categoryId,active:true});
  expect(await material(item.brewId)).toMatchObject({periodFrom:"2026-03-01",periodTo:null});expect(await db.careerRecords.findOne({_id:item.recordId})).toEqual(before);expect(await db.careerPropertyMutations.findOne({_id:job!._id})).toEqual(job);
  await db.careerRecords.updateOne({_id:item.recordId},{$set:{propertyValues:[{propertyDefinitionId:item.propertyId,type:"text",value:"2026-03"}]}});expect(await material(item.brewId)).toMatchObject({periodFrom:null,periodTo:null});
 });
 it("preserves the explicit legacy constructor path",async()=>{const item=await setup({precision:"day",start:"2026-01-31",end:null});expect((await new MaterialsService(fixture.resource).getMaterials(userId,item.brewId)).materials[0]).toMatchObject({periodFrom:"2030-01-01",periodTo:"2031-01-01"});});
});