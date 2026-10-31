import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { EvidenceSearchService } from "./service.js";
import { loadMongoMigrations } from "@expresso/database";
// 기록 읽기는 fixture로 주입하고, 색인·트랜잭션·소유권 쓰기 guard는 실제 MongoDB를 사용합니다.
vi.mock("../career/index.js", async () => ({
  ...(await import("../career/record-text.js")),
  ...(await import("../career/mongo-record-guard.js")),
}));
const uri = process.env.TEST_MONGODB_URL;
async function fixture(test: (x: Awaited<ReturnType<typeof setup>>) => Promise<void>) {
  const f = await setup();
  try { await test(f); } finally { await f.db.dropDatabase(); await f.client.close(); }
}
async function setup() {
  const client = await new MongoClient(uri!).connect();
  const db = client.db(`expresso_search_test_${randomUUID().replaceAll("-", "")}`);
  for (const migration of (await loadMongoMigrations()).filter(x => x.version === "0026")) for (const step of migration.steps) await step.run(db);
  const userId = randomUUID(), other = randomUUID(), recordId = randomUUID();
  await db.collection("users").insertMany([{ _id: userId, deletionRequestedAt: null }, { _id: other, deletionRequestedAt: null }] as never);
  await db.collection("career_records").insertOne({ _id: recordId, userId, title: "테스트", version: 1, documentVersion: 1, deletedAt: null, bodyMd: "프로젝트가 없으면 404를 반환했다." } as never);
  const career = { listCategories: async () => [], getRecord: async (owner: string, id: string) => {
    const row = await db.collection<{ _id: string; userId: string; documentVersion: number; bodyMd: string; title: string; version: number; deletedAt: Date | null }>("career_records").findOne({ _id: id, userId: owner, deletedAt: null });
    if (!row) throw Object.assign(new Error("not found"), { statusCode: 404 });
    return { ...row, id, status: "draft", properties: {}, categoryId: randomUUID() };
  } };
  const documents = { bootstrap: async (owner: string, id: string) => {
    const row = await career.getRecord(owner, id);
    return { documentVersion: row.documentVersion, document: { schemaVersion: 1, type: "doc", content: [{ id: recordId, type: "paragraph", attrs: {}, text: [{ text: row.bodyMd }] }] } };
  } };
  const consent = { list: async () => ({ data: { consents: [{ scope: "career_records", granted: true }, { scope: "job_posting_analysis", granted: true }] } }) };
  const jobs = { list: async () => ({ data: [], summary: { total: 0 }, page: { hasNextPage: false } }), get: vi.fn() };
  type Args = ConstructorParameters<typeof EvidenceSearchService>;
  const service = new EvidenceSearchService({ client, db }, career as unknown as Args[1], documents as unknown as Args[2], jobs as unknown as Args[3], consent as unknown as Args[4]);
  return { client, db, service, userId, other, recordId };
}
describe.skipIf(!uri)("검색 색인 MongoDB 저장", () => {
  it("중복 동기화와 사용자별 색인을 분리한다", async () => fixture(async f => {
    await f.service.sync(f.userId); await f.service.sync(f.userId);
    expect(await f.db.collection("career_evidence_index").countDocuments({ userId: f.userId })).toBe(1);
    expect((await f.service.search(f.other, { query: "404", mode: "keyword", limit: 8 })).hits).toHaveLength(0);
  }));
  it("본문 버전 변경 후 최신 인용만 반환한다", async () => fixture(async f => {
    await f.service.sync(f.userId);
    await f.db.collection("career_records").updateOne({ _id: f.recordId } as never, { $set: { bodyMd: "없는 프로젝트는 410을 반환했다.", documentVersion: 2 } });
    expect((await f.service.search(f.userId, { query: "410", mode: "keyword", limit: 8 })).hits[0]?.quote).toContain("410");
    expect((await f.service.search(f.userId, { query: "404", mode: "keyword", limit: 8 })).hits).toHaveLength(0);
  }));
  it("삭제한 원문은 검색에서 빠지고 색인도 정리된다", async () => fixture(async f => {
    await f.service.sync(f.userId);
    await f.db.collection("career_records").updateOne({ _id: f.recordId } as never, { $set: { deletedAt: new Date() } });
    expect((await f.service.search(f.userId, { query: "404", mode: "keyword", limit: 8 })).hits).toHaveLength(0);
    await f.service.sync(f.userId);
    expect(await f.db.collection("career_evidence_index").countDocuments({ userId: f.userId })).toBe(0);
  }));
  it("삭제 요청 계정은 검색과 색인 쓰기를 못 한다", async () => fixture(async f => {
    await f.db.collection("users").updateOne({ _id: f.userId } as never, { $set: { deletionRequestedAt: new Date() } });
    await expect(f.service.sync(f.userId)).rejects.toMatchObject({ statusCode: 401 });
    expect(await f.db.collection("career_evidence_index").countDocuments({ userId: f.userId })).toBe(0);
  }));
  it("남의 경력을 공고 검색 문맥으로 전달하지 못 한다", async () => fixture(async f => {
    await expect(f.service.searchJobs(f.other, { query: "API", recordIds: [f.recordId], mode: "keyword", filters: {}, limit: 8 })).rejects.toMatchObject({ statusCode: 404 });
  }));
  it("사용자·원본 조회 인덱스와 만료 인덱스를 생성한다", async () => fixture(async f => {
    const indexes = await f.db.collection("career_evidence_index").indexes();
    expect(indexes.some(x => x.name === "owned_record_evidence")).toBe(true);
    expect(indexes.find(x => x.name === "search_cache_expiry")?.expireAfterSeconds).toBe(0);
  }));
});
