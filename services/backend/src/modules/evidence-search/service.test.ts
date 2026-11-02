import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { EvidenceSearchService } from "./service.js";
import type { SearchEmbedding } from "./embedding.js";
vi.mock("../../platform/mongo-transaction.js", () => ({ inTransaction: async (db: unknown, fn: (tx: unknown) => unknown) => fn({ ...(db as object), session: {} }) }));
vi.mock("../identity/index.js", () => ({ requireActiveUser: vi.fn(async () => {}) }));
vi.mock("../career/index.js", () => ({ readableCareerProperties: () => ({}), assertActiveRecordsForWrite: vi.fn(async () => {}) }));
function fixture(embedding: SearchEmbedding | null = null) {
 const user = randomUUID(); const other = randomUUID();
 const rows = [{ _id: randomUUID(), userId: user, title: "내 기록", version: 1, documentVersion: 1, deletedAt: null as Date | null, text: "팀원이 설계했고 나는 Node.js 조회 API와 404 처리를 구현했다." }, { _id: randomUUID(), userId: other, title: "다른 사용자", version: 1, documentVersion: 1, deletedAt: null as Date | null, text: "비공개 404" }];
 const cache = new Map<string, Record<string, unknown>>();
 const records = { find: (filter: { userId: string }) => { const result = { sort: () => result, limit: () => result, project: () => result, toArray: async () => rows.filter(x => x.userId === filter.userId && !x.deletedAt) }; return result; }, findOne: async (filter: { _id: string; userId: string }) => rows.find(x => x._id === filter._id && x.userId === filter.userId && !x.deletedAt) };
 const index = { findOne: async (filter: { _id: string; userId: string }) => { const row = cache.get(filter._id); return row?.userId === filter.userId ? structuredClone(row) : null; }, updateOne: async (filter: { _id: string }, update: { $setOnInsert?: Record<string, unknown>; $set?: Record<string, unknown> }) => { if (!cache.has(filter._id) && update.$setOnInsert) cache.set(filter._id, structuredClone(update.$setOnInsert)); const row = cache.get(filter._id)!; for (const [key, value] of Object.entries(update.$set ?? {})) { const parts = key.split("."); if (parts[0] === "chunks") (row.chunks as { vector: unknown }[])[Number(parts[1])]!.vector = value; else row[key] = value; } }, deleteMany: async () => { for (const [id, entry] of cache) if (!rows.some(x => x._id === entry.recordId && !x.deletedAt)) cache.delete(id); } };
 const db = { db: { collection: (name: string) => name === "career_records" ? records : index } };
 const career = { listCategories: async () => [], getRecord: async (owner: string, id: string) => { const record = rows.find(x => x._id === id && x.userId === owner && !x.deletedAt); if (!record) throw Object.assign(new Error("not found"), { statusCode: 404 }); return { ...record, id, status: "draft", properties: {}, categoryId: "category" }; } };
 const documents = { bootstrap: async (_owner: string, id: string) => { const row = rows.find(x => x._id === id)!; return { documentVersion: row.documentVersion, document: { schemaVersion: 1, type: "doc", content: [{ id: "a5100000-0000-4000-8000-000000000001", type: "paragraph", attrs: {}, text: [{ text: row.text }] }] } }; } };
 const consent = { list: vi.fn(async () => ({ data: { consents: [{ scope: "career_records", granted: true }, { scope: "job_posting_analysis", granted: true }] } })) };
 const jobId = randomUUID();
 const jobs = { list: vi.fn(async () => ({ data: [{ id: jobId, title: "백엔드" }], summary: { total: 1 }, page: { hasNextPage: false } })), get: vi.fn(async () => ({ id: jobId, title: "백엔드", descriptionRaw: "Node.js API 개발", expiresAt: null })) };
 type Args = ConstructorParameters<typeof EvidenceSearchService>;
 const service = new EvidenceSearchService(db as unknown as Args[0], career as unknown as Args[1], documents as unknown as Args[2], jobs as unknown as Args[3], consent as unknown as Args[4], embedding);
 return { service, user, other, rows, cache, consent, jobs };
}
it("다른 사용자의 기록을 반환하지 않는다", async () => { const f = fixture(); const r = await f.service.search(f.user, { query: "404", mode: "keyword", limit: 8 }); expect(r.hits).toHaveLength(1); expect(r.hits[0]?.recordId).toBe(f.rows[0]!._id); });
it("수정한 문서의 최신 인용으로 색인을 갱신한다", async () => { const f = fixture(); await f.service.search(f.user, { query: "404", mode: "keyword", limit: 8 }); f.rows[0]!.text = "조회 오류는 410으로 처리했다."; f.rows[0]!.documentVersion++; const r = await f.service.search(f.user, { query: "410", mode: "keyword", limit: 8 }); expect(r.hits[0]?.quote).toContain("410"); expect((await f.service.search(f.user, { query: "404", mode: "keyword", limit: 8 })).hits).toHaveLength(0); });
it("삭제된 원문은 검색에서 제외하고 동기화 시 색인을 정리한다", async () => { const f = fixture(); await f.service.search(f.user, { query: "404", mode: "keyword", limit: 8 }); f.rows[0]!.deletedAt = new Date(); expect((await f.service.search(f.user, { query: "404", mode: "keyword", limit: 8 })).hits).toHaveLength(0); await f.service.sync(f.user); expect(f.cache.size).toBe(0); });
it("임베딩 서버 장애 시 키워드 전환을 알린다", async () => { const f = fixture({ key: "broken", embed: async () => { throw new Error("offline"); } }); const r = await f.service.search(f.user, { query: "404", mode: "hybrid", limit: 8 }); expect(r.meta.mode).toBe("keyword"); expect(r.meta.notices.join()).toContain("장애"); });
it("키워드가 달라도 실제 벡터로 검색할 수 있다", async () => { const embed = vi.fn(async (texts: string[]) => texts.map(() => [1, 0])); const f = fixture({ key: "test", embed }); const r = await f.service.search(f.user, { query: "예외 대응", mode: "hybrid", limit: 8 }); expect(r.hits.length).toBeGreaterThan(0); expect(r.meta.mode).toBe("hybrid"); });
it("동의 없이는 임베딩 서버를 호출하지 않는다", async () => { const embed = vi.fn(async (texts: string[]) => texts.map(() => [1, 0])); const f = fixture({ key: "test", embed }); f.consent.list.mockResolvedValue({ data: { consents: [] } }); await expect(f.service.search(f.user, { query: "404", mode: "hybrid", limit: 8 })).rejects.toMatchObject({ statusCode: 403 }); expect(embed).not.toHaveBeenCalled(); });
it("공고 검색은 기존 지역·연차 필터를 유지한다", async () => { const f = fixture(); await f.service.searchJobs(f.user, { query: "API", mode: "keyword", recordIds: [], limit: 8, filters: { location: "서울", experience: 0 } }); expect(f.jobs.list).toHaveBeenCalledWith(f.user, expect.objectContaining({ location: "서울", experience: 0, deadline: "open" })); });
it("남의 경력을 공고 검색에 전달하지 않는다", async () => { const f = fixture(); await expect(f.service.searchJobs(f.user, { query: "API", mode: "keyword", recordIds: [f.rows[1]!._id], limit: 8, filters: {} })).rejects.toMatchObject({ statusCode: 404 }); expect(f.jobs.list).not.toHaveBeenCalled(); });
it("동일 원본의 벡터를 재사용하고 검색어만 새로 임베딩한다", async () => {
 const embed = vi.fn(async (texts: string[]) => texts.map(() => [1, 0])); const f = fixture({ key: "cached", embed });
 await f.service.search(f.user, { query: "예외", mode: "hybrid", limit: 8 });
 await f.service.search(f.user, { query: "검증", mode: "hybrid", limit: 8 });
 expect(embed).toHaveBeenCalledTimes(3);
});
it("임베딩 미설정은 의미 검색 성공으로 표시하지 않는다", async () => {
 const f = fixture(); const result = await f.service.search(f.user, { query: "404", mode: "hybrid", limit: 8 });
 expect(result.meta.mode).toBe("keyword"); expect(result.meta.notices.join()).toContain("미설정");
});
