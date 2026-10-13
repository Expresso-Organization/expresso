import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { mongoCollections } from "@expresso/database";
import { CareerProducerBusinessResultSchema,CareerProducerScopeSchema,type CareerProducerBusinessCommand } from "@expresso/contracts";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoIdentityService } from "../identity/index.js";
import { CareerService } from "./service.js";
import { CareerProducerCoordinator,type CareerProducerDocumentPort } from "./prepared-producer.js";
import { PreparedCareerProductWrites } from "./prepared-product-writes.js";
const noDocument:CareerProducerDocumentPort={reserve:async()=>{},cancel:async()=>{},commit:async()=>{throw new Error("owner must not be repeated");}};
describe.skipIf(!process.env.TEST_MONGODB_URL)("durable product write preparation",()=>{
 let fixture:Awaited<ReturnType<typeof createMongoFixture>>,userId:string;
 beforeAll(async()=>{fixture=await createMongoFixture("b2product");userId=(await new MongoIdentityService(fixture.resource).signup({email:randomUUID()+"@example.com",displayName:"Product",password:"correct-horse-battery"})).user.id;},60000);
 afterAll(async()=>fixture?.dispose());
 const writer=()=>new PreparedCareerProductWrites(fixture.resource,new CareerProducerCoordinator(fixture.resource,{commit:async()=>{throw new Error("unexpected owner call");}},noDocument));
 async function category(){const value=await new CareerService(fixture.resource).createCategory(userId,{key:"p_"+randomUUID().replaceAll("-",""),name:"Product",icon:"folder",defaultView:"table",propertySchema:{}});await mongoCollections(fixture.resource.db).careerCategories.updateOne({_id:value.id},{$set:{propertySchemaV2:[],schemaVersion:1}});return value;}
 it("deduplicates parallel same-key input and freezes the first owner payload",async()=>{
  const cat=await category(),key="existing-public-key_0001",business:CareerProducerBusinessCommand={kind:"create",expectedCategoryVersion:1,input:{categoryId:cat.id,title:"Keep",propertyValues:[]}},service=writer();
  const deliveries=await Promise.all([0,1].map(()=>service.prepareWithStatus(userId,key,"a".repeat(64),business,null,{kind:"create",recordId:null})));
  expect(new Set(deliveries.map(value=>value.scope.operationId)).size).toBe(1);expect(deliveries.filter(value=>value.created)).toHaveLength(1);
  expect(await service.prepareWithStatus(userId,key,"a".repeat(64),business,null,{kind:"create",recordId:null})).toMatchObject({created:false});
  await expect(service.prepare(userId,key,"b".repeat(64),business,null,{kind:"create",recordId:null})).rejects.toMatchObject({statusCode:409});
  expect(await mongoCollections(fixture.resource.db).careerProductOperations.countDocuments({userId,inputIdempotencyKey:key})).toBe(1);
  await mongoCollections(fixture.resource.db).careerCategories.updateOne({_id:cat.id},{$inc:{version:1}});
  expect(await service.findPrepared(userId,key,"a".repeat(64))).toEqual(deliveries[0]!.scope);
  await expect(service.findPrepared(userId,key,"f".repeat(64))).rejects.toMatchObject({statusCode:409});
 });
 it("allows body-only prepare without changing scalar/version and rejects stale If-Match",async()=>{
  const cat=await category(),record=(await new CareerService(fixture.resource).createRecord(userId,randomUUID(),{categoryId:cat.id,title:"Kept",properties:{},bodyMd:"Before"})).record,db=mongoCollections(fixture.resource.db),before=await db.careerRecords.findOne({_id:record.id}),service=writer();
  const document={kind:"markdown"as const,recordId:record.id,expectedVersion:before?.documentVersion??0,markdown:"After",summary:"본문"};
  const scope=await service.prepare(userId,randomUUID(),"c".repeat(64),null,document,{kind:"patch",recordId:record.id,expectedBusinessVersion:1});
  expect(CareerProducerScopeSchema.parse(scope).producer).toBe("career-product");expect((await db.careerProductOperations.findOne({_id:scope.sourceId}))?.writerIntegration.business).toBeNull();
  const after=await db.careerRecords.findOne({_id:record.id}); for(const field of ["title","version","propertyValues","bodyMd","documentVersion"]as const)expect({present:Object.hasOwn(after!,field),value:after![field]}).toEqual({present:Object.hasOwn(before!,field),value:before![field]});
  await expect(service.prepare(userId,randomUUID(),"d".repeat(64),null,document,{kind:"patch",recordId:record.id,expectedBusinessVersion:2})).rejects.toMatchObject({statusCode:412});
 });
 it("finalizes durable receipts once and never returns a purged record as completed",async()=>{
  const cat=await category(),business:CareerProducerBusinessCommand={kind:"create",expectedCategoryVersion:1,input:{categoryId:cat.id,title:"Created",propertyValues:[]}},service=writer(),scope=await service.prepare(userId,randomUUID(),"e".repeat(64),business,null,{kind:"create",recordId:null}),db=mongoCollections(fixture.resource.db);
  const record=(await new CareerService(fixture.resource).createRecord(userId,randomUUID(),{categoryId:cat.id,title:"Created",properties:{},bodyMd:""})).record;
  const receipt=CareerProducerBusinessResultSchema.parse({data:{id:record.id,userId,categoryId:cat.id,title:record.title,propertyValues:[],status:record.status,version:record.version,updatedAt:record.updatedAt},replayed:false});
  await db.careerProductOperations.updateOne({_id:scope.sourceId},{$set:{"writerIntegration.businessResult":receipt}});
  expect(await service.execute(scope)).toMatchObject({state:"completed"});const completed=await db.careerProductOperations.findOne({_id:scope.sourceId});expect(completed).toMatchObject({active:false,result:{recordId:record.id,version:1}});
  expect(await service.execute(scope)).toMatchObject({state:"completed"});expect(await db.careerProductOperations.findOne({_id:scope.sourceId})).toEqual(completed);
  const other=await service.prepare(userId,randomUUID(),"f".repeat(64),business,null,{kind:"create",recordId:null});await db.careerProductOperations.updateOne({_id:other.sourceId},{$set:{"writerIntegration.businessResult":{...receipt,data:{...receipt.data,id:randomUUID()}}}});
  await expect(service.execute(other)).rejects.toMatchObject({statusCode:404});expect((await db.careerProductOperations.findOne({_id:other.sourceId}))?.writerIntegration.state).not.toBe("completed");
 });
});
