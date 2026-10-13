import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { loadMongoMigrations, type PreparationPlanDoc } from "@expresso/database";
import { CareerGapResultSchema, type CreatePreparation, type PreparationPlan } from "@expresso/contracts";
import { describe, expect, it, vi } from "vitest";
import { PreparationService } from "./service.js";
const uri = process.env.TEST_MONGODB_URL;
async function withService(action: (context: { service: PreparationService; input: CreatePreparation; userId: string; conversationId: string; setStale: () => void; count: () => Promise<number> }) => Promise<void>) {
  const client = await new MongoClient(uri!).connect(); const db = client.db(`expresso_preparation_test_${randomUUID().replaceAll("-", "")}`);
  try {
    const migration = (await loadMongoMigrations()).find((item) => item.version === "0015")!;
    for (const step of migration.steps) await step.run(db);
    const userId = randomUUID(), conversationId = randomUUID(), jobId = randomUUID(), gapId = randomUUID();
    await db.collection<{ _id: string; deletionRequestedAt: null }>("users").insertOne({ _id: userId, deletionRequestedAt: null });
    const gap = CareerGapResultSchema.parse({ id: randomUUID(), conversationId, jobPostingId: jobId, careerMatchId: randomUUID(), requestId: randomUUID(), createdAt: new Date().toISOString(), promptVersion: 2, inputFingerprint: "a".repeat(64), inputSnapshot: { jobPostingId: jobId, jobContentHash: "b".repeat(64), records: [], inputTruncated: false }, messageIds: [], summary: "Java 보완", items: [{ id: gapId, requirementIndex: 0, requirement: "Java 프로젝트", type: "skill", status: "needs_improvement", priority: "high", explanation: "명시적 확인", evidence: [{ sourceType: "job", sourceId: jobId, quote: "Java" }], nextAction: "prepare", suggestedAction: "작은 API 실습" }] });
    let stale = false;
    const gaps = { getLatest: vi.fn(async (owner: string, id: string) => { if (owner !== userId || id !== conversationId) throw Object.assign(new Error("not found"), { statusCode: 404 }); return { data: gap, stale }; }) };
    const service = new PreparationService({ client, db }, gaps);
    const input = { requestId: randomUUID(), gapResultId: gap.id, gapIds: [gapId], settings: { weeklyHours: 3, weeks: 4, startDate: "2026-10-14" } };
    await action({ service, input, userId, conversationId, setStale: () => { stale = true; }, count: () => db.collection<PreparationPlanDoc>("career_preparation_plans").countDocuments() });
  } finally { await db.dropDatabase(); await client.close(); }
}
function approval(plan: PreparationPlan) { return { expectedVersion: plan.version, title: "수정된 테스트 계획", summary: plan.summary, taskEdits: plan.tasks.map(({ id, title, action, deliverable }) => ({ id, title, action, deliverable })) }; }
describe.skipIf(!uri)("Preparation persistence", () => {
  it("converges concurrent duplicate requests to one draft", async () => withService(async ({ service, input, userId, conversationId, count }) => {
    const results = await Promise.all([service.create(userId, conversationId, input), service.create(userId, conversationId, input)]);
    expect(results[0]!.id).toBe(results[1]!.id); expect(await count()).toBe(1); expect(results[0]!.status).toBe("draft");
  }));
  it("saves edits on approval and repeats approval without creating another plan", async () => withService(async ({ service, input, userId, conversationId, count }) => {
    const draft = await service.create(userId, conversationId, input); const edit = approval(draft);
    const approved = await service.approve(userId, conversationId, draft.id, edit);
    expect(approved.title).toBe(edit.title); expect(approved.status).toBe("approved");
    expect((await service.approve(userId, conversationId, draft.id, edit)).version).toBe(approved.version); expect(await count()).toBe(1);
  }));
  it("stores rejection and prevents approval afterward", async () => withService(async ({ service, input, userId, conversationId }) => {
    const draft = await service.create(userId, conversationId, input);
    expect((await service.reject(userId, conversationId, draft.id, draft.version)).status).toBe("rejected");
    await expect(service.approve(userId, conversationId, draft.id, approval(draft))).rejects.toMatchObject({ statusCode: 409 });
  }));
  it("blocks stale source approval and other users", async () => withService(async ({ service, input, userId, conversationId, setStale }) => {
    const draft = await service.create(userId, conversationId, input); setStale();
    await expect(service.approve(userId, conversationId, draft.id, approval(draft))).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.list(randomUUID(), conversationId)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.approve(randomUUID(), conversationId, draft.id, approval(draft))).rejects.toMatchObject({ statusCode: 404 });
  }));
});
