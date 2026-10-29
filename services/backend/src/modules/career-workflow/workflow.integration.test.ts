import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { loadMongoMigrations } from "@expresso/database";
import { type AgentConversation, type JobPostingDetail } from "@expresso/contracts";
import { CareerWorkflowService } from "./service.js";
import { MaterialsService } from "../materials/index.js";
import type { ConsentApi } from "../consent/index.js";
import type { CareerApi } from "../career/index.js";
import type { JobMarketApi } from "../jobs/index.js";
const uri = process.env.TEST_MONGODB_URL;
async function fixture(test: (x: { service: CareerWorkflowService; userId: string; conversationId: string; recordId: string; db: ReturnType<MongoClient["db"]>; changeJob(): void; setRunning(): void }) => Promise<void>) {
 const client = await new MongoClient(uri!).connect(); const db = client.db(`expresso_workflow_test_${randomUUID().replaceAll("-", "")}`);
 try {
  const migration = (await loadMongoMigrations()).find(row => row.version === "0025")!; for (const step of migration.steps) await step.run(db);
  const userId=randomUUID(), conversationId=randomUUID(), recordId=randomUUID(), jobId=randomUUID(), analysisId=randomUUID(), categoryId=randomUUID();
  await db.collection("users").insertOne({_id:userId,deletionRequestedAt:null} as never);
  // 트랜잭션 내부에서 직접 조회할 실제 대화 문서입니다.
// 트랜잭션 내부에서 직접 조회할 실제 대화 문서입니다.
  await db.collection("agent_conversations").insertOne({_id: conversationId, userId, title: "통합 테스트 대화", contexts: [{kind: "job", id: jobId, }], messages: [], version: 1, run: null, updatedAt: new Date().toISOString()} as never);
  const record={_id:recordId,userId,categoryId,title:"테스트 API",bodyMd:"Node.js로 조회 API를 구현했다.",version:1,status:"organized",properties:{},deletedAt:null,createdAt:new Date(),updatedAt:new Date()};
  await db.collection("career_records").insertOne(record as never);
  await db.collection("job_analyses").insertOne({_id:analysisId,userId,jobPostingId:jobId,status:"done",analyzedAt:new Date()} as never);
  let description="REST API 개발";let running=false;
  const conversation=()=>({id:conversationId,title:"테스트",updatedAt:new Date().toISOString(),contexts:[{kind:"job",id:jobId}],messages:[],version:1,run:running?{id:randomUUID(),requestId:randomUUID(),status:"running",error:null,startedAt:new Date().toISOString()}:null}) as AgentConversation;
  const agent={get:vi.fn(async(owner:string,id:string)=>{if(owner!==userId||id!==conversationId)throw Object.assign(new Error("not found"),{statusCode:404});return conversation();}),freshness:vi.fn(async()=>({stale:false,changed:[]}))};
  const career={getRecord:vi.fn(async(owner:string,id:string)=>{const row=await db.collection("career_records").findOne({_id:id,userId:owner} as never);if(!row)throw Object.assign(new Error("not found"),{statusCode:404});return {...record,...row,id:row._id};}) as unknown as CareerApi["getRecord"],listRecords:vi.fn() as unknown as CareerApi["listRecords"]};
  const jobs={get:vi.fn(async()=>({id:jobId,title:"백엔드",descriptionRaw:description}) as JobPostingDetail)};
  const market={analyzePosting:vi.fn(async()=>({jobPostingId:jobId,jobAnalysisId:analysisId,status:"done",reused:true})) as JobMarketApi["analyzePosting"]};
  const consent={require:vi.fn(async()=>{})} as unknown as ConsentApi;
  const service=new CareerWorkflowService({client,db},agent,career,jobs,market,new MaterialsService({client,db}),consent,null);
  await test({service,userId,conversationId,recordId,db,changeJob:()=>{description="변경된 공고";},setRunning:()=>{running=true;}});
 } finally {await db.dropDatabase();await client.close();}
}
describe.skipIf(!uri)("Career workflow persistence",()=>{
 it("deduplicates creation and blocks request reuse with different input",async()=>fixture(async({service,userId,conversationId,recordId,db})=>{
  const input={requestId:randomUUID(),text:"포트폴리오를 만들고 싶어",recordIds:[recordId]};
  const results=await Promise.all([service.create(userId,conversationId,input),service.create(userId,conversationId,input)]);
  expect(results[0]!.id).toBe(results[1]!.id);expect(await db.collection("career_workflows").countDocuments()).toBe(1);
  await expect(service.create(userId,conversationId,{...input,text:"다른 요청"})).rejects.toMatchObject({statusCode:409});
 }));
 it("creates one selected-material brew, reviews evidence and persists the handoff",async()=>fixture(async({service,userId,conversationId,recordId,db})=>{
  const run=await service.create(userId,conversationId,{requestId:randomUUID(),text:"포트폴리오를 만들고 싶어",recordIds:[recordId]});
  const prepared=await service.advance(userId,conversationId,run.id,1);expect(prepared.status).toBe("review_required");expect(await db.collection("brews").countDocuments()).toBe(1);
  const reviewed=await service.review(userId,conversationId,run.id,{expectedVersion:prepared.version,claims:prepared.claims});expect(reviewed.review!.items[0]!.status).toBe("supported");
  const result=await service.advance(userId,conversationId,run.id,reviewed.version);expect(result.nextPath).toBe(`/brew/${run.id}/materials`);
  expect((await service.advance(userId,conversationId,run.id,reviewed.version)).id).toBe(run.id);
  expect((await service.list(userId,conversationId))[0]!.status).toBe("handed_off");
 }));
 it("blocks stale inputs before any brew write",async()=>fixture(async({service,userId,conversationId,recordId,db,changeJob})=>{
  const run=await service.create(userId,conversationId,{requestId:randomUUID(),text:"포트폴리오",recordIds:[recordId]});changeJob();
  await expect(service.advance(userId,conversationId,run.id,1)).rejects.toMatchObject({statusCode:409});expect(await db.collection("brews").countDocuments()).toBe(0);
 }));
 it("cancels without creating a brew and isolates another user",async()=>fixture(async({service,userId,conversationId,recordId,db})=>{
  const run=await service.create(userId,conversationId,{requestId:randomUUID(),text:"포트폴리오",recordIds:[recordId]});
  expect((await service.cancel(userId,conversationId,run.id,1)).status).toBe("cancelled");
  await expect(service.advance(userId,conversationId,run.id,2)).rejects.toMatchObject({statusCode:409});
  await expect(service.list(randomUUID(),conversationId)).rejects.toMatchObject({statusCode:404});expect(await db.collection("brews").countDocuments()).toBe(0);
 }));
 it("rolls back brew creation for a changed record version",async()=>fixture(async({service,userId,conversationId,recordId,db})=>{
  const run=await service.create(userId,conversationId,{requestId:randomUUID(),text:"포트폴리오",recordIds:[recordId]});
  await db.collection("career_records").updateOne({_id:recordId} as never,{$inc:{version:1}});
  await expect(service.advance(userId,conversationId,run.id,1)).rejects.toMatchObject({statusCode:409});expect(await db.collection("brews").countDocuments()).toBe(0);
 }));
});
