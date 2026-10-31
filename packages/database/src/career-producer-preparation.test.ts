import { describe,it,expect,beforeAll,afterAll } from "vitest";
import { loadMongoMigrations } from "./mongo-migrations.js";
import { migrateMongo } from "./mongo-migrate.js";
import { MongoClient,type Document } from "mongodb";
import { randomUUID } from "node:crypto";
describe("prepared producer storage",()=>{
 it("adds forward-only0027 while preserving0025/0026",async()=>{
 const list=await loadMongoMigrations();
 const producer=list.find(migration=>migration.version==="0027");
 expect(producer).toBeDefined();
 expect(producer?.steps.map(s=>s.id)).toContain("career_ai_proposals:durable_intent");
 });
});
describe.skipIf(!process.env.TEST_MONGODB_URL)("real prepared producer storage",()=>{
 const url=process.env.TEST_MONGODB_URL!,name="expresso_prdstore_"+randomUUID().replaceAll("-","");
 const client=new MongoClient(url??"mongodb://127.0.0.1"),db=client.db(name);
 beforeAll(async()=>{await client.connect();await migrateMongo({databaseUrl:url,databaseName:name});},60000);
 afterAll(async()=>{try{await db.dropDatabase();}finally{await client.close();}});
 it("retains durable pending receipts while legacy proposal TTL still expires",async()=>{
  // TTL 모니터 주기는 서버 전역 설정이므로 읽기만 하고 실제 주기에 맞춰 기다립니다.
  const ttl=await client.db("admin").command({getParameter:1,ttlMonitorEnabled:1,ttlMonitorSleepSecs:1});
  expect(ttl.ttlMonitorEnabled,"TTL deletion requires ttlMonitorEnabled=true on the test MongoDB").toBe(true);
  const intervalSeconds=ttl.ttlMonitorSleepSecs;
  if(!Number.isInteger(intervalSeconds) || intervalSeconds<1 || intervalSeconds>60){
   throw new Error("TTL integration test requires ttlMonitorSleepSecs between 1 and 60 on the test MongoDB");
  }
  // 한 주기 경계에서 넣어도 다음 삭제 주기까지 관찰하며, 삭제되면 즉시 끝납니다.
  const deletionBudgetMs=intervalSeconds*2*1000+5000;
  const now=new Date(),id=randomUUID(),userId=randomUUID();
  const proposal={_id:id,userId,recordId:randomUUID(),status:"ready",baseDocumentVersion:0,selection:{blockIds:[]},prompt:"정리",summary:null,commands:[],propertyChanges:[],progress:null,beforeSnapshotId:null,afterSnapshotId:null,beforeChecksum:null,afterChecksum:null,revisionId:null,appliedDocumentVersion:null,expiresAt:new Date(0),createdAt:now,updatedAt:now};
  const intent={producer:"ai-proposal",userId,sourceId:id,operationId:randomUUID(),fingerprint:"a".repeat(64),business:null,document:{kind:"markdown",recordId:proposal.recordId,expectedVersion:0,markdown:"본문",summary:"정리"},state:"pending",leaseToken:null,leaseUntil:null,attempts:0,fence:0,businessResult:null,documentResult:null,lastError:null,createdAt:now.toISOString(),updatedAt:now.toISOString()};
  const coll=db.collection<Document&{_id:string}>("career_ai_proposals");
  await coll.insertMany([{...proposal,writerIntegration:intent},{...proposal,_id:randomUUID()}]);
  const indexes=await coll.listIndexes().toArray();
  expect(indexes.find(i=>i.name==="career_ai_proposal_expiry")?.partialFilterExpression).toEqual({writerIntegration:{$eq:null}});
  const deadline=Date.now()+deletionBudgetMs;
  while(await coll.countDocuments({writerIntegration:{$eq:null}})>0 && Date.now()<deadline)await new Promise(r=>setTimeout(r,500));
  expect(await coll.countDocuments({writerIntegration:{$eq:null}}),`Legacy proposal TTL did not run within ${deletionBudgetMs}ms (ttlMonitorSleepSecs=${intervalSeconds})`).toBe(0);
  expect(await coll.countDocuments({_id:id})).toBe(1);
  expect((await migrateMongo({databaseUrl:url,databaseName:name})).applied).toEqual([]);
 },130000);
});