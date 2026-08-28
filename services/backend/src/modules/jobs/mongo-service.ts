import { randomUUID } from "node:crypto";
import { Decimal128 } from "mongodb";
import { AnalyzedJobPostingSchema, ExplainableMatchSchema, JobDemandSummarySchema, JobRequirementsSchema, SavedJobSearchSchema, SubmitJobPostingSchema, SubmittedJobPostingSchema, SaveJobSearchSchema, UpsertJobInterestSchema, type SubmitJobPosting, type SaveJobSearch, type UpsertJobInterest } from "@expresso/contracts";
import { mongoCollections, type JobAnalysisDoc, type SavedSearchDoc } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction, type MongoTransaction } from "../../platform/mongo-transaction.js";
import { addMongoOutboxEvent } from "../../platform/mongo-outbox.js";
import { requireActiveUser } from "../identity/index.js";
import { JobMarketError } from "./errors.js";
import type { JobMarketApi } from "./index.js";
import { calculateExplainableMatch } from "./match-score.js";
import { interpretSearchQuery } from "./search-parser.js";
import { postingDedupeHash, sha256 } from "./mongo-queries.js";

function queuedAnalysis(userId: string, jobPostingId: string, inputType: JobAnalysisDoc["inputType"]): JobAnalysisDoc {
  return { _id: randomUUID(), userId, jobPostingId, inputType, status: "queued", attachments: [], progressStage: "queued", attempts: 0, resultVersion: 0, targetVersion: 1 };
}
function mapSaved(row: SavedSearchDoc) { return SavedJobSearchSchema.parse({ id: row._id, name: row.name, originalQuery: row.queryText, conditions: row.filters.conditions ?? [], notify: row.notify, createdAt: row.createdAt.toISOString() }); }

export class MongoJobMarketService implements JobMarketApi {
  constructor(readonly context: MongoContext) {}
  async #write<T>(userId: string, action: (tx: MongoTransaction) => Promise<T>): Promise<T> {
    return inTransaction(this.context, async (tx) => { await requireActiveUser(tx, userId); return action(tx); });
  }

  async submitPosting(userId: string, idempotencyKey: string, inputValue: SubmitJobPosting) {
    const input = SubmitJobPostingSchema.parse(inputValue);
    const dedupeHash = postingDedupeHash(input.companyName, input.title, input.descriptionRaw);
    const companyKey = sha256(`${input.companyName.normalize("NFKC").toLocaleLowerCase("en-US")}:${input.companyDomain?.toLocaleLowerCase("en-US") ?? ""}`);
    const hash = sha256(JSON.stringify({ dedupeHash, sourceUrl: input.sourceUrl ?? null }));
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.#write(userId, async (tx) => {
          const db = mongoCollections(tx.db); const options = { session: tx.session };
          const previous = await db.jobAnalyses.findOne({ userId, inputIdempotencyKey: idempotencyKey }, options);
          if (previous && previous.inputRequestHash !== hash) throw new JobMarketError(409, "idempotency key was reused with another posting");
          const company = await db.companies.findOneAndUpdate({ dedupeKey: companyKey }, { $setOnInsert: { _id: randomUUID(), name: input.companyName, domain: input.companyDomain ?? null, dedupeKey: companyKey, brandColors: [] } }, { ...options, upsert: true, returnDocument: "after" });
          if (!company) throw new Error("company was not persisted");
          let posting = await db.jobPostings.findOne({ dedupeHash }, options);
          const deduplicated = !!posting;
          if (!posting) {
            posting = { _id: randomUUID(), companyId: company._id, source: "user_input", title: input.title, descriptionRaw: input.descriptionRaw, sourceUrl: input.sourceUrl ?? null, dedupeHash, requirements: {}, createdAt: new Date(), duties: [], preferred: [], hiringProcess: [] };
            await db.jobPostings.insertOne(posting, options);
          }
          const analysis = previous ?? { ...queuedAnalysis(userId, posting._id, input.sourceUrl ? "url" : "paste"), inputIdempotencyKey: idempotencyKey, inputRequestHash: hash };
          if (!previous) await db.jobAnalyses.insertOne(analysis, options);
          await addMongoOutboxEvent(tx, { userId, topic: "job.normalize", payload: { jobAnalysisId: analysis._id, jobPostingId: posting._id, userId }, idempotencyKey: `job-normalize:${analysis._id}` });
          return SubmittedJobPostingSchema.parse({ jobPostingId: posting._id, jobAnalysisId: analysis._id, status: "queued", deduplicated });
        });
      } catch (error) { if ((error as { code?: number })?.code !== 11000 || attempt >= 2) throw error; }
    }
  }

  async analyzePosting(userId: string, jobPostingId: string) {
    return this.#write(userId, async (tx) => {
      const db = mongoCollections(tx.db); const options = { session: tx.session };
      if (!await db.jobPostings.findOne({ _id: jobPostingId }, options)) throw new JobMarketError(404, "job posting not found");
      const existing = await db.jobAnalyses.findOne({ userId, jobPostingId }, { ...options, sort: { _id: 1 } });
      const analysis = existing ?? queuedAnalysis(userId, jobPostingId, "board");
      if (!existing) {
        await db.jobAnalyses.insertOne(analysis, options);
        await addMongoOutboxEvent(tx, { userId, topic: "job.normalize", payload: { jobAnalysisId: analysis._id, jobPostingId, userId }, idempotencyKey: `job-normalize:${analysis._id}` });
      }
      return AnalyzedJobPostingSchema.parse({ jobPostingId, jobAnalysisId: analysis._id, status: analysis.status, reused: !!existing });
    });
  }

  async interpretSearch(userId: string, query: string, resultCount: number) {
    const conditions = interpretSearchQuery(query);
    return this.#write(userId, async (tx) => {
      const searches = mongoCollections(tx.db).recentSearches; const options = { session: tx.session };
      const latest = await searches.findOne({ userId }, { ...options, sort: { createdAt: -1, _id: -1 } });
      const id = latest?.queryText === query ? latest._id : randomUUID();
      const createdAt = new Date(Math.max(Date.now(), (latest?.createdAt.getTime() ?? 0) + 1));
      await searches.updateOne({ _id: id, userId }, { $set: { queryText: query, conditions, resultCount, createdAt } }, { ...options, upsert: true });
      const overflow = await searches.find({ userId }, options).sort({ createdAt: -1, _id: -1 }).skip(20).project<{ _id: string }>({ _id: 1 }).toArray();
      if (overflow.length) await searches.deleteMany({ userId, _id: { $in: overflow.map((row) => row._id) } }, options);
      return { originalQuery: query, conditions, needsClarification: conditions.length === 0, ...(conditions.length === 0 ? { example: "서울의 3년 이상 TypeScript 백엔드 원격 채용" } : {}), recentSearchId: id };
    });
  }

  async deleteRecentSearch(userId: string, recentSearchId: string): Promise<void> {
    await this.#write(userId, async (tx) => {
      const result = await mongoCollections(tx.db).recentSearches.deleteOne({ _id: recentSearchId, userId }, { session: tx.session });
      if (!result.deletedCount) throw new JobMarketError(404, "recent search not found");
    });
  }

  async saveSearch(userId: string, inputValue: SaveJobSearch) {
    const input = SaveJobSearchSchema.parse(inputValue);
    return this.#write(userId, async (tx) => {
      const searches = mongoCollections(tx.db).savedSearches; const options = { session: tx.session };
      if (await searches.countDocuments({ userId }, options) >= 10) throw new JobMarketError(409, "saved search limit exceeded", { limit: 10 });
      const row: SavedSearchDoc = { _id: randomUUID(), userId, name: input.name, queryText: input.originalQuery, filters: { conditions: input.conditions }, notify: input.notify, createdAt: new Date(), updatedAt: new Date() };
      await searches.insertOne(row, options);
      return mapSaved(row);
    });
  }
  async listSavedSearches(userId: string) { return (await mongoCollections(this.context.db).savedSearches.find({ userId }).sort({ createdAt: 1, _id: 1 }).toArray()).map(mapSaved); }

  async upsertInterest(userId: string, jobPostingId: string, inputValue: UpsertJobInterest) {
    const input = UpsertJobInterestSchema.parse(inputValue);
    return this.#write(userId, async (tx) => {
      const db = mongoCollections(tx.db); const options = { session: tx.session };
      if (!await db.jobPostings.findOne({ _id: jobPostingId }, options)) throw new JobMarketError(404, "job posting not found");
      const interest = await db.interests.findOneAndUpdate({ userId, jobPostingId }, { $set: { stage: input.stage, deadlineAt: input.deadlineAt ? new Date(input.deadlineAt) : null, memo: input.memo, updatedAt: new Date() }, $setOnInsert: { _id: randomUUID(), userId, jobPostingId } }, { ...options, upsert: true, returnDocument: "after" });
      if (!interest) throw new Error("job interest was not persisted");
      return { id: interest._id, jobPostingId, stage: interest.stage, deadlineAt: interest.deadlineAt?.toISOString() ?? null, memo: interest.memo ?? null };
    });
  }

  async computeMatch(userId: string, jobPostingId: string, at = new Date()) {
    return this.#write(userId, async (tx) => {
      const db = mongoCollections(tx.db); const options = { session: tx.session };
      const posting = await db.jobPostings.findOne({ _id: jobPostingId }, options);
      if (!posting) throw new JobMarketError(404, "job posting not found");
      const records = await db.careerRecords.find({ userId, deletedAt: null }, options).sort({ _id: 1 }).toArray();
      if (records.length < 3) throw new JobMarketError(409, "more career records are required", { required: 3, actual: records.length });
      const match = calculateExplainableMatch(jobPostingId, JobRequirementsSchema.parse(posting.requirements), records.map((record) => `${record.title}\n${record.bodyMd}\n${JSON.stringify(record.properties)}`).join("\n"), at);
      if (!match) throw new JobMarketError(409, "job posting requirements are not extracted yet", { jobPostingId });
      await db.matchScores.updateOne({ userId, jobPostingId }, { $set: { total: Decimal128.fromString(String(match.total)), axes: match.axes, reasonText: match.reason, nextAction: match.nextAction, computedAt: at }, $setOnInsert: { _id: randomUUID(), userId, jobPostingId } }, { ...options, upsert: true });
      return ExplainableMatchSchema.parse(match);
    });
  }

  async summarizeDemand(jobPostingIds: string[]) {
    const rows = await mongoCollections(this.context.db).jobPostings.find({ _id: { $in: jobPostingIds } }).project<{ requirements: unknown }>({ requirements: 1 }).toArray();
    if (rows.length < 5) return JobDemandSummarySchema.parse({ sampleSize: rows.length, demandRatios: null });
    const counts = new Map<string, number>();
    for (const row of rows) for (const technology of new Set(JobRequirementsSchema.parse(row.requirements).technologies.map((value) => value.toLocaleLowerCase("en-US")))) counts.set(technology, (counts.get(technology) ?? 0) + 1);
    return JobDemandSummarySchema.parse({ sampleSize: rows.length, demandRatios: Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => [key, count / rows.length])) });
  }
}
