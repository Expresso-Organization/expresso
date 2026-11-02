import {randomUUID} from "node:crypto";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {API_PREFIX,CareerPropertyOptionResponseSchema,CreateCareerCategorySchema,UuidSchema} from "@expresso/contracts";
import {mongoCollections} from "@expresso/database";
import {buildApi} from "../../api/build-app.js";
import type {RuntimeConfig} from "../../config/runtime-config.js";
import {MongoIdentityService} from "../identity/index.js";
import {createMongoFixture} from "../../../test/support/mongodb.js";
import {CareerService} from "./service.js";
const config:RuntimeConfig={nodeEnv:"test",host:"127.0.0.1",port:4000,logLevel:"silent",databaseUrl:"mysql://127.0.0.1:1/unused",redisUrl:"redis://127.0.0.1:1",outboxPollIntervalMs:1000,outboxBatchSize:25,outboxMaxAttempts:5,queuePrefix:"b2-option-test"};
describe.skipIf(!process.env.TEST_MONGODB_URL)("private freeform options actual authenticated API",()=>{
 let fixture:Awaited<ReturnType<typeof createMongoFixture>>,app:ReturnType<typeof buildApi>,userA:string,userB:string,tokenA:string,tokenB:string,categoryId:string,propertyId:string,categoryBId:string,propertyBId:string;
 beforeAll(async()=>{
  fixture=await createMongoFixture("b2optionapi");const identity=new MongoIdentityService(fixture.resource);
  userA=(await identity.signup({email:`a-${randomUUID()}@example.com`,displayName:"A",password:"disposable-api-password"})).user.id;
  userB=(await identity.signup({email:`b-${randomUUID()}@example.com`,displayName:"B",password:"disposable-api-password"})).user.id;
  tokenA=(await identity.issueSession({userId:userA})).accessToken;tokenB=(await identity.issueSession({userId:userB})).accessToken;
  const career=new CareerService(fixture.resource);
  const findTags=async(user:string)=>{const propertyId=randomUUID(),category=await career.createCategory(user,{key:"private_tags",name:"Private tags",icon:"note",defaultView:"table",propertySchemaV2:[{id:propertyId,key:"tags",name:"Tags",type:"multi_select",required:false,system:false,config:{legacyFreeformTags:true,options:[]},order:0,version:1,deletedAt:null}]});return {categoryId:category.id,propertyId};};
  ({categoryId,propertyId}=await findTags(userA));({categoryId:categoryBId,propertyId:propertyBId}=await findTags(userB));
  app=buildApi({config,identityService:identity,careerService:new CareerService(fixture.resource)});
 },60000);
 afterAll(async()=>{await app?.close();await fixture?.dispose();});
 const path=()=>`${API_PREFIX}/career/categories/${categoryId}/property-schema/${propertyId}/options`;
 async function register(token:string,label:string) {const result=await app.inject({method:"POST",url:token===tokenB?`${API_PREFIX}/career/categories/${categoryBId}/property-schema/${propertyBId}/options`:path(),headers:{authorization:`Bearer ${token}`},payload:{label}});expect(result.statusCode).toBe(200);return CareerPropertyOptionResponseSchema.parse(result.json());}
 it("preserves raw labels, retries stable IDs and isolates simultaneous users without schema/record writes",async()=>{
  const db=mongoCollections(fixture.resource.db),before=await db.careerCategories.findOne({_id:categoryId});
  const count=await db.careerRecords.countDocuments({});
  const responses=await Promise.all(Array.from({length:6},()=>register(tokenA," Exact 😀 tag ")));
  expect(new Set(responses.map(response=>response.data.id)).size).toBe(1);expect(responses[0]!.data.name).toBe(" Exact 😀 tag ");
  expect(categoryBId).not.toBe(categoryId);
  expect((await app.inject({method:"POST",url:path(),headers:{authorization:`Bearer ${tokenB}`},payload:{label:"foreign attempt"}})).statusCode).toBe(404);
  const b=await register(tokenB," Exact 😀 tag ");expect(b.data.id).not.toBe(responses[0]!.data.id);
  expect(await fixture.resource.db.collection("career_property_options").countDocuments({userId:userA,categoryId,propertyId,rawLabel:" Exact 😀 tag "})).toBe(1);
  expect(await db.careerCategories.findOne({_id:categoryId})).toEqual(before);expect(await db.careerRecords.countDocuments({})).toBe(count);
 });
 it("rejects untrusted owner input and unauthenticated requests before option writes",async()=>{
  const count=await fixture.resource.db.collection("career_property_options").countDocuments({});
  expect((await app.inject({method:"POST",url:path(),headers:{authorization:`Bearer ${tokenA}`},payload:{label:"x",userId:userB}})).statusCode).toBe(400);
  expect((await app.inject({method:"POST",url:path(),payload:{label:"x"}})).statusCode).toBe(401);
  expect(await fixture.resource.db.collection("career_property_options").countDocuments({})).toBe(count);
 });
 it.each(["name","label","both"])("stores new option %s aliases as name without changing IDs or metadata",async field=>{
  const optionId=randomUUID(),propertyId=randomUUID(),text=" Exact 😀 ";
  const option={id:optionId,color:"blue",...(field!=="label"?{name:text}:{}),...(field!=="name"?{label:text}:{})};
  const response=await app.inject({method:"POST",url:`${API_PREFIX}/career/categories`,headers:{authorization:`Bearer ${tokenA}`},payload:{key:`pick_${randomUUID().replaceAll("-","")}`,name:"Pick",icon:"note",defaultView:"table",propertySchemaV2:[{id:propertyId,key:"pick",name:"Pick",type:"select",required:false,system:false,config:{options:[option]},order:0,version:1,deletedAt:null}]}});
  expect(response.statusCode).toBe(201);
  const stored=await mongoCollections(fixture.resource.db).careerCategories.findOne({_id:response.json().data.id});
  expect(stored!.propertySchemaV2[0]!.config.options).toEqual([{id:optionId,name:text,color:"blue"}]);
 });
 it("rejects conflicting option aliases on category creation without any write",async()=>{
  const db=mongoCollections(fixture.resource.db),before=await db.careerCategories.countDocuments({userId:userA});
  const response=await app.inject({method:"POST",url:`${API_PREFIX}/career/categories`,headers:{authorization:`Bearer ${tokenA}`},payload:{key:"conflicting_options",name:"Pick",icon:"note",defaultView:"table",propertySchemaV2:[{id:randomUUID(),key:"pick",name:"Pick",type:"select",required:false,system:false,config:{options:[{id:randomUUID(),name:"A",label:"B"}]},order:0,version:1,deletedAt:null}]}});
  expect(response.statusCode).toBe(400);expect(await db.careerCategories.countDocuments({userId:userA})).toBe(before);
 });
 it.each(["name","label"])("keeps a contract-valid UUIDv7 option ID when normalizing %s",async field=>{
  const optionId="019a3370-0000-7000-8000-000000000001";expect(UuidSchema.safeParse(optionId).success).toBe(true);
  const input={key:`v7_${randomUUID().replaceAll("-","")}`,name:"UUIDv7",icon:"note",defaultView:"table",propertySchemaV2:[{id:randomUUID(),key:"pick",name:"Pick",type:"select",required:false,system:false,config:{options:[{id:optionId,[field]:" Exact ",color:"blue"}]},order:0,version:1,deletedAt:null}]};
  expect(CreateCareerCategorySchema.safeParse(input).success).toBe(true);
  const response=await app.inject({method:"POST",url:`${API_PREFIX}/career/categories`,headers:{authorization:`Bearer ${tokenA}`},payload:input});
  expect(response.statusCode).toBe(201);
  expect((await mongoCollections(fixture.resource.db).careerCategories.findOne({_id:response.json().data.id}))!.propertySchemaV2[0]!.config.options).toEqual([{id:optionId,name:" Exact ",color:"blue"}]);
 });
 it("rejects invalid option configurations before any category write with an otherwise valid request",async()=>{
  const optionId=randomUUID(),db=mongoCollections(fixture.resource.db),before=await db.careerCategories.countDocuments({userId:userA});
  for(const options of ["not an array",[{id:"not-a-uuid",name:"A"}],[{id:optionId,name:5}],[{id:optionId,name:" "}],[{id:optionId,name:"A",label:"B"}],[{id:optionId,name:"A"},{id:optionId,name:"B"}]]) {
   const input={key:`bad_${randomUUID().replaceAll("-","")}`,name:"Invalid",icon:"note",defaultView:"table",propertySchemaV2:[{id:randomUUID(),key:"pick",name:"Pick",type:"select",required:false,system:false,config:{options},order:0,version:1,deletedAt:null}]};
   expect(CreateCareerCategorySchema.safeParse(input).success).toBe(true);
   const response=await app.inject({method:"POST",url:`${API_PREFIX}/career/categories`,headers:{authorization:`Bearer ${tokenA}`},payload:input});
   expect(response.statusCode).toBe(400);expect(await db.careerCategories.countDocuments({userId:userA})).toBe(before);
  }
 });
 it("normalizes legacy label options when adding an ordinary option without changing records",async()=>{
  const propertyId=randomUUID(),optionId=randomUUID(),career=new CareerService(fixture.resource);
  const category=await career.createCategory(userA,{key:`ordinary_${randomUUID().replaceAll("-","")}`,name:"Ordinary",icon:"note",defaultView:"table",propertySchemaV2:[{id:propertyId,key:"pick",name:"Pick",type:"select",required:false,system:false,config:{options:[{id:optionId,name:" Existing ",color:"blue"}]},order:0,version:1,deletedAt:null}]});
  const db=mongoCollections(fixture.resource.db);
  await db.careerCategories.updateOne({_id:category.id},{$set:{"propertySchemaV2.0.config.options":[{id:optionId,label:" Existing ",color:"blue"}]}});
  const records=await db.careerRecords.find({userId:userA}).toArray();
  const response=await app.inject({method:"POST",url:`${API_PREFIX}/career/categories/${category.id}/property-schema/${propertyId}/options`,headers:{authorization:`Bearer ${tokenA}`},payload:{label:" Added "}});
  expect(response.statusCode).toBe(200);const added=CareerPropertyOptionResponseSchema.parse(response.json());
  expect((await db.careerCategories.findOne({_id:category.id}))!.propertySchemaV2[0]!.config.options).toEqual([{id:optionId,name:" Existing ",color:"blue"},{id:added.data.id,name:" Added "}]);
  expect(await db.careerRecords.find({userId:userA}).toArray()).toEqual(records);
 });
});
