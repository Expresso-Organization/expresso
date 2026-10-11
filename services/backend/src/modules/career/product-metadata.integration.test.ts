import {randomUUID} from "node:crypto";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {mongoCollections} from "@expresso/database";
import {createMongoFixture} from "../../../test/support/mongodb.js";
import {MongoIdentityService} from "../identity/index.js";
import {createCanonicalCareerCategory,createCareerLegacyViewMetadata,listCareerLegacyViewMetadata,readCareerProductRecordVersion} from "./product-metadata.js";
describe.skipIf(!process.env.TEST_MONGODB_URL)("product metadata writes on disposable Mongo",()=>{
 let fixture:Awaited<ReturnType<typeof createMongoFixture>>,userId:string,foreign:string;
 beforeAll(async()=>{fixture=await createMongoFixture("b2pmeta");const identity=new MongoIdentityService(fixture.resource);userId=(await identity.signup({email:randomUUID()+"@example.test",password:"product-metadata-password",displayName:"A"})).user.id;foreign=(await identity.signup({email:randomUUID()+"@example.test",password:"product-metadata-password",displayName:"B"})).user.id;},60000);
 afterAll(async()=>fixture?.dispose());
 it("creates canonical definitions and freeform-tag markers before any record exists",async()=>{
  const category=await createCanonicalCareerCategory(fixture.resource,userId,{key:"metadata_"+randomUUID().replaceAll("-",""),name:"Category",icon:"note",defaultView:"table",propertySchema:{amount:{label:"Amount",type:"number",required:false,system:false},tags:{label:"Tags",type:"tags",required:false,system:false}}});
  expect(category).toMatchObject({version:1,schemaVersion:1,isSystem:false,recordCount:0});expect(category.propertySchemaV2).toHaveLength(2);
  expect(category.propertySchemaV2!.map(def=>def.id)).toEqual([category.propertySchema.amount!.id,category.propertySchema.tags!.id]);
  expect(category.propertySchemaV2!.find(def=>def.key==="tags")).toMatchObject({type:"multi_select",config:{legacyFreeformTags:true,options:[]}});
  expect(await mongoCollections(fixture.resource.db).careerRecords.countDocuments({categoryId:category.id})).toBe(0);
 });
 it("validates legacy view keys against active canonical metadata and does not alter records",async()=>{
  const category=await createCanonicalCareerCategory(fixture.resource,userId,{key:"views_"+randomUUID().replaceAll("-",""),name:"Views",icon:"note",defaultView:"table",propertySchema:{}}),id=randomUUID(),now=new Date();
  await mongoCollections(fixture.resource.db).careerCategories.updateOne({_id:category.id},{$set:{propertySchemaV2:[{id,key:"event",name:"Event",type:"date",system:false,required:false,config:{},order:0,version:1,deletedAt:null}]}});
  const record={_id:randomUUID(),userId,categoryId:category.id,title:"Body",status:"draft" as const,origin:"manual" as const,properties:{opaque:"untouched"},propertyValues:[],bodyMd:"Document",version:4,documentVersion:2,createdAt:now,updatedAt:now,deletedAt:null};await mongoCollections(fixture.resource.db).careerRecords.insertOne(record);
  const input={name:"Timeline",viewType:"timeline" as const,filters:[],sorts:[],visibleProperties:["event"]},view=await createCareerLegacyViewMetadata(fixture.resource,userId,category.id,input);
  expect(view).toMatchObject({categoryId:category.id,visibleProperties:["event"]});expect(await listCareerLegacyViewMetadata(fixture.resource,userId,category.id)).toEqual([view]);
  await expect(createCareerLegacyViewMetadata(fixture.resource,foreign,category.id,input)).rejects.toMatchObject({statusCode:404});
  await expect(createCareerLegacyViewMetadata(fixture.resource,userId,category.id,{...input,name:"Bad",visibleProperties:["absent"]})).rejects.toMatchObject({statusCode:400});
  expect(await mongoCollections(fixture.resource.db).careerRecords.findOne({_id:record._id})).toEqual(record);
  expect(await readCareerProductRecordVersion(fixture.resource,userId,record._id,false)).toBe(4);
  await expect(readCareerProductRecordVersion(fixture.resource,foreign,record._id,false)).rejects.toMatchObject({statusCode:404});
  await expect(readCareerProductRecordVersion(fixture.resource,userId,record._id,true)).rejects.toMatchObject({statusCode:404});
 });
});