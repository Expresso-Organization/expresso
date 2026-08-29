import { randomUUID } from "node:crypto";
import { BrewMaterialsSchema, BrewStateSchema, CreateBrewSchema, CreateFreeBrewSchema, UpdateBrewSchema, UpdateBrewMaterialsSchema, type CreateBrew, type CreateFreeBrew, type UpdateBrew } from "@expresso/contracts";
import { mongoCollections, type BrewDoc, type BrewSourceDoc, type CareerRecordDoc, type CareerCategoryDoc } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction, type MongoTransaction } from "../../platform/mongo-transaction.js";
import { requireActiveUser } from "../identity/index.js";
import { assertActiveRecordsForWrite } from "../career/index.js";
import { MongoEntitlementService } from "../entitlements/index.js";
import type { MaterialsApi } from "./index.js";
import { MaterialsError } from "./public.js";
import { rankMaterials } from "./ranking.js";

export class MongoMaterialsService implements MaterialsApi {
  constructor(readonly context: MongoContext) {}

  async #create(tx: MongoTransaction, userId: string, input: { jobAnalysisId: string; lengthPreset: BrewDoc["lengthPreset"]; freeTitle?: string; freeBrief?: string }, labels: string[]) {
    const db = mongoCollections(tx.db); const options = { session: tx.session };
    const records = await db.careerRecords.find({ userId, deletedAt: null, status: { $in: ["organized", "verified"] } }, options).toArray();
    const ranked = rankMaterials(records.flatMap((record) => record.status === "organized" || record.status === "verified" ? [{ id: record._id, title: record.title, status: record.status, text: `${record.title}\n${record.bodyMd}\n${JSON.stringify(record.properties)}` }] : []), labels).slice(0, 50);
    await assertActiveRecordsForWrite(tx, userId, ranked.map((record) => record.id));
    const brew: BrewDoc = { _id: randomUUID(), userId, ...input, mode: "solo", status: "draft", createdAt: new Date(), updatedAt: new Date() };
    await db.brews.insertOne(brew, options);
    if (ranked.length) await db.brewSources.insertMany(ranked.map((record, rank) => ({ _id: randomUUID(), userId, brewId: brew._id, recordId: record.id, rank, selectedBy: "auto" as const, excludedReason: rank < 10 ? null : "AUTO_LIMIT", score: record.score, reasonText: record.reason, isSelected: rank < 10, updatedAt: new Date() })), options);
    return brew._id;
  }

  async createBrew(userId: string, inputValue: CreateBrew) {
    const input = CreateBrewSchema.parse(inputValue);
    const brewId = await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const db = mongoCollections(tx.db); const options = { session: tx.session };
      const analysis = await db.jobAnalyses.findOne({ _id: input.jobAnalysisId, userId }, options);
      if (!analysis) throw new MaterialsError(404, "job analysis not found");
      if (analysis.status !== "done") throw new MaterialsError(409, "job analysis must be complete before selecting materials");
      const requirements = analysis.jobPostingId ? await db.jobPostingRequirements.find({ jobPostingId: analysis.jobPostingId }, options).sort({ orderNo: 1, _id: 1 }).toArray() : [];
      return this.#create(tx, userId, input, requirements.map((requirement) => requirement.label));
    });
    return this.getMaterials(userId, brewId);
  }

  async createFreeBrew(userId: string, inputValue: CreateFreeBrew) {
    const input = CreateFreeBrewSchema.parse(inputValue);
    const brewId = await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const analysisId = randomUUID();
      await mongoCollections(tx.db).jobAnalyses.insertOne({ _id: analysisId, userId, jobPostingId: null, inputType: "free", status: "done", progressStage: "done", analyzedAt: new Date(), resultVersion: 1, targetVersion: 1, attempts: 0, attachments: [] }, { session: tx.session });
      return this.#create(tx, userId, { jobAnalysisId: analysisId, freeTitle: input.title, freeBrief: input.brief, lengthPreset: input.lengthPreset }, [input.brief]);
    });
    return this.getMaterials(userId, brewId);
  }

  async getMaterials(userId: string, brewId: string) {
    const db = mongoCollections(this.context.db);
    const brew = await db.brews.findOne({ _id: brewId, userId });
    if (!brew) throw new MaterialsError(404, "brew not found");
    const rows = await db.brewSources.aggregate<BrewSourceDoc & { record: CareerRecordDoc; category: CareerCategoryDoc }>([
      { $match: { userId, brewId } }, { $sort: { rank: 1, recordId: 1 } },
      { $lookup: { from: "career_records", localField: "recordId", foreignField: "_id", pipeline: [{ $match: { userId } }], as: "record" } }, { $unwind: "$record" },
      { $lookup: { from: "career_categories", localField: "record.categoryId", foreignField: "_id", pipeline: [{ $match: { $or: [{ userId: null }, { userId }] } }], as: "category" } }, { $unwind: "$category" },
    ]).toArray();
    return BrewMaterialsSchema.parse({ brewId, jobAnalysisId: brew.jobAnalysisId, updatedAt: brew.updatedAt.toISOString(), selectionLimit: 10, mode: brew.mode, lengthPreset: brew.lengthPreset,
      materials: rows.map((row) => ({ recordId: row.recordId, title: row.record.title, status: row.record.status, score: row.score, rank: row.rank, selected: row.isSelected, selectedBy: row.selectedBy, excludedReason: row.excludedReason ?? null, categoryName: row.category.name, categoryIcon: row.category.icon, periodFrom: row.record.periodStart ?? null, periodTo: row.record.periodEnd ?? null, origin: row.record.origin, reason: row.reasonText })),
    });
  }

  async updateBrew(userId: string, brewId: string, inputValue: UpdateBrew) {
    const input = UpdateBrewSchema.parse(inputValue);
    await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      if (input.mode === "collab" && !(await new MongoEntitlementService(tx).check(userId, "brew.cowork")).allowed) throw new MaterialsError(403, "cowork mode requires an upgraded plan");
      const result = await mongoCollections(tx.db).brews.updateOne({ _id: brewId, userId }, { $set: { mode: input.mode, updatedAt: new Date() }, $inc: { referenceVersion: 1 } }, { session: tx.session });
      if (!result.matchedCount) throw new MaterialsError(404, "brew not found");
    });
    return this.getMaterials(userId, brewId);
  }

  async updateSelection(userId: string, brewId: string, recordIds: string[]) {
    const input = UpdateBrewMaterialsSchema.parse({ recordIds });
    await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const db = mongoCollections(tx.db); const options = { session: tx.session };
      const brew = await db.brews.updateOne({ _id: brewId, userId }, { $inc: { referenceVersion: 1 }, $set: { updatedAt: new Date() } }, options);
      if (!brew.matchedCount) throw new MaterialsError(404, "brew not found");
      if (await db.brewSources.countDocuments({ userId, brewId, recordId: { $in: input.recordIds } }, options) !== input.recordIds.length) throw new MaterialsError(409, "selection contains an ineligible record");
      await assertActiveRecordsForWrite(tx, userId, input.recordIds);
      // rank는 매칭 순위라는 기존 계약을 유지하고, 선택 여부만 갱신합니다.
      await db.brewSources.updateMany({ userId, brewId }, { $set: { isSelected: false, selectedBy: "user", excludedReason: "USER_DESELECTED", updatedAt: new Date() } }, options);
      if (input.recordIds.length) await db.brewSources.updateMany({ userId, brewId, recordId: { $in: input.recordIds } }, { $set: { isSelected: true, selectedBy: "user", excludedReason: null, updatedAt: new Date() } }, options);
    });
    return this.getMaterials(userId, brewId);
  }

  async getState(userId: string, brewId: string) {
    const db = mongoCollections(this.context.db);
    const brew = await db.brews.findOne({ _id: brewId, userId });
    if (!brew) throw new MaterialsError(404, "brew not found");
    const [analysis, sources, session, recipe, portfolio, job, generation] = await Promise.all([
      db.jobAnalyses.findOne({ _id: brew.jobAnalysisId, userId }), db.brewSources.find({ userId, brewId }).toArray(),
      db.interviewSessions.findOne({ userId, brewId }), db.recipes.findOne({ userId, brewId }, { sort: { version: -1, _id: -1 } }),
      db.portfolios.findOne({ userId, brewId }, { sort: { createdAt: -1, _id: -1 } }),
      db.brewJobs.findOne({ userId, "input.brewId": brewId }, { sort: { createdAt: -1, _id: -1 } }),
      db.generationJobs.findOne({ userId, brewId }, { sort: { createdAt: -1, _id: -1 } }),
    ]);
    const posting = analysis?.jobPostingId ? await db.jobPostings.findOne({ _id: analysis.jobPostingId }) : null;
    const company = posting ? await db.companies.findOne({ _id: posting.companyId }) : null;
    return BrewStateSchema.parse({ brewId, jobAnalysisId: brew.jobAnalysisId, status: brew.status, lengthPreset: brew.lengthPreset, freeTitle: brew.freeTitle ?? null, freeBrief: brew.freeBrief ?? null, posting: posting && company ? { title: posting.title, companyName: company.name } : null,
      materials: { selected: sources.filter((source) => source.isSelected).length, total: sources.length }, interviewSessionId: session?._id ?? null, recipeId: recipe?._id ?? null, portfolioId: portfolio?._id ?? null,
      latestJob: job ? { jobId: job._id, type: job.type, status: job.status, stage: job.stage, attempts: job.attempts, resultId: job.resultId ?? null, failure: job.errorCode ? { code: job.errorCode, retryable: job.failureRetryable ?? false } : null } : null,
      latestGeneration: generation ? { id: generation._id, status: generation.status, stage: generation.stage, portfolioId: generation.portfolioId ?? null, failureCode: generation.errorCode ?? null } : null, updatedAt: brew.updatedAt.toISOString(),
    });
  }
}
