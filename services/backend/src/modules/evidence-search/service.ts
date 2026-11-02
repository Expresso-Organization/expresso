import {
  EvidenceSearchInputSchema, EvidenceSearchResultSchema, SemanticJobInputSchema,
  SemanticJobResultSchema, type EvidenceSearchInput, type SemanticJobInput,
} from "@expresso/contracts";
import { mongoCollections, type EvidenceIndexChunk, type EvidenceIndexDoc } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import type { CareerApi } from "../career/index.js";
import { assertActiveRecordsForWrite, readableCareerProperties } from "../career/index.js";
import type { CareerDocumentApi } from "../career-editor/index.js";
import type { JobBoardApi } from "../jobs/index.js";
import { ConsentError, type ConsentApi } from "../consent/index.js";
import { requireActiveUser } from "../identity/index.js";
import type { SearchEmbedding } from "./embedding.js";
import { documentChunks, splitText } from "./chunks.js";
import { fingerprint, lexical, cosine, fuse } from "./ranking.js";

const MAX_RECORDS = 2000;
const MAX_CHUNKS = 10_000;
const MAX_EMBED = 64;
export class SearchError extends Error {
  constructor(readonly statusCode: number, message: string) { super(message); }
  get publicDetails() { return { searchMessage: this.message }; }
}
type Snapshot = { id: string; title: string; status: "draft" | "organized" | "verified"; fingerprint: string; version: number; documentVersion: number | null; truncated: boolean; chunks: EvidenceIndexChunk[] };

/** 원본의 읽기 권한은 기존 경력 API, 색인은 이 모듈이 소유합니다. */
export class EvidenceSearchService {
  constructor(
    private readonly db: MongoContext,
    private readonly career: Pick<CareerApi, "getRecord" | "listCategories">,
    private readonly documents: Pick<CareerDocumentApi, "bootstrap">,
    private readonly jobs: Pick<JobBoardApi, "list" | "get">,
    private readonly consent: Pick<ConsentApi, "list">,
    private readonly embedding: SearchEmbedding | null = null,
  ) {}
  private readonly running = new Set<string>();
  private async exclusive<T>(userId: string, work: () => Promise<T>) {
    if (this.running.has(userId)) throw new SearchError(409, "검색·색인 확인이 진행 중입니다. 완료 후 다시 시도하세요.");
    this.running.add(userId);
    try { return await work(); } finally { this.running.delete(userId); }
  }
  search(userId: string, input: EvidenceSearchInput) { return this.exclusive(userId, () => this.searchNow(userId, input)); }
  searchJobs(userId: string, input: SemanticJobInput) { return this.exclusive(userId, () => this.searchJobsNow(userId, input)); }
  sync(userId: string) { return this.exclusive(userId, () => this.syncNow(userId)); }
  private get index() { return this.db.db.collection<EvidenceIndexDoc>("career_evidence_index"); }
  private async active(userId: string) { await inTransaction(this.db, tx => requireActiveUser(tx, userId)); }
  private async allowEmbedding(userId: string, career: boolean) {
    const result = await this.consent.list(userId);
    const scopes = career ? ["career_records"] : ["job_posting_analysis"];
    for (const scope of scopes) if (!result.data.consents.some(x => x.scope === scope && x.granted)) {
      throw new ConsentError(scope as "career_records" | "job_posting_analysis");
    }
  }
  private async snapshot(userId: string, id: string): Promise<Snapshot> {
    const record = await this.career.getRecord(userId, id);
    const bootstrap = await this.documents.bootstrap(userId, id);
    const categories = await this.career.listCategories(userId);
    const props = readableCareerProperties(record.properties, categories.find(x => x.id === record.categoryId)?.propertySchemaV2 ?? []);
    const chunks = documentChunks(record.title, bootstrap.document, props);
    const documentVersion = bootstrap.documentVersion;
    return { id, title: record.title, status: record.status, version: record.version, documentVersion,
      fingerprint: fingerprint([record.version, documentVersion, chunks]), truncated: chunks.length > 128, chunks: chunks.slice(0, 128) };
  }
  private async snapshots(userId: string) {
    const records = await mongoCollections(this.db.db).careerRecords.find({ userId, deletedAt: null })
      .sort({ _id: 1 }).limit(MAX_RECORDS + 1).project<{ _id: string }>({ _id: 1 }).toArray();
    const snapshots: Snapshot[] = []; let complete = records.length <= MAX_RECORDS; let count = 0;
    for (const record of records.slice(0, MAX_RECORDS)) {
      try {
        const source = await this.snapshot(userId, record._id);
        if (count + source.chunks.length > MAX_CHUNKS) { complete = false; break; }
        snapshots.push(source); count += source.chunks.length; if (source.truncated) complete = false;
      } catch (error) {
        if (error && typeof error === "object" && "statusCode" in error && error.statusCode === 404) continue;
        throw error;
      }
    }
    return { snapshots, complete };
  }
  private async cache(userId: string, source: Snapshot, vectors: boolean, budget: { left: number }) {
    const embeddingKey = vectors && this.embedding ? this.embedding.key : "keyword";
    const id = fingerprint([userId, source.id, source.fingerprint, embeddingKey]);
    const stored = await this.index.findOne({ _id: id, userId });
    let chunks = stored?.chunks ?? source.chunks;
    const pending = chunks.map((chunk, i) => ({ chunk, i })).filter(x => !x.chunk.vector).slice(0, budget.left);
    const updates: Record<string, number[]> = {};
    if (vectors && this.embedding && pending.length) {
      await this.allowEmbedding(userId, true);
      budget.left -= pending.length;
      const embeddings = await this.embedding.embed(pending.map(x => x.chunk.text));
      const next = chunks.map(chunk => ({ ...chunk }));
      pending.forEach(({ i }, index) => { next[i]!.vector = embeddings[index]!; updates[`chunks.${i}.vector`] = embeddings[index]!; });
      chunks = next;
    }
    if (stored && !Object.keys(updates).length) return chunks;
    const row: EvidenceIndexDoc = { _id: id, userId, recordId: source.id, fingerprint: source.fingerprint,
      embeddingKey, chunks: source.chunks, indexedAt: new Date(), expiresAt: new Date(Date.now() + 7 * 86400_000) };
    // 원본 쓰기 guard와 같은 문서를 잠가 삭제와 계정 정리 뒤 색인 부활을 막습니다.
    await inTransaction(this.db, async tx => {
      await requireActiveUser(tx, userId);
      await assertActiveRecordsForWrite(tx, userId, [source.id]);
      const current = await mongoCollections(tx.db).careerRecords.findOne({ _id: source.id, userId, deletedAt: null }, { session: tx.session });
      if (!current || current.version !== source.version || (current.documentVersion ?? null) !== source.documentVersion) return;
      const collection = tx.db.collection<EvidenceIndexDoc>("career_evidence_index");
      await collection.updateOne({ _id: id, userId }, { $setOnInsert: row }, { upsert: true, session: tx.session });
      if (Object.keys(updates).length) await collection.updateOne({ _id: id, userId }, { $set: updates }, { session: tx.session });
    });
    return chunks;
  }
  /** 검색할 때 전체 대상의 현재 서명을 대조합니다. 저장 이벤트 누락에도 오래된 인용은 반환하지 않습니다. */
  private async syncNow(userId: string) {
    await this.active(userId);
    const { snapshots, complete } = await this.snapshots(userId);
    await inTransaction(this.db, async tx => {
      await requireActiveUser(tx, userId);
      await tx.db.collection("career_evidence_index").deleteMany({ userId }, { session: tx.session });
    });
    for (const source of snapshots) await this.cache(userId, source, false, { left: 0 });
    const live = await mongoCollections(this.db.db).careerRecords.find({ userId, deletedAt: null }).project<{ _id: string }>({ _id: 1 }).toArray();
    await this.index.deleteMany({ userId, recordId: { $nin: live.map(x => x._id) } });
    return { indexed: snapshots.length, complete };
  }
  private async searchNow(userId: string, value: EvidenceSearchInput) {
    const input = EvidenceSearchInputSchema.parse(value);
    await this.active(userId);
    let hybrid = input.mode === "hybrid" && !!this.embedding;
    if (hybrid) await this.allowEmbedding(userId, true);
    const notices: string[] = [];
    if (input.mode === "hybrid" && !this.embedding) notices.push("임베딩 미설정: 키워드 검색 결과입니다.");
    const { snapshots, complete } = await this.snapshots(userId);
    let allComplete = complete;
    const budget = { left: MAX_EMBED };
    let queryVector: number[] | null = null;
    if (hybrid) {
      try { queryVector = (await this.embedding!.embed([input.query]))[0]!; }
      catch { hybrid = false; notices.push("임베딩 장애: 키워드 검색으로 전환했습니다."); }
    }
    const candidates: { source: Snapshot; chunk: EvidenceIndexChunk }[] = [];
    for (const source of snapshots) {
      let chunks = source.chunks;
      try { chunks = await this.cache(userId, source, hybrid, budget); }
      catch (error) {
        if (error && typeof error === "object" && "statusCode" in error && error.statusCode === 404) { allComplete = false; continue; }
        if (!hybrid) throw error;
        notices.push("일부 색인의 임베딩을 만들지 못했습니다. 해당 문단은 키워드로 검색합니다."); allComplete = false;
      }
      if (hybrid && chunks.some(x => !x.vector)) allComplete = false;
      candidates.push(...chunks.map(chunk => ({ source, chunk })));
    }
    if (!complete) notices.push("검색 한도(기록 2,000개·전체 문단 10,000개·기록당 문단 128개)에 도달했습니다. 전체 검색 결과가 아닙니다.");
    if (hybrid && !allComplete) notices.push("일부 문단은 벡터 색인 대기 중입니다. 다시 검색하면 이어서 색인합니다.");
    if (hybrid && queryVector && candidates.some(x => x.chunk.vector && x.chunk.vector.length !== queryVector!.length)) { hybrid = false; notices.push("임베딩 차원 변경: 모델 설정을 바꾸고 재색인하세요. 이번 결과는 키워드 검색입니다."); }
    if (hybrid && candidates.length && !candidates.some(x => x.chunk.vector)) { hybrid = false; notices.push("사용 가능한 경력 벡터가 없어 키워드 결과만 표시합니다."); }
    const ranked = fuse(candidates, x => lexical(input.query, x.chunk.text), hybrid && queryVector
      ? x => x.chunk.vector ? Math.max(0, cosine(queryVector!, x.chunk.vector) - 0.25) : 0 : undefined);
    const hits = []; const current = new Map<string, Snapshot | null>();
    for (const { row, score } of ranked) {
      if (hits.length >= input.limit) break;
      if (!current.has(row.source.id)) {
        try { current.set(row.source.id, await this.snapshot(userId, row.source.id)); }
        catch (error) {
          if (error && typeof error === "object" && "statusCode" in error && error.statusCode === 404) current.set(row.source.id, null);
          else throw error;
        }
      }
      if (current.get(row.source.id)?.fingerprint !== row.source.fingerprint) { allComplete = false; continue; }
      hits.push({ recordId: row.source.id, title: row.source.title, status: row.source.status, blockId: row.chunk.blockId,
        quote: row.chunk.text, source: row.chunk.source, fingerprint: row.source.fingerprint,
        recordVersion: row.source.version, documentVersion: row.source.documentVersion, score });
    }
    await this.active(userId);
    if (hybrid) await this.allowEmbedding(userId, true);
    return EvidenceSearchResultSchema.parse({ hits, meta: { mode: hybrid ? "hybrid" : "keyword", complete: allComplete, scanned: snapshots.length, notices: [...new Set(notices)] } });
  }
  private async searchJobsNow(userId: string, value: SemanticJobInput) {
    const input = SemanticJobInputSchema.parse(value);
    await this.active(userId);
    const notices = ["검색 관련도는 지원 자격 충족 여부가 아닙니다. 지역·경력 등 필수 조건은 필터에서 명시하세요."];
    const records: Snapshot[] = [];
    for (const id of [...new Set(input.recordIds)]) records.push(await this.snapshot(userId, id));
    const context = records.flatMap(x => x.chunks.filter(c => c.source === "body").map(c => c.text)).join("\n").slice(0, 12_000);
    const query = `${input.query}\n${context}`;
    let hybrid = input.mode === "hybrid" && !!this.embedding;
    if (hybrid) { await this.allowEmbedding(userId, false); if (records.length) await this.allowEmbedding(userId, true); }
    if (input.mode === "hybrid" && !this.embedding) notices.push("임베딩 미설정: 키워드 재정렬 결과입니다.");
    let queryVector: number[] | null = null;
    if (hybrid) try { queryVector = (await this.embedding!.embed([query]))[0]!; }
      catch { hybrid = false; notices.push("임베딩 장애: 키워드 재정렬로 전환했습니다."); }
    const candidates: { id: string; title: string; quote: string; text: string; hash: string; vector: number[] | null }[] = [];
    let total = 0;
    for (let page = 1; page <= 4; page++) {
      const result = await this.jobs.list(userId, { ...input.filters, deadline: input.filters.deadline ?? "open", sort: "recent", page, limit: 50 });
      total = result.summary.total;
      for (const item of result.data) {
        const detail = await this.jobs.get(userId, item.id);
        const text = `${detail.title}\n${detail.descriptionRaw}`.slice(0, 16_000);
        const quote = splitText(detail.descriptionRaw).sort((a, b) => lexical(query, b) - lexical(query, a))[0] ?? detail.title;
        const hash = fingerprint(text);
        const vector: number[] | null = null;
        candidates.push({ id: item.id, title: item.title, text, quote, hash, vector });
      }
      if (page * 50 >= total) break;
    }
    if (hybrid) {
      const index = this.db.db.collection<{ _id: string; vector: number[]; expiresAt: Date }>("job_search_index");
      const missing: typeof candidates = [];
      for (const row of candidates) {
        const key = fingerprint([row.id, row.hash, this.embedding!.key]);
        const cached = await index.findOne({ _id: key });
        if (cached) row.vector = cached.vector;
        else missing.push(row);
      }
      // 처음 보는 공고는 요청당 64개까지만 임베딩합니다. 다음 검색에서 이어서 색인합니다.
      for (let offset = 0; offset < Math.min(64, missing.length); offset += 16) {
        const batch = missing.slice(offset, Math.min(offset + 16, 64));
        await this.allowEmbedding(userId, false);
        try {
          const vectors = await this.embedding!.embed(batch.map(row => row.text));
          for (const [i, row] of batch.entries()) {
            row.vector = vectors[i]!;
            const key = fingerprint([row.id, row.hash, this.embedding!.key]);
            await index.updateOne({ _id: key }, { $setOnInsert: { _id: key, vector: row.vector, expiresAt: new Date(Date.now() + 7 * 86400_000) } }, { upsert: true });
          }
        } catch { notices.push("일부 공고는 임베딩 실패로 키워드만 사용했습니다."); break; }
      }
    }
    let complete = total <= 200 && (!hybrid || candidates.every(x => x.vector));
    if (hybrid && candidates.some(x => !x.vector)) notices.push("일부 공고의 벡터 색인이 대기 중입니다. 다시 검색하면 이어서 처리합니다.");
    if (total > 200) notices.push("필터를 통과한 최근 공고 200개 안에서 재정렬했습니다. 필터를 좁혀 주세요.");
    if (hybrid && queryVector && candidates.some(x => x.vector && x.vector.length !== queryVector!.length)) { hybrid = false; notices.push("임베딩 차원 변경: 이번 결과는 키워드 검색입니다."); }
    if (hybrid && candidates.length && !candidates.some(x => x.vector)) { hybrid = false; notices.push("사용 가능한 공고 벡터가 없어 키워드 결과만 표시합니다."); }
    const ranked = fuse(candidates, x => lexical(query, x.text), hybrid && queryVector
      ? x => x.vector ? Math.max(0, cosine(queryVector!, x.vector) - 0.25) : 0 : undefined);
    const stillAllowed = new Set<string>();
    for (let page = 1; page <= 4; page++) {
      const result = await this.jobs.list(userId, { ...input.filters, deadline: input.filters.deadline ?? "open", sort: "recent", page, limit: 50 });
      result.data.forEach(item => stillAllowed.add(item.id));
      if (!result.page.hasNextPage) break;
    }
    const hits = [];
    for (const { row, score } of ranked) {
      if (hits.length >= input.limit) break;
      if (!stillAllowed.has(row.id)) { complete = false; continue; }
      try {
        const detail = await this.jobs.get(userId, row.id);
        if (fingerprint(`${detail.title}\n${detail.descriptionRaw}`.slice(0, 16_000)) !== row.hash) continue;
        if (detail.expiresAt && new Date(detail.expiresAt).getTime() < Date.now()) continue;
        hits.push({ jobId: row.id, title: row.title, quote: row.quote, score, fingerprint: row.hash,
          reasons: [hybrid && row.vector ? "요청·선택 경력과 공고의 의미 관련도로 재정렬했습니다." : "요청·선택 경력의 단어와 공고 원문을 비교했습니다."] });
      } catch (error) { if (error && typeof error === "object" && "statusCode" in error && error.statusCode === 404) continue; throw error; }
    }
    for (const record of records) if ((await this.snapshot(userId, record.id)).fingerprint !== record.fingerprint) throw new SearchError(409, "경력이 변경됐습니다. 다시 검색하세요.");
    await this.active(userId);
    if (hybrid) { await this.allowEmbedding(userId, false); if (records.length) await this.allowEmbedding(userId, true); }
    return SemanticJobResultSchema.parse({ hits, meta: { mode: hybrid ? "hybrid" : "keyword", complete, scanned: candidates.length, notices } });
  }
}
