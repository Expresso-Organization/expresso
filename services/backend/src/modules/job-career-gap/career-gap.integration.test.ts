import { randomUUID } from "node:crypto";
import { MongoClient, type Collection } from "mongodb";
import { describe, expect, it } from "vitest";
import { loadMongoMigrations, type CareerGapRunDoc } from "@expresso/database";
const uri = process.env.TEST_MONGODB_URL;
describe.skipIf(!uri)("Gap collection infrastructure", () => {
  it("enforces request uniqueness and one active run", async () => {
    const client = await new MongoClient(uri!).connect();
    const db = client.db(`expresso_gap_test_${randomUUID().replaceAll("-", "")}`);
    try {
      const migration = (await loadMongoMigrations()).find((item) => item.version === "0014")!;
      for (const step of migration.steps) await step.run(db);
      const rows = db.collection<CareerGapRunDoc>("job_career_gaps");
      const row = { _id: randomUUID(), userId: randomUUID(), conversationId: randomUUID(), requestId: randomUUID(), messageIds: [], inputFingerprint: "a".repeat(64), status: "running" as const, attemptId: randomUUID(), leaseUntil: new Date(), createdAt: new Date(), result: null };
      await rows.insertOne(row);
      await expect(rows.insertOne({ ...row, _id: randomUUID(), requestId: randomUUID() })).rejects.toMatchObject({ code: 11000 });
      await rows.updateOne({ _id: row._id }, { $set: { status: "failed" } });
      await rows.insertOne({ ...row, _id: randomUUID(), requestId: randomUUID() });
      await expect(rows.insertOne({ ...row, _id: randomUUID(), status: "completed" })).rejects.toMatchObject({ code: 11000 });
    } finally { await db.dropDatabase(); await client.close(); }
  });
});

import { vi } from "vitest";
import { CareerGapService } from "./service.js";
import type { CareerGapInputLoader, GapInput } from "./input-loader.js";
import type { CareerGapAnalyzer } from "./analyzer.js";
async function withService(action: (context: { service: CareerGapService; rows: Collection<CareerGapRunDoc>; analyze: ReturnType<typeof vi.fn>; userId: string; conversationId: string }) => Promise<void>) {
  const client = await new MongoClient(uri!).connect();
  const db = client.db(`expresso_gap_test_${randomUUID().replaceAll("-", "")}`);
  try {
    const migration = (await loadMongoMigrations()).find((item) => item.version === "0014")!;
    for (const step of migration.steps) await step.run(db);
    const userId = randomUUID(); const conversationId = randomUUID(); const jobId = randomUUID();
    await db.collection<{ _id: string; deletionRequestedAt: null }>("users").insertOne({ _id: userId, deletionRequestedAt: null });
    const input = { career: { inputSnapshot: { jobPostingId: jobId, jobContentHash: "a".repeat(64), records: [], inputTruncated: false }, job: { id: jobId } }, match: { id: randomUUID(), items: [] }, fingerprint: "b".repeat(64) } as unknown as GapInput;
    const loader = { load: vi.fn().mockResolvedValue(input), assertOwned: vi.fn().mockResolvedValue(undefined) } as unknown as CareerGapInputLoader;
    const analyze = vi.fn().mockResolvedValue({ summary: "확인된 Gap 없음", items: [] });
    const service = new CareerGapService({ client, db }, loader, { analyze } as unknown as CareerGapAnalyzer, 10000);
    await action({ service, rows: db.collection<CareerGapRunDoc>("job_career_gaps"), analyze, userId, conversationId });
  } finally { await db.dropDatabase(); await client.close(); }
}
describe.skipIf(!uri)("Gap run transactions", () => {
  it("returns the same result for repeated request IDs without another AI call", async () => withService(async ({ service, analyze, userId, conversationId }) => {
    const request = { requestId: randomUUID(), messageIds: [] };
    const first = await service.analyze(userId, conversationId, request);
    const second = await service.analyze(userId, conversationId, request);
    expect(second.id).toBe(first.id); expect(analyze).toHaveBeenCalledTimes(1);
  }));
  it("allows a failed request to retry and restores the completed result", async () => withService(async ({ service, analyze, userId, conversationId }) => {
    const request = { requestId: randomUUID(), messageIds: [] };
    analyze.mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(service.analyze(userId, conversationId, request)).rejects.toThrow("provider unavailable");
    const result = await service.analyze(userId, conversationId, request);
    expect((await service.getLatest(userId, conversationId)).data?.id).toBe(result.id);
  }));
  it("blocks late results from an expired attempt", async () => withService(async ({ service, rows, analyze, userId, conversationId }) => {
    let release!: (value: { summary: string; items: [] }) => void;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    analyze.mockImplementationOnce(() => { markStarted(); return new Promise((resolve) => { release = resolve; }); });
    const request = { requestId: randomUUID(), messageIds: [] };
    const old = service.analyze(userId, conversationId, request).then(() => null, (error: unknown) => error);
    await started;
    await rows.updateOne({ userId, conversationId, status: "running" }, { $set: { leaseUntil: new Date(0) } });
    const fresh = await service.analyze(userId, conversationId, request);
    release({ summary: "이전 실행 결과", items: [] });
    expect(await old).toMatchObject({ statusCode: 409 });
    expect((await service.getLatest(userId, conversationId)).data?.id).toBe(fresh.id);
  }));
});
