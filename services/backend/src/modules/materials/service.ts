import { randomUUID } from "node:crypto";
import { BrewMaterialsSchema, BrewStateSchema, CreateBrewSchema, CreateFreeBrewSchema, UpdateBrewSchema, UpdateBrewMaterialsSchema, type CreateBrew, type CreateFreeBrew, type UpdateBrew } from "@expresso/contracts";
import { mongoCollections, type BrewDoc, type BrewSourceDoc, type CareerRecordDoc, type CareerCategoryDoc } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction, type MongoTransaction } from "../../platform/mongo-transaction.js";
import { brewJobStatus } from "../brew-jobs/index.js";
import { requireActiveUser } from "../identity/index.js";
import { assertActiveRecordsForWrite, careerRecordTextReader, recordPeriod } from "../career/index.js";
import { MongoEntitlementService } from "../entitlements/index.js";
import type { MaterialsApi } from "./index.js";
import { MaterialsError } from "./public.js";
import { rankMaterials } from "./ranking.js";

/** 한 번에 담을 수 있는 재료 수와 후보 상한 — `BrewMaterialsSchema`의 `selectionLimit` · `materials.max(50)`과 같다. */
const SELECTION_LIMIT = 10;
const MATERIAL_LIMIT = 50;

/** 후보를 줄 세울 요건 라벨. 공고면 요건 목록, 자유 제작이면 사용자가 적은 설명. */
async function requirementLabels(tx: MongoTransaction, jobPostingId: string | null, freeBrief: string | null) {
  if (!jobPostingId) return freeBrief ? [freeBrief] : [];
  const requirements = await mongoCollections(tx.db).jobPostingRequirements.find({ jobPostingId }, { session: tx.session }).sort({ orderNo: 1, _id: 1 }).toArray();
  return requirements.map((requirement) => requirement.label);
}

export class MaterialsService implements MaterialsApi {
  constructor(readonly context: MongoContext) {}

  async #create(tx: MongoTransaction, userId: string, input: { jobAnalysisId: string; lengthPreset: BrewDoc["lengthPreset"]; freeTitle?: string; freeBrief?: string }, labels: string[]) {
    const db = mongoCollections(tx.db); const options = { session: tx.session };
    const records = await db.careerRecords.find({ userId, deletedAt: null, status: { $in: ["organized", "verified"] } }, options).toArray();
    const recordText = await careerRecordTextReader(tx.db, userId, tx.session);
    const ranked = rankMaterials(records.flatMap((record) => record.status === "organized" || record.status === "verified" ? [{ id: record._id, title: record.title, status: record.status, text: recordText(record) }] : []), labels).slice(0, MATERIAL_LIMIT);
    await assertActiveRecordsForWrite(tx, userId, ranked.map((record) => record.id));
    const brew: BrewDoc = { _id: randomUUID(), userId, ...input, mode: "solo", status: "draft", createdAt: new Date(), updatedAt: new Date() };
    await db.brews.insertOne(brew, options);
    if (ranked.length) await db.brewSources.insertMany(ranked.map((record, rank) => ({ _id: randomUUID(), userId, brewId: brew._id, recordId: record.id, rank, selectedBy: "auto" as const, excludedReason: rank < SELECTION_LIMIT ? null : "AUTO_LIMIT", score: record.score, reasonText: record.reason, isSelected: rank < SELECTION_LIMIT, updatedAt: new Date() })), options);
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
      return this.#create(tx, userId, input, await requirementLabels(tx, analysis.jobPostingId ?? null, null));
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

  /**
   * AI 대화를 시작하기 전의 제작이면, 제작을 연 뒤에 정리됨 · 검증됨이 된 기록을 후보 끝에 붙인다.
   *
   * 후보는 제작을 열 때 한 번 줄 세운다. 그 뒤에 초안을 정리하고 돌아오면 그 기록이 보이지 않았다
   * (Discord #issue 11-11). 대화를 시작한 뒤에는 재료가 질문의 근거라 그대로 둔다.
   */
  async #syncSources(userId: string, brew: BrewDoc) {
    if (brew.status !== "draft") return;
    await inTransaction(this.context, async (tx) => {
      const db = mongoCollections(tx.db); const options = { session: tx.session };
      const existing = await db.brewSources.find({ userId, brewId: brew._id }, options).toArray();
      if (existing.length >= MATERIAL_LIMIT) return;
      const known = new Set(existing.map((row) => row.recordId));
      const records = (await db.careerRecords.find({ userId, deletedAt: null, status: { $in: ["organized", "verified"] } }, options).toArray())
        .filter((record) => !known.has(record._id));
      if (!records.length) return;
      const analysis = await db.jobAnalyses.findOne({ _id: brew.jobAnalysisId, userId }, options);
      const labels = await requirementLabels(tx, analysis?.jobPostingId ?? null, brew.freeBrief ?? null);
      const recordText = await careerRecordTextReader(tx.db, userId, tx.session);
      const ranked = rankMaterials(records.flatMap((record) => record.status === "organized" || record.status === "verified" ? [{ id: record._id, title: record.title, status: record.status, text: recordText(record) }] : []), labels)
        .slice(0, MATERIAL_LIMIT - existing.length);
      let selected = existing.filter((row) => row.isSelected).length;
      let rank = existing.reduce((max, row) => Math.max(max, row.rank + 1), 0);
      let inserted = 0;
      for (const record of ranked) {
        const isSelected = selected < SELECTION_LIMIT;
        const result = await db.brewSources.updateOne(
          { userId, brewId: brew._id, recordId: record.id },
          { $setOnInsert: { _id: randomUUID(), userId, brewId: brew._id, recordId: record.id, rank, selectedBy: "auto", excludedReason: isSelected ? null : "AUTO_LIMIT", score: record.score, reasonText: record.reason, isSelected, updatedAt: new Date() } },
          { ...options, upsert: true },
        );
        if (!result.upsertedCount) continue;
        inserted += 1; rank += 1; if (isSelected) selected += 1;
      }
      if (inserted) await db.brews.updateOne({ _id: brew._id, userId }, { $inc: { referenceVersion: 1 }, $set: { updatedAt: new Date() } }, options);
    });
  }

  async getMaterials(userId: string, brewId: string) {
    const db = mongoCollections(this.context.db);
    const found = await db.brews.findOne({ _id: brewId, userId, deletedAt: null });
    if (!found) throw new MaterialsError(404, "brew not found");
    await this.#syncSources(userId, found);
    const brew = (await db.brews.findOne({ _id: brewId, userId, deletedAt: null })) ?? found;
    const [rows, draftCount] = await Promise.all([db.brewSources.aggregate<BrewSourceDoc & { record: CareerRecordDoc; category: CareerCategoryDoc }>([
      { $match: { userId, brewId } }, { $sort: { rank: 1, recordId: 1 } },
      // 지웠거나 초안으로 되돌린 기록은 후보가 아니다 — 남겨 두면 계약(status enum)에서 화면이 멈춘다.
      { $lookup: { from: "career_records", localField: "recordId", foreignField: "_id", pipeline: [{ $match: { userId, deletedAt: null, status: { $in: ["organized", "verified"] } } }], as: "record" } }, { $unwind: "$record" },
      { $lookup: { from: "career_categories", localField: "record.categoryId", foreignField: "_id", pipeline: [{ $match: { userId } }], as: "category" } }, { $unwind: "$category" },
    ]).toArray(), db.careerRecords.countDocuments({ userId, deletedAt: null, status: "draft" })]);
    return BrewMaterialsSchema.parse({ brewId, jobAnalysisId: brew.jobAnalysisId, updatedAt: brew.updatedAt.toISOString(), selectionLimit: SELECTION_LIMIT, mode: brew.mode, lengthPreset: brew.lengthPreset, draftCount,
      materials: rows.map((row) => ({ recordId: row.recordId, title: row.record.title, status: row.record.status, score: row.score, rank: row.rank, selected: row.isSelected, selectedBy: row.selectedBy, excludedReason: row.excludedReason ?? null, categoryName: row.category.name, categoryKey: row.category.key, categoryIcon: row.category.icon, periodFrom: recordPeriod(row.record)?.start ?? null, periodTo: recordPeriod(row.record)?.end ?? null, origin: row.record.origin, reason: row.reasonText })),
    });
  }

  async updateBrew(userId: string, brewId: string, inputValue: UpdateBrew) {
    const input = UpdateBrewSchema.parse(inputValue);
    await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      if (input.mode === "collab" && !(await new MongoEntitlementService(tx).check(userId, "brew.cowork")).allowed) throw new MaterialsError(403, "cowork mode requires an upgraded plan");
      // 보낸 칸만 바꾼다 — 이름만 고쳤는데 모드가 기본값으로 되돌아가면 안 된다.
      const result = await mongoCollections(tx.db).brews.updateOne({ _id: brewId, userId, deletedAt: null }, { $set: { ...(input.mode !== undefined ? { mode: input.mode } : {}), ...(input.title !== undefined ? { title: input.title } : {}), updatedAt: new Date() }, $inc: { referenceVersion: 1 } }, { session: tx.session });
      if (!result.matchedCount) throw new MaterialsError(404, "brew not found");
    });
    return this.getMaterials(userId, brewId);
  }

  async updateSelection(userId: string, brewId: string, recordIds: string[]) {
    const input = UpdateBrewMaterialsSchema.parse({ recordIds });
    await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const db = mongoCollections(tx.db); const options = { session: tx.session };
      const brew = await db.brews.updateOne({ _id: brewId, userId, deletedAt: null }, { $inc: { referenceVersion: 1 }, $set: { updatedAt: new Date() } }, options);
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
    const brew = await db.brews.findOne({ _id: brewId, userId, deletedAt: null });
    if (!brew) throw new MaterialsError(404, "brew not found");
    const [analysis, sources, session, recipe, portfolio, job, generation] = await Promise.all([
      db.jobAnalyses.findOne({ _id: brew.jobAnalysisId, userId }), db.brewSources.find({ userId, brewId }).toArray(),
      db.interviewSessions.findOne({ userId, brewId }), db.recipes.findOne({ userId, brewId }, { sort: { version: -1, _id: -1 } }),
      db.portfolios.findOne({ userId, brewId, deletedAt: null }, { sort: { createdAt: -1, _id: -1 } }),
      db.brewJobs.findOne({ userId, "input.brewId": brewId }, { sort: { createdAt: -1, _id: -1 } }),
      db.generationJobs.findOne({ userId, brewId }, { sort: { createdAt: -1, _id: -1 } }),
    ]);
    const posting = analysis?.jobPostingId ? await db.jobPostings.findOne({ _id: analysis.jobPostingId }) : null;
    const company = posting ? await db.companies.findOne({ _id: posting.companyId }) : null;
    return BrewStateSchema.parse({ brewId, jobAnalysisId: brew.jobAnalysisId, status: brew.status, lengthPreset: brew.lengthPreset, title: brew.title ?? null, freeTitle: brew.freeTitle ?? null, freeBrief: brew.freeBrief ?? null, posting: posting && company ? { title: posting.title, companyName: company.name } : null,
      materials: { selected: sources.filter((source) => source.isSelected).length, total: sources.length }, interviewSessionId: session?._id ?? null, recipeId: recipe?._id ?? null, portfolioId: portfolio?._id ?? null,
      latestJob: job ? brewJobStatus(job) : null,
      designSelection: brew.designSystemRevisionId && brew.referenceLockSnapshot && brew.designSelectedAt
        ? { designSystemRevisionId: brew.designSystemRevisionId, referenceLock: brew.referenceLockSnapshot, styleOverrides: brew.designStyleOverrides ?? {}, selectedAt: new Date(brew.designSelectedAt).toISOString() }
        : null,
      latestGeneration: generation ? { id: generation._id, status: generation.status, stage: generation.stage, portfolioId: generation.portfolioId ?? null, failureCode: generation.errorCode ?? null, createdAt: generation.createdAt.toISOString() } : null, updatedAt: brew.updatedAt.toISOString(),
    });
  }
}

export { MaterialsService as MongoMaterialsService };
