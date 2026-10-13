import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { loadMongoMigrations, type PreparationPlanDoc } from "@expresso/database";
import { CareerGapResultSchema, type CreatePreparation, type PreparationPlan } from "@expresso/contracts";
import { describe, expect, it, vi } from "vitest";
import { PreparationService } from "../career-preparation/index.js";
import { PreparationProgressService } from "./service.js";
const uri = process.env.TEST_MONGODB_URL;
async function withService(action: (context: { service: PreparationService; progress: PreparationProgressService; input: CreatePreparation; userId: string; conversationId: string; setStale: () => void; count: () => Promise<number> }) => Promise<void>) {
  const client = await new MongoClient(uri!).connect(); const db = client.db(`expresso_progress_test_${randomUUID().replaceAll("-", "")}`);
  try {
    for (const migration of (await loadMongoMigrations()).filter((item) => ["0015", "0016"].includes(item.version))) for (const step of migration.steps) await step.run(db);
    const userId = randomUUID(), conversationId = randomUUID(), jobId = randomUUID(), gapId = randomUUID();
    await db.collection<{ _id: string; deletionRequestedAt: null }>("users").insertOne({ _id: userId, deletionRequestedAt: null });
    const gap = CareerGapResultSchema.parse({ id: randomUUID(), conversationId, jobPostingId: jobId, careerMatchId: randomUUID(), requestId: randomUUID(), createdAt: new Date().toISOString(), promptVersion: 2, inputFingerprint: "a".repeat(64), inputSnapshot: { jobPostingId: jobId, jobContentHash: "b".repeat(64), records: [], inputTruncated: false }, messageIds: [], summary: "Java 보완", items: [{ id: gapId, requirementIndex: 0, requirement: "Java 프로젝트", type: "skill", status: "needs_improvement", priority: "high", explanation: "명시적 확인", evidence: [{ sourceType: "job", sourceId: jobId, quote: "Java" }], nextAction: "prepare", suggestedAction: "작은 API 실습" }] });
    let stale = false;
    const gaps = { getLatest: vi.fn(async (owner: string, id: string) => { if (owner !== userId || id !== conversationId) throw Object.assign(new Error("not found"), { statusCode: 404 }); return { data: gap, stale }; }) };
    const service = new PreparationService({ client, db }, gaps);
    const input = { requestId: randomUUID(), gapResultId: gap.id, gapIds: [gapId], settings: { weeklyHours: 3, weeks: 4, startDate: "2026-10-14" } };
    await action({ service, progress: new PreparationProgressService({ client, db }, service, gaps), input, userId, conversationId, setStale: () => { stale = true; }, count: () => db.collection<PreparationPlanDoc>("career_preparation_plans").countDocuments() });
  } finally { await db.dropDatabase(); await client.close(); }
}
function approval(plan: PreparationPlan) { return { expectedVersion: plan.version, title: "수정된 테스트 계획", summary: plan.summary, taskEdits: plan.tasks.map(({ id, title, action, deliverable }) => ({ id, title, action, deliverable })) }; }

describe.skipIf(!uri)("Progress persistence", () => {
 it("requires approval and keeps repeated starts idempotent", async()=>withService(async({service,progress,input,userId,conversationId})=>{
 const draft=await service.create(userId,conversationId,input);
 await expect(progress.start(userId,conversationId,draft.id)).rejects.toMatchObject({statusCode:409});
 await service.approve(userId,conversationId,draft.id,approval(draft));
 const first=await progress.start(userId,conversationId,draft.id);
 expect(await progress.start(userId,conversationId,draft.id)).toEqual(first);
 await expect(progress.get(randomUUID(),conversationId,draft.id)).rejects.toMatchObject({statusCode:404});
 }));
 it("saves outcomes, repeats writes safely and preserves completed work on replan", async()=>withService(async({service,progress,input,userId,conversationId})=>{
 const draft=await service.create(userId,conversationId,input);await service.approve(userId,conversationId,draft.id,approval(draft));
 const initial=await progress.start(userId,conversationId,draft.id);const task=initial.tasks[0]!;
 const update={requestId:randomUUID(),expectedVersion:1,status:"completed" as const,note:"確認",outcome:"예제 실행 성공",outcomeUrl:"",spentMinutes:45};
 const saved=await progress.update(userId,conversationId,draft.id,task.id,update);
 expect((await progress.update(userId,conversationId,draft.id,task.id,update)).version).toBe(2);
 const candidate=await progress.createReplan(userId,conversationId,draft.id,{requestId:randomUUID(),expectedVersion:2,settings:{weeklyHours:1,weeks:4,startDate:"2026-10-21"}});
 expect(candidate.slots).toHaveLength(2);
 await progress.decideReplan(userId,conversationId,draft.id,candidate.id,1,"approve");
 const result=(await progress.get(userId,conversationId,draft.id))!;
 expect(result.tasks[0]).toEqual(saved.tasks[0]);expect(result.scheduleVersion).toBe(2);expect(result.history).toHaveLength(2);expect(result.tasks[1]!.date).toBe("2026-10-21");
 }));
 it("blocks approval after progress changes and keeps rejected schedules unchanged",async()=>withService(async({service,progress,input,userId,conversationId})=>{
 const draft=await service.create(userId,conversationId,input);await service.approve(userId,conversationId,draft.id,approval(draft));
 const initial=await progress.start(userId,conversationId,draft.id);
 const candidate=await progress.createReplan(userId,conversationId,draft.id,{requestId:randomUUID(),expectedVersion:1,settings:{weeklyHours:1,weeks:4,startDate:"2026-10-21"}});
 await progress.update(userId,conversationId,draft.id,initial.tasks[0]!.id,{requestId:randomUUID(),expectedVersion:1,status:"blocked",note:"시간 부족",outcome:"",outcomeUrl:"",spentMinutes:0});
 await expect(progress.decideReplan(userId,conversationId,draft.id,candidate.id,1,"approve")).rejects.toMatchObject({statusCode:409});
 await progress.decideReplan(userId,conversationId,draft.id,candidate.id,1,"reject");
 expect((await progress.get(userId,conversationId,draft.id))!.scheduleVersion).toBe(1);
 }));
 it("allows progress logging but blocks replans for stale P6",async()=>withService(async({service,progress,input,userId,conversationId,setStale})=>{
 const draft=await service.create(userId,conversationId,input);await service.approve(userId,conversationId,draft.id,approval(draft));
 const initial=await progress.start(userId,conversationId,draft.id);setStale();
 await progress.update(userId,conversationId,draft.id,initial.tasks[0]!.id,{requestId:randomUUID(),expectedVersion:1,status:"in_progress",note:"실습 시작",outcome:"",outcomeUrl:"",spentMinutes:10});
 await expect(progress.createReplan(userId,conversationId,draft.id,{requestId:randomUUID(),expectedVersion:2,settings:{weeklyHours:1,weeks:4,startDate:"2026-10-21"}})).rejects.toMatchObject({statusCode:409});
 }));
});
