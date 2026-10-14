import { afterAll,beforeAll,describe, expect, it } from "vitest";
import { loadMongoMigrations } from "./mongo-migrations.js";
import { MongoClient,type Document } from "mongodb";
import { randomUUID } from "node:crypto";
import { migrateMongo } from "./mongo-migrate.js";

describe("forward-only property mutation storage preparation", () => {
  it("prepares durable jobs and receipts after immutable 0014", async () => {
    const migrations = await loadMongoMigrations();
    expect(migrations.map(item => item.version)).toEqual(["0001", "0002", "0003", "0004", "0005", "0006", "0007", "0008", "0009", "0010", "0014", "0015"]);
    expect(migrations.at(-1)!.steps.map(step => step.id)).toEqual(["career_property_mutations:collection", "career_property_mutation_receipts:collection", "career_records:derived_metadata"]);
  });
});
describe.skipIf(!process.env.TEST_MONGODB_URL)("durable mutation validators and indexes",()=>{
  const name=`expresso_test_prcdb_${randomUUID().replaceAll("-","")}`,url=process.env.TEST_MONGODB_URL!;
  const client=new MongoClient(url??"mongodb://127.0.0.1"),db=client.db(name);
  beforeAll(async()=>{await client.connect();await migrateMongo({databaseUrl:url,databaseName:name});},60_000);
  afterAll(async()=>{try{await db.dropDatabase();}finally{await client.close();}});
  const userId=randomUUID(),categoryId=randomUUID(),propertyId=randomUUID(),now=new Date();
  const job={_id:randomUUID(),userId,categoryId,propertyId,planJson:"{}",operationFingerprint:"a".repeat(64),status:"pending",active:true,cursor:0,processedCount:0,skippedCount:0,attempts:0,leaseToken:null,leaseUntil:null,lastError:null,commitFence:0,createdAt:now,updatedAt:now,completedAt:null};
  it("validates progress and uniquely fences the active category while preserving completed history",async()=>{
    const jobs=db.collection<Document & {_id:string}>("career_property_mutations");await jobs.insertOne(job);
    await expect(jobs.insertOne({...job,_id:randomUUID()})).rejects.toMatchObject({code:11000});
    await expect(jobs.insertOne({...job,_id:randomUUID(),categoryId:randomUUID(),cursor:-1})).rejects.toMatchObject({code:121});
    await jobs.updateOne({_id:job._id},{$set:{status:"completed",active:false}});await expect(jobs.insertOne({...job,_id:randomUUID()})).resolves.toBeTruthy();
  });
  it("receipt uniqueness and derived metadata keep canonical and document storage intact",async()=>{
    const receipts=db.collection<Document & {_id:string}>("career_property_mutation_receipts"),recordId=randomUUID();
    const response={_id:recordId,userId,categoryId,title:"test",propertyValues:[],status:"draft",version:1,updatedAt:now};const receipt={_id:randomUUID(),userId,mutationId:job._id,recordId,operationFingerprint:job.operationFingerprint,response,changed:false,createdAt:now};
    await receipts.insertOne(receipt);await expect(receipts.insertOne({...receipt,_id:randomUUID()})).rejects.toMatchObject({code:11000});
    const records=db.collection<Document & {_id:string}>("career_records");const record={...response,origin:"manual",properties:{legacy:"sentinel"},bodyMd:"document sentinel",documentVersion:7};await records.insertOne(record);
    await records.updateOne({_id:recordId},{$set:{computedAt:now,computationVersion:1,computedProperties:{}}});const after=await records.findOne({_id:recordId});expect(after).toMatchObject({...record,computationVersion:1});
    await expect(records.updateOne({_id:recordId},{$set:{computationVersion:-1}})).rejects.toMatchObject({code:121});expect((await migrateMongo({databaseUrl:url,databaseName:name})).applied).toEqual([]);
  });
});
