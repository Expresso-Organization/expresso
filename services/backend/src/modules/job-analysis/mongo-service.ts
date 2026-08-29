import { randomUUID } from "node:crypto";
import { Decimal128, type ClientSession } from "mongodb";
import { JobAnalysisExtractionSchema, JobAnalysisResultSchema, ReanalysisRequestResultSchema, RequirementCoverageSchema, type JobAnalysisExtraction } from "@expresso/contracts";
import { mongoCollections, type JobAnalysisDoc, type JobPostingRequirementDoc, type RequirementCoverageDoc } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import { addMongoOutboxEvent } from "../../platform/mongo-outbox.js";
import { requireActiveUser } from "../identity/index.js";
import { assertActiveRecordsForWrite } from "../career/index.js";
import { calculateExplainableMatch } from "../jobs/index.js";
import type { JobAnalysisApi } from "./index.js";
import { JobAnalysisNotFoundError } from "./public.js";
import { calculateRequirementCoverage } from "./coverage.js";
import { RequirementExtractorUnavailableError, type RequirementExtractor } from "./extractor.js";
import { AnalysisEvidenceError, validateExtractionSource } from "./source-span.js";

const EXTRACTOR_VERSION = 2;
const failureOf = (error: unknown) => error instanceof AnalysisEvidenceError ? { code: "INVALID_SOURCE_SPAN", retryable: false }
  : error instanceof RequirementExtractorUnavailableError ? { code: "EXTRACTOR_UNAVAILABLE", retryable: false } : { code: "EXTRACTION_FAILED", retryable: true };

export class MongoJobAnalysisService implements JobAnalysisApi {
  constructor(readonly context: MongoContext) {}

  async #requirements(userId: string, jobPostingId: string, session?: ClientSession) {
    const rows = await mongoCollections(this.context.db).jobPostingRequirements.aggregate<JobPostingRequirementDoc & { coverage: RequirementCoverageDoc }>([
      { $match: { jobPostingId, extractorVersion: EXTRACTOR_VERSION } }, { $sort: { orderNo: 1, _id: 1 } },
      { $lookup: { from: "requirement_coverages", localField: "_id", foreignField: "requirementId", pipeline: [{ $match: { userId } }], as: "coverage" } }, { $unwind: "$coverage" },
    ], session ? { session } : {}).toArray();
    return rows.map((row) => RequirementCoverageSchema.parse({ requirementId: row._id, label: row.label, kind: row.kind, axis: row.axis ?? null, sourceSpan: row.sourceSpan, coverage: row.coverage.coverage, coveredBy: row.coverage.coveredBy }));
  }

  async process(jobAnalysisId: string, extractor: RequirementExtractor) {
    let claimed: JobAnalysisDoc | undefined;
    try {
      const start = await inTransaction(this.context, async (tx) => {
        const db = mongoCollections(tx.db); const options = { session: tx.session };
        const analysis = await db.jobAnalyses.findOne({ _id: jobAnalysisId }, options);
        if (!analysis?.jobPostingId) throw new JobAnalysisNotFoundError();
        await requireActiveUser(tx, analysis.userId);
        const posting = await db.jobPostings.findOne({ _id: analysis.jobPostingId }, options);
        if (!posting) throw new JobAnalysisNotFoundError();
        if (analysis.status === "done" && analysis.resultVersion >= analysis.targetVersion) return { analysis, posting, complete: true };
        const next = await db.jobAnalyses.findOneAndUpdate({ _id: jobAnalysisId, targetVersion: analysis.targetVersion }, { $set: { status: "running", progressStage: "extracting", failureCode: null, failureRetryable: null }, $inc: { attempts: 1 } }, { ...options, returnDocument: "after" });
        if (!next) throw new JobAnalysisNotFoundError();
        return { analysis: next, posting, complete: false };
      });
      if (start.complete) return this.getResultById(jobAnalysisId);
      claimed = start.analysis;
      const userId = claimed.userId;
      const jobPostingId = start.posting._id;
      const targetVersion = claimed.targetVersion;
      const attempt = claimed.attempts;
      const stored = await mongoCollections(this.context.db).jobPostingRequirements.find({ jobPostingId, extractorVersion: EXTRACTOR_VERSION }).sort({ orderNo: 1, _id: 1 }).toArray();
      // 외부 호출은 상태를 먼저 확정한 뒤 트랜잭션 밖에서 실행합니다.
      const extraction: JobAnalysisExtraction | null = stored.length ? null : JobAnalysisExtractionSchema.parse(await extractor.extract(start.posting.descriptionRaw));
      if (extraction) {
        await this.#progress(claimed, "validating");
        validateExtractionSource(start.posting.descriptionRaw, extraction);
      }
      await this.#progress(claimed, "covering");

      await inTransaction(this.context, async (tx) => {
        await requireActiveUser(tx, userId);
        const db = mongoCollections(tx.db); const options = { session: tx.session };
        const analysis = await db.jobAnalyses.findOne({ _id: jobAnalysisId, userId, status: "running", targetVersion, attempts: attempt, resultVersion: { $lt: targetVersion } }, options);
        if (!analysis) return;
        // 공통 요구사항은 공고 문서의 쓰기 충돌로 직렬화합니다. 다른 사용자가 먼저 저장했으면 재시도 후 그 결과를 씁니다.
        const posting = await db.jobPostings.findOneAndUpdate({ _id: jobPostingId }, { $inc: { analysisVersion: 1 } }, { ...options, returnDocument: "after" });
        if (!posting) throw new JobAnalysisNotFoundError();
        let normalized = posting.requirements;
        const previous = analysis.resultVersion > 0 ? await this.#requirements(userId, jobPostingId, tx.session) : null;
        let targets = await db.jobPostingRequirements.find({ jobPostingId, extractorVersion: EXTRACTOR_VERSION }, options).sort({ orderNo: 1, _id: 1 }).toArray();
        if (!targets.length && extraction) {
          const oldIds = (await db.jobPostingRequirements.find({ jobPostingId }, options).project<{ _id: string }>({ _id: 1 }).toArray()).map((row) => row._id);
          if (oldIds.length) {
            await db.requirementCoverages.deleteMany({ requirementId: { $in: oldIds } }, options);
            await db.jobPostingRequirements.deleteMany({ jobPostingId }, options);
          }
          targets = extraction.requirements.map((requirement, orderNo) => ({ _id: randomUUID(), jobPostingId, orderNo, label: requirement.label, kind: requirement.kind, axis: requirement.axis === "other" ? null : requirement.axis, sourceSpan: requirement.sourceSpan, extractorVersion: EXTRACTOR_VERSION, extractedAt: new Date() }));
          await db.jobPostingRequirements.insertMany(targets, options);
          await db.jobPostings.updateOne({ _id: jobPostingId }, { $set: { requirements: extraction.normalized, normalizedAt: new Date() } }, options);
          normalized = extraction.normalized;
        }
        const records = await db.careerRecords.find({ userId, deletedAt: null }, options).toArray();
        await assertActiveRecordsForWrite(tx, userId, records.map((record) => record._id));
        const recordTexts = records.map((record) => ({ id: record._id, text: `${record.title}\n${record.bodyMd}\n${JSON.stringify(record.properties)}` }));
        const targetIds = targets.map((target) => target._id);
        await db.requirementCoverages.deleteMany({ userId, requirementId: { $in: targetIds } }, options);
        for (const target of targets) {
          const requirement = { label: target.label, kind: target.kind, axis: target.axis ?? "other" as const, sourceSpan: RequirementCoverageSchema.shape.sourceSpan.parse(target.sourceSpan) };
          const coverage = calculateRequirementCoverage(requirement, recordTexts);
          await db.requirementCoverages.insertOne({ _id: `${userId}:${target._id}`, userId, requirementId: target._id, ...coverage, computedAt: new Date() }, options);
        }
        // 커버리지와 일치도를 같은 기록 snapshot으로 저장합니다. 근거가 부족하면 이전 점수를 남기지 않습니다.
        const normalizedInput = JobAnalysisExtractionSchema.shape.normalized.parse(normalized);
        const match = records.length >= 3 ? calculateExplainableMatch(jobPostingId, normalizedInput, recordTexts.map((record) => record.text).join("\n"), new Date()) : null;
        if (match) await db.matchScores.updateOne({ userId, jobPostingId }, { $set: { total: Decimal128.fromString(String(match.total)), axes: match.axes, reasonText: match.reason, nextAction: match.nextAction, computedAt: new Date(match.computedAt) }, $setOnInsert: { _id: randomUUID(), userId, jobPostingId } }, { ...options, upsert: true });
        else await db.matchScores.deleteOne({ userId, jobPostingId }, options);
        await db.jobAnalyses.updateOne({ _id: jobAnalysisId, userId, status: "running", targetVersion, attempts: attempt }, { $set: { status: "done", progressStage: "done", resultVersion: targetVersion, analyzedAt: new Date(), failureCode: null, failureRetryable: null, ...(previous ? { history: { userId, previousVersion: analysis.resultVersion, requirements: previous, archivedAt: new Date() } } : {}) } }, options);
      });
      return this.getResultById(jobAnalysisId);
    } catch (error) {
      if (claimed) {
        const current = claimed; const failure = failureOf(error);
        await inTransaction(this.context, async (tx) => {
          await requireActiveUser(tx, current.userId);
          await mongoCollections(tx.db).jobAnalyses.updateOne({ _id: jobAnalysisId, userId: current.userId, status: "running", targetVersion: current.targetVersion, attempts: current.attempts, resultVersion: { $lt: current.targetVersion } }, { $set: { status: "failed", progressStage: "failed", failureCode: failure.code, failureRetryable: failure.retryable } }, { session: tx.session });
        }).catch(() => undefined);
      }
      throw error;
    }
  }

  async #progress(analysis: JobAnalysisDoc, progressStage: "validating" | "covering") {
    await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, analysis.userId);
      await mongoCollections(tx.db).jobAnalyses.updateOne({ _id: analysis._id, userId: analysis.userId, status: "running", targetVersion: analysis.targetVersion, attempts: analysis.attempts }, { $set: { progressStage } }, { session: tx.session });
    });
  }

  async getResult(userId: string, jobAnalysisId: string) {
    return inTransaction(this.context, async (tx) => {
    const analysis = await mongoCollections(tx.db).jobAnalyses.findOne({ _id: jobAnalysisId, userId }, { session: tx.session });
    if (!analysis) throw new JobAnalysisNotFoundError();
    return JobAnalysisResultSchema.parse({
      analysis: { jobAnalysisId, status: analysis.status, stage: analysis.progressStage, attempts: analysis.attempts, resultVersion: analysis.resultVersion, failure: analysis.failureCode ? { code: analysis.failureCode, retryable: analysis.failureRetryable ?? false } : null, analyzedAt: analysis.analyzedAt?.toISOString() ?? null },
      requirements: analysis.jobPostingId ? await this.#requirements(userId, analysis.jobPostingId, tx.session) : [],
      previous: analysis.history ? { version: analysis.history.previousVersion, requirements: analysis.history.requirements, archivedAt: analysis.history.archivedAt.toISOString() } : null,
    });
    });
  }
  async getResultById(jobAnalysisId: string) {
    const analysis = await mongoCollections(this.context.db).jobAnalyses.findOne({ _id: jobAnalysisId });
    if (!analysis) throw new JobAnalysisNotFoundError();
    return this.getResult(analysis.userId, jobAnalysisId);
  }

  async requestReanalysis(userId: string, jobAnalysisId: string) {
    return inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const db = mongoCollections(tx.db); const options = { session: tx.session };
      const analysis = await db.jobAnalyses.findOne({ _id: jobAnalysisId, userId }, options);
      if (!analysis) throw new JobAnalysisNotFoundError();
      if (analysis.status !== "done") throw Object.assign(new Error("only completed analysis can be reanalyzed"), { statusCode: 409 });
      const brewIds = (await db.brews.find({ userId, jobAnalysisId }, options).project<{ _id: string }>({ _id: 1 }).toArray()).map((brew) => brew._id);
      const recipeCount = await db.recipes.countDocuments({ userId, brewId: { $in: brewIds } }, options);
      const targetVersion = analysis.resultVersion + 1;
      await db.jobAnalyses.updateOne({ _id: jobAnalysisId, userId, status: "done", resultVersion: analysis.resultVersion }, { $set: { status: "queued", progressStage: "queued", targetVersion, failureCode: null, failureRetryable: null } }, options);
      await addMongoOutboxEvent(tx, { userId, topic: "job.normalize", payload: { jobAnalysisId, userId, targetVersion }, idempotencyKey: `job-reanalysis:${jobAnalysisId}:v${targetVersion}` });
      return ReanalysisRequestResultSchema.parse({ jobAnalysisId, status: "queued", targetVersion, impact: { brewCount: brewIds.length, recipeCount } });
    });
  }
}
