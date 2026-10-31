import {randomUUID} from "node:crypto";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {mongoCollections} from "@expresso/database";
import {createMongoFixture} from "../../../test/support/mongodb.js";
import {MongoIdentityService} from "../identity/index.js";
import {createCanonicalCareerCategory,readCareerProductRecordVersion} from "./product-metadata.js";
import {CareerViewService} from "./views.js";
describe.skipIf(!process.env.TEST_MONGODB_URL)("product metadata writes on disposable Mongo",()=>{
 let fixture:Awaited<ReturnType<typeof createMongoFixture>>,userId:string,foreign:string;
 beforeAll(async()=>{fixture=await createMongoFixture("b2pmeta");const identity=new MongoIdentityService(fixture.resource);userId=(await identity.signup({email:randomUUID()+"@example.test",password:"product-metadata-password",displayName:"A"})).user.id;foreign=(await identity.signup({email:randomUUID()+"@example.test",password:"product-metadata-password",displayName:"B"})).user.id;},60000);
 afterAll(async()=>fixture?.dispose());
 it("creates canonical definitions and freeform-tag markers before any record exists",async()=>{
  const category=await createCanonicalCareerCategory(fixture.resource,userId,{key:"metadata_"+randomUUID().replaceAll("-",""),name:"Category",icon:"note",defaultView:"table",propertySchemaV2:[{id:randomUUID(),key:"amount",name:"Amount",type:"number",system:false,required:false,config:{},order:0,version:1,deletedAt:null},{id:randomUUID(),key:"tags",name:"Tags",type:"multi_select",system:false,required:false,config:{legacyFreeformTags:true,options:[]},order:1,version:1,deletedAt:null}]});
  expect(category).toMatchObject({version:1,schemaVersion:1,recordCount:0});expect(category.propertySchemaV2).toHaveLength(2);
  expect(new Set(category.propertySchemaV2.map(def=>def.id)).size).toBe(2);expect(category).not.toHaveProperty("propertySchema");expect(category).not.toHaveProperty("isSystem");
  expect(category.propertySchemaV2!.find(def=>def.key==="tags")).toMatchObject({type:"multi_select",config:{legacyFreeformTags:true,options:[]}});
  expect(await mongoCollections(fixture.resource.db).careerRecords.countDocuments({categoryId:category.id})).toBe(0);
 });
 it("validates view configuration property IDs against active canonical metadata and does not alter records",async()=>{
  const category=await createCanonicalCareerCategory(fixture.resource,userId,{key:"views_"+randomUUID().replaceAll("-",""),name:"Views",icon:"note",defaultView:"table",propertySchemaV2:[]}),id=randomUUID(),now=new Date();
  await mongoCollections(fixture.resource.db).careerCategories.updateOne({_id:category.id},{$set:{propertySchemaV2:[{id,key:"event",name:"Event",type:"date",system:false,required:false,config:{},order:0,version:1,deletedAt:null}]}});
  const record={_id:randomUUID(),userId,categoryId:category.id,title:"Body",status:"draft" as const,origin:"manual" as const,properties:{opaque:{type:"text" as const,value:"untouched"}},propertyValues:[],bodyMd:"Document",version:4,documentVersion:2,createdAt:now,updatedAt:now,deletedAt:null};await mongoCollections(fixture.resource.db).careerRecords.insertOne(record);
  const service=new CareerViewService(fixture.resource),input={name:"Timeline",type:"timeline" as const,filter:null,sorts:[],groupPropertyId:null,groupOrder:[],recordOrder:[],visiblePropertyIds:[id],propertyOrder:[id],columnWidths:{},gallery:null,board:null,timeline:null},view=await service.create(userId,category.id,1,input);
  expect(view).toMatchObject({categoryId:category.id,visiblePropertyIds:[id]});expect(await service.list(userId,category.id)).toEqual([view]);
  await expect(service.create(foreign,category.id,1,input)).rejects.toMatchObject({statusCode:404});
  await expect(service.create(userId,category.id,1,{...input,name:"Bad",visiblePropertyIds:[randomUUID()]})).rejects.toMatchObject({statusCode:400});
  expect(await mongoCollections(fixture.resource.db).careerRecords.findOne({_id:record._id})).toEqual(record);
  expect(await readCareerProductRecordVersion(fixture.resource,userId,record._id,false)).toBe(4);
  await expect(readCareerProductRecordVersion(fixture.resource,foreign,record._id,false)).rejects.toMatchObject({statusCode:404});
  await expect(readCareerProductRecordVersion(fixture.resource,userId,record._id,true)).rejects.toMatchObject({statusCode:404});
 });
});