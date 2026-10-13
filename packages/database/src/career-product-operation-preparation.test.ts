import { randomUUID } from "node:crypto";
import { beforeAll,afterAll,describe,expect,it } from "vitest";
import { MongoClient,type Document } from "mongodb";
import { loadMongoMigrations } from "./mongo-migrations.js";
import { migrateMongo } from "./mongo-migrate.js";
const operation=()=>{const id=randomUUID(),userId=randomUUID(),now=new Date();const intent={producer:"career-product",userId,sourceId:id,operationId:id,fingerprint:"a".repeat(64),business:{kind:"create",expectedCategoryVersion:1,input:{categoryId:randomUUID(),title:"",propertyValues:[]}},document:{kind:"markdown",recordId:null,expectedVersion:0,markdown:"body",summary:"생성"},state:"pending",leaseToken:null,leaseUntil:null,attempts:0,fence:0,businessResult:null,documentResult:null,lastError:null,createdAt:now.toISOString(),updatedAt:now.toISOString()};return {_id:id,userId,inputIdempotencyKey:randomUUID(),inputHash:"b".repeat(64),requestHash:intent.fingerprint,kind:"create",recordId:null,writerIntegration:intent,active:true,result:null,createdAt:now,updatedAt:now};};
describe("forward-only product owner preparation",()=>{
 it("appends0019 without rewriting producer/relation preparation",async()=>{const list=await loadMongoMigrations();expect(list.at(-1)?.version).toBe("0019");expect(list.find(row=>row.version==="0016")?.name).toBe("career_producer_preparation");expect(list.find(row=>row.version==="0018")?.name).toBe("career_relation_property_mutation_preparation");});
});
describe.skipIf(!process.env.TEST_MONGODB_URL)("actual product owner operation storage",()=>{
 const name=`expresso_test_b2prod_${randomUUID().replaceAll("-","")}`;let client:MongoClient;
 beforeAll(async()=>{client=new MongoClient(process.env.TEST_MONGODB_URL!);await client.connect();await migrateMongo({databaseUrl:process.env.TEST_MONGODB_URL!,databaseName:name});},60000);
 afterAll(async()=>{try{await client?.db(name).dropDatabase();}finally{await client?.close();}});
 it("uniquely binds actor input key and frozen intent, rejecting unknown private fields",async()=>{
  const coll=client.db(name).collection<Document&{_id:string}>("career_product_operations"),row=operation();await coll.insertOne(row);
  await expect(coll.insertOne({...row,_id:randomUUID()})).rejects.toMatchObject({code:121});
  await expect(coll.insertOne({...operation(),credential:"never-store-token"})).rejects.toMatchObject({code:121});
  await expect(coll.insertOne({...row,writerIntegration:{...row.writerIntegration,userId:randomUUID()}})).rejects.toMatchObject({code:121});
  const other=operation();await expect(coll.insertOne({...other,userId:row.userId,inputIdempotencyKey:row.inputIdempotencyKey,writerIntegration:{...other.writerIntegration,userId:row.userId}})).rejects.toMatchObject({code:11000});
  expect((await coll.listIndexes().toArray()).find(index=>index.name==="career_product_input_key")?.unique).toBe(true);
 });
 it("stores document-only patch intent without inventing a business mutation",async()=>{
  const row=operation(),recordId=randomUUID(),coll=client.db(name).collection<Document&{_id:string}>("career_product_operations");
  const document={kind:"markdown",recordId,expectedVersion:3,markdown:"Document only",summary:"본문 수정"};
  await coll.insertOne({...row,kind:"patch",recordId,writerIntegration:{...row.writerIntegration,business:null,document}});
  expect(await coll.findOne({_id:row._id})).toMatchObject({kind:"patch",recordId,writerIntegration:{business:null,document}});
  const other=operation();await expect(coll.insertOne({...other,kind:"patch",recordId,writerIntegration:{...other.writerIntegration,business:null,document:{...document,recordId:randomUUID()}}})).rejects.toMatchObject({code:121});
 });
 it("retains blocked receipt metadata and does not add TTL expiry to durable operations",async()=>{
  const row=operation(),coll=client.db(name).collection<Document&{_id:string}>("career_product_operations");await coll.insertOne({...row,writerIntegration:{...row.writerIntegration,state:"blocked",lastError:"OWNER_CONFLICT"}});
  expect(await coll.findOne({_id:row._id})).toMatchObject({writerIntegration:{state:"blocked"}});
  expect((await coll.listIndexes().toArray()).some(index=>index.expireAfterSeconds!==undefined)).toBe(false);
 });
 it("keeps previous migrations and existing business/document data untouched on replay",async()=>{
  const db=client.db(name),row=operation(),recordId=randomUUID();await db.collection<Document&{_id:string}>("career_records").insertOne({_id:recordId,userId:row.userId,categoryId:row.writerIntegration.business.input.categoryId,title:"Keep",status:"draft",origin:"manual",properties:{sentinel:"legacy"},propertyValues:[],bodyMd:"Keep document",version:3,referenceVersion:4,documentVersion:9,createdAt:new Date(),updatedAt:new Date(),deletedAt:null,purgeAfter:null});
  const before=await db.collection<Document&{_id:string}>("career_records").findOne({_id:recordId});expect((await migrateMongo({databaseUrl:process.env.TEST_MONGODB_URL!,databaseName:name})).applied).toEqual([]);expect(await db.collection<Document&{_id:string}>("career_records").findOne({_id:recordId})).toEqual(before);
 });
});
