import { createHash, randomUUID } from "node:crypto";

import {
  GenerationJobStatusSchema,
  type GeneratedPage,
  type GenerationOutput,
  type SubmitGeneration,
} from "@expresso/contracts";
import {
  mongoCollections,
  type GenerationJobDoc,
  type JsonObject,
} from "@expresso/database";

import type { MongoContext } from "../../platform/mongodb.js";
import { addMongoOutboxEvent } from "../../platform/mongo-outbox.js";
import { inTransaction, type MongoTransaction } from "../../platform/mongo-transaction.js";
import { withTimeout } from "../../platform/timeouts.js";
import { writeSnapshot } from "../../platform/snapshot-payload.js";
import { assertActiveRecordsForWrite } from "../career/index.js";
import type { ConsentApi } from "../consent/index.js";
import { requireActiveUser } from "../identity/index.js";
import {
  LAYOUT_PROMPT_VERSION,
  toLayoutSpecs,
  type LayoutDesignContext,
  type LayoutDesigner,
} from "../layout/index.js";
import { mongoBlockContent, mongoPortfolioSnapshot } from "./mongo-completion.js";
import { chargeMongoGenerationUsage } from "./mongo-usage.js";
import {
  GenerationError,
  buildWriterContext,
  type BrewSubjectRow,
  type ContextRow,
  type PathRow,
} from "./public.js";
import { GenerationValidationError, validateGenerationOutput } from "./validator.js";
import { SentenceWriterUnavailableError, type SentenceWriter, type WriterContext } from "./writer.js";

function requestHash(input: SubmitGeneration): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export class MongoGenerationService {
  readonly #consent: ConsentApi | null;
  constructor(readonly context: MongoContext, consent?: ConsentApi | null) {
    this.#consent = consent ?? null;
  }

  async submit(userId: string, idempotencyKey: string, input: SubmitGeneration) {
    const hash = requestHash(input);
    const jobId = await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const db = mongoCollections(tx.db); const options = { session: tx.session };
      const recipe = await db.recipes.findOne({ _id: input.recipeId, userId }, options);
      if (!recipe) throw new GenerationError(404, "recipe not found");
      if (!await db.templates.findOne({ _id: input.templateId, isActive: true }, options)) {
        throw new GenerationError(404, "template not found");
      }
      const existing = await db.generationJobs.findOne({ userId, inputIdempotencyKey: idempotencyKey }, options);
      if (existing) {
        if (existing.requestHash !== hash) throw new GenerationError(409, "idempotency key reused for another generation");
        return existing._id;
      }
      const now = new Date(); const id = randomUUID();
      await db.generationJobs.insertOne({
        _id: id, userId, brewId: recipe.brewId, recipeId: recipe._id, templateId: input.templateId,
        status: "queued", usageCharged: false, stage: "queued", attempts: 0,
        inputIdempotencyKey: idempotencyKey, requestHash: hash, portfolioId: null,
        errorCode: null, failureRetryable: null, runToken: null,
        createdAt: now, updatedAt: now,
        styleOverrides: (input.styleOverrides ?? {}) as JsonObject,
      }, options);
      await addMongoOutboxEvent(tx, {
        userId, topic: "portfolio.generate", payload: { generationJobId: id, userId },
        idempotencyKey: `portfolio-generation:${id}`,
      });
      return id;
    });
    return this.getStatus(userId, jobId);
  }

  async getStatus(userId: string, jobId: string) {
    const job = await mongoCollections(this.context.db).generationJobs.findOne({ _id: jobId, userId });
    if (!job) throw new GenerationError(404, "generation job not found");
    return GenerationJobStatusSchema.parse({
      generationJobId: job._id, status: job.status, stage: job.stage, attempts: job.attempts,
      usageCharged: job.usageCharged, portfolioId: job.portfolioId ?? null,
      failure: job.errorCode ? { code: job.errorCode, retryable: job.failureRetryable ?? false } : null,
    });
  }

  async prepareFreeHtml(jobId: string) {
    const prepared = await inTransaction(this.context, async (tx) => {
      const db = mongoCollections(tx.db); const options = { session: tx.session };
      const job = await db.generationJobs.findOne({ _id: jobId }, options);
      if (!job) throw new GenerationError(404, "generation job not found");
      await requireActiveUser(tx, job.userId);
      if (job.status === "done" || job.status === "failed") return { job, portfolioId: job.portfolioId ?? null };
      let portfolioId = job.portfolioId ?? null;
      if (!portfolioId) {
        portfolioId = randomUUID(); const now = new Date();
        const brew = await db.brews.findOne({ _id: job.brewId, userId: job.userId }, options);
        await db.portfolios.insertOne({
          _id: portfolioId, userId: job.userId, brewId: job.brewId, templateId: job.templateId,
          title: brew?.freeTitle ?? "Generated portfolio", status: "draft", styleOverrides: job.styleOverrides,
          createdAt: now, updatedAt: now,
        }, options);
      }
      const attempts = job.attempts + 1;
      await db.generationJobs.updateOne({ _id: jobId, attempts: job.attempts }, { $set: {
        status: "running", stage: "materializing", attempts, portfolioId,
        errorCode: null, failureRetryable: null, updatedAt: new Date(),
      } }, options);
      return { job: { ...job, status: "running" as const, attempts, portfolioId }, portfolioId };
    });
    return { userId: prepared.job.userId, portfolioId: prepared.portfolioId, status: await this.getStatus(prepared.job.userId, jobId) };
  }

  async completeFreeHtml(jobId: string, page: GeneratedPage) {
    const userId = await inTransaction(this.context, async (tx) => {
      const db = mongoCollections(tx.db); const options = { session: tx.session };
      const job = await db.generationJobs.findOne({ _id: jobId }, options);
      if (!job) throw new GenerationError(404, "generation job not found");
      await requireActiveUser(tx, job.userId);
      if (job.status === "done" || job.status === "failed") return job.userId;
      if (!job.portfolioId || page.generationJobId !== job._id || page.portfolioId !== job.portfolioId || page.qualityStatus !== "ready") {
        throw new GenerationError(409, "ready generated page is required before completion");
      }
      await db.generationJobs.updateOne({ _id: jobId, attempts: job.attempts }, { $set: { stage: "charging", updatedAt: new Date() } }, options);
      await chargeMongoGenerationUsage(tx, job.userId, job._id);
      await db.generationJobs.updateOne({ _id: jobId, attempts: job.attempts, status: { $ne: "done" } }, { $set: {
        status: "done", stage: "done", usageCharged: true, updatedAt: new Date(), runToken: null,
      } }, options);
      return job.userId;
    });
    return this.getStatus(userId, jobId);
  }

  async failFreeHtml(jobId: string, code: "PAGE_GENERATION_FAILED" | "PAGE_OUTPUT_INVALID" | "GENERATION_REJECTED") {
    const userId = await inTransaction(this.context, async (tx) => {
      const db = mongoCollections(tx.db); const options = { session: tx.session };
      const job = await db.generationJobs.findOne({ _id: jobId }, options);
      if (!job) throw new GenerationError(404, "generation job not found");
      await requireActiveUser(tx, job.userId);
      if (job.status !== "done") await db.generationJobs.updateOne({ _id: jobId, attempts: job.attempts }, { $set: {
        status: "failed", stage: "failed", errorCode: code, failureRetryable: false, updatedAt: new Date(), runToken: null,
      } }, options);
      return job.userId;
    });
    return this.getStatus(userId, jobId);
  }

  async #subject(job: GenerationJobDoc): Promise<BrewSubjectRow | null> {
    const db = mongoCollections(this.context.db);
    const brew = await db.brews.findOne({ _id: job.brewId, userId: job.userId });
    if (!brew) return null;
    const analysis = await db.jobAnalyses.findOne({ _id: brew.jobAnalysisId, userId: job.userId });
    const posting = analysis?.jobPostingId ? await db.jobPostings.findOne({ _id: analysis.jobPostingId }) : null;
    const company = posting ? await db.companies.findOne({ _id: posting.companyId }) : null;
    return {
      job_title: posting?.title ?? null, job_family: posting?.jobFamily ?? null,
      free_title: brew.freeTitle ?? null, company_name: company?.name ?? null,
      industry: company?.industry ?? null, tone_summary: company?.toneSummary ?? null,
      brand_colors: Array.isArray(company?.brandColors) ? company.brandColors.filter((v): v is string => typeof v === "string") : [],
    };
  }

  async #design(designer: LayoutDesigner, job: GenerationJobDoc, subject: BrewSubjectRow | null, context: WriterContext, output: GenerationOutput, sectionIds: string[]) {
    try {
      const titles = new Map(context.sections.map((section) => [section.recipeSectionId, section.title]));
      const design: LayoutDesignContext = {
        sections: sectionIds.map((sectionId) => ({
          title: titles.get(sectionId) ?? "",
          blocks: output.blocks.flatMap((block, index) => block.recipeSectionId === sectionId ? [{
            number: index + 1, kind: block.kind,
            preview: block.chart ? block.chart.caption : block.text, length: [...block.text].length,
          }] : []),
        })),
        company: subject?.company_name ? { name: subject.company_name, industry: subject.industry, toneSummary: subject.tone_summary, brandColors: subject.brand_colors } : null,
        jobTitle: subject?.job_title ?? subject?.free_title ?? null, jobFamily: subject?.job_family ?? null,
      };
      await this.#consent?.require(job.userId, "layout_draft");
      return await withTimeout(designer.design(design), 420_000, "layout designer");
    } catch (error) {
      console.error(JSON.stringify({ level: "warn", event: "layout.design_failed", generationJobId: job._id, message: error instanceof Error ? error.message : String(error) }));
      return [];
    }
  }

  async #context(job: GenerationJobDoc) {
    const db = mongoCollections(this.context.db);
    const sections = await db.recipeSections.find({ userId: job.userId, recipeId: job.recipeId }).sort({ orderNo: 1, _id: 1 }).toArray();
    const sectionIds = sections.map(({ _id }) => _id);
    const items = await db.recipeItems.find({ userId: job.userId, recipeSectionId: { $in: sectionIds } }).sort({ orderNo: 1, _id: 1 }).toArray();
    const contextRows: ContextRow[] = sections.flatMap((section) => items
      .filter((item) => item.recipeSectionId === section._id)
      .map((item) => ({
        section_id: section._id, section_title: section.title, section_purpose: section.purpose,
        target_length: section.targetLength, item_id: item._id, point_text: item.pointText,
        context: section.context,
      }) as ContextRow));
    const paths = await db.recipeEvidencePaths.find({ userId: job.userId, recipeId: job.recipeId }).sort({ createdAt: 1, _id: 1 }).toArray();
    const [records, answers, requirements] = await Promise.all([
      db.careerRecords.find({ _id: { $in: paths.filter((p) => p.sourceType === "record").map((p) => p.sourceId) }, userId: job.userId }).toArray(),
      db.answers.find({ _id: { $in: paths.filter((p) => p.sourceType === "answer").map((p) => p.sourceId) }, userId: job.userId }).toArray(),
      db.jobPostingRequirements.find({ _id: { $in: paths.filter((p) => p.sourceType === "requirement").map((p) => p.sourceId) } }).toArray(),
    ]);
    const recordById = new Map(records.map((row) => [row._id, row]));
    const answerById = new Map(answers.map((row) => [row._id, row]));
    const requirementById = new Map(requirements.map((row) => [row._id, row]));
    const evidence: PathRow[] = paths.map((path) => {
      const record = recordById.get(path.sourceId); const answer = answerById.get(path.sourceId); const requirement = requirementById.get(path.sourceId);
      const quote = requirement && typeof requirement.sourceSpan.quote === "string" ? requirement.sourceSpan.quote : "";
      return {
        id: path._id, recipe_item_id: path.recipeItemId, source_type: path.sourceType,
        source_id: path.sourceId, source_label: path.sourceLabel,
        source_text: record ? `${record.title}\n${record.bodyMd}` : answer?.transcript ?? (requirement ? `${requirement.label}\n${quote}` : ""),
      };
    });
    let lockedTexts: string[] = [];
    if (job.portfolioId) {
      const portfolioSections = await db.portfolioSections.find({ userId: job.userId, portfolioId: job.portfolioId }).toArray();
      const locked = await db.blocks.find({ userId: job.userId, portfolioSectionId: { $in: portfolioSections.map(({ _id }) => _id) }, locked: true }).toArray();
      lockedTexts = locked.flatMap(({ content }) => typeof content.text === "string" ? [content.text] : []);
    }
    return { contextRows, evidence, lockedTexts, recipeEditVersion: (await db.recipes.findOne({ _id: job.recipeId, userId: job.userId }))?.editVersion ?? 0 };
  }

  async process(jobId: string, writer: SentenceWriter, designer?: LayoutDesigner | null) {
    let claimed: GenerationJobDoc | null = null;
    try {
      const runToken = randomUUID();
      claimed = await inTransaction(this.context, async (tx) => {
        const db = mongoCollections(tx.db); const options = { session: tx.session };
        const job = await db.generationJobs.findOne({ _id: jobId }, options);
        if (!job) throw new GenerationError(404, "generation job not found");
        await requireActiveUser(tx, job.userId);
        if (job.status === "done") return job;
        if (job.status === "running") throw new GenerationError(409, "generation job is already running");
        const attempts = job.attempts + 1;
        const result = await db.generationJobs.updateOne({ _id: jobId, attempts: job.attempts, status: job.status }, { $set: {
          status: "running", stage: "validating", attempts, runToken,
          errorCode: null, failureRetryable: null, updatedAt: new Date(),
        } }, options);
        if (result.matchedCount !== 1) throw new GenerationError(409, "generation job is already running");
        return { ...job, status: "running" as const, stage: "validating" as const, attempts, runToken };
      });
      if (claimed.status === "done") return this.getStatus(claimed.userId, claimed._id);
      const prepared = await this.#context(claimed);
      if (writer.usesContract) await this.#consent?.require(claimed.userId, "generation");
      const subject = await this.#subject(claimed);
      const context = buildWriterContext({ items: prepared.contextRows, evidence: prepared.evidence, subject, lockedTexts: prepared.lockedTexts });
      const output = validateGenerationOutput(
        await withTimeout(writer.write(context), 420_000, "sentence writer"),
        prepared.evidence.map(({ id, source_type, source_label, source_text }) => ({ id, sourceType: source_type, sourceLabel: source_label, sourceText: source_text })),
        prepared.contextRows.flatMap(({ context: sectionContext }) => sectionContext.exclude ?? []), context.lockedTexts,
      );
      const recipeSectionIds = [...new Set(output.blocks.map(({ recipeSectionId }) => recipeSectionId))];
      const layouts = designer ? await this.#design(designer, claimed, subject, context, output, recipeSectionIds) : [];
      await this.#complete(claimed, prepared.recipeEditVersion, output, prepared.evidence, recipeSectionIds, layouts);
      return this.getStatus(claimed.userId, claimed._id);
    } catch (error) {
      if (claimed?.status === "running" && claimed.runToken) await this.#recordFailure(claimed, error).catch(() => undefined);
      throw error;
    }
  }

  async #complete(job: GenerationJobDoc, recipeEditVersion: number, output: GenerationOutput, evidence: PathRow[], recipeSectionIds: string[], layouts: Awaited<ReturnType<LayoutDesigner["design"]>>) {
    const runToken = job.runToken;
    if (!runToken) throw new GenerationError(409, "generation ownership was lost");
    await inTransaction(this.context, async (tx) => {
      const db = mongoCollections(tx.db); const options = { session: tx.session };
      await requireActiveUser(tx, job.userId);
      const current = await db.generationJobs.findOne({ _id: job._id, userId: job.userId, status: "running", attempts: job.attempts, runToken }, options);
      if (!current) {
        if (await db.generationJobs.findOne({ _id: job._id, userId: job.userId, status: "done" }, options)) return;
        throw new GenerationError(409, "generation ownership was lost");
      }
      const recipe = await db.recipes.findOne({ _id: job.recipeId, userId: job.userId, editVersion: recipeEditVersion }, options);
      if (!recipe) throw new GenerationError(409, "recipe changed during generation");
      const recordIds = evidence.filter(({ source_type }) => source_type === "record").map(({ source_id }) => source_id);
      await assertActiveRecordsForWrite(tx, job.userId, recordIds);
      if (!await db.templates.findOne({ _id: job.templateId, isActive: true }, options)) throw new GenerationError(409, "template changed during generation");
      await db.generationJobs.updateOne({ _id: job._id, attempts: job.attempts, runToken }, { $set: { stage: "materializing", updatedAt: new Date() } }, options);

      let portfolioId = current.portfolioId ?? null; const now = new Date();
      if (!portfolioId) {
        portfolioId = randomUUID();
        await db.portfolios.insertOne({ _id: portfolioId, userId: job.userId, brewId: job.brewId, templateId: job.templateId, title: "Generated portfolio", status: "draft", styleOverrides: job.styleOverrides, createdAt: now, updatedAt: now }, options);
      }
      const oldSections = await db.portfolioSections.find({ userId: job.userId, portfolioId }, options).toArray();
      const lockedCount = await db.blocks.countDocuments({ userId: job.userId, portfolioSectionId: { $in: oldSections.map(({ _id }) => _id) }, locked: true }, options);
      if (lockedCount === 0 && oldSections.length > 0) {
        const oldBlockIds = (await db.blocks.find({ userId: job.userId, portfolioSectionId: { $in: oldSections.map(({ _id }) => _id) } }, options).toArray()).map(({ _id }) => _id);
        await db.generationSentenceEvidence.deleteMany({ userId: job.userId, blockId: { $in: oldBlockIds } }, options);
        await db.recordUsages.deleteMany({ userId: job.userId, blockId: { $in: oldBlockIds } }, options);
        await db.blocks.deleteMany({ userId: job.userId, _id: { $in: oldBlockIds } }, options);
        await db.portfolioSections.deleteMany({ userId: job.userId, portfolioId }, options);
      }
      const remainingSections = lockedCount === 0 ? [] : oldSections;
      const sectionMap = new Map<string, string>();
      for (const [orderNo, recipeSectionId] of recipeSectionIds.entries()) {
        const existing = remainingSections.find((section) => section.recipeSectionId === recipeSectionId);
        const sectionId = existing?._id ?? randomUUID();
        if (existing) {
          await db.portfolioSections.updateOne({ _id: sectionId, userId: job.userId }, { $set: { orderNo } }, options);
        } else {
          await db.portfolioSections.insertOne({ _id: sectionId, userId: job.userId, portfolioId, recipeSectionId, orderNo, visible: true, hiddenReason: null }, options);
        }
        sectionMap.set(recipeSectionId, sectionId);
      }
      const blockIds: (string | null)[] = output.blocks.map(() => null);
      for (const [orderNo, generated] of output.blocks.entries()) {
        const portfolioSectionId = sectionMap.get(generated.recipeSectionId);
        if (!portfolioSectionId) continue;
        const paths = evidence.filter(({ id }) => generated.evidencePathIds.includes(id));
        const recordPath = paths.find(({ source_type }) => source_type === "record");
        const blockId = randomUUID(); blockIds[orderNo] = blockId;
        await db.blocks.insertOne({ _id: blockId, userId: job.userId, portfolioSectionId, kind: generated.kind, content: mongoBlockContent(generated), style: {}, sourceRecordId: recordPath?.source_id ?? null, syncState: "synced", locked: false, orderNo }, options);
        if (paths.length > 0) await db.generationSentenceEvidence.insertMany(paths.map((path) => ({ _id: randomUUID(), userId: job.userId, generationJobId: job._id, blockId, recipeEvidencePathId: path.id, sourceQuote: path.source_label, createdAt: now })), options);
        if (recordPath) await db.recordUsages.updateOne({ userId: job.userId, recordId: recordPath.source_id, blockId }, { $setOnInsert: { _id: randomUUID(), userId: job.userId, recordId: recordPath.source_id, blockId, quotedText: recordPath.source_label, firstUsedAt: now } }, { ...options, upsert: true });
      }
      if (layouts.length > 0) {
        const specs = toLayoutSpecs(layouts, recipeSectionIds.map((id) => sectionMap.get(id) ?? ""), blockIds);
        const batchId = randomUUID();
        await db.layoutSpecs.updateMany({ userId: job.userId, portfolioId, selected: true }, { $set: { selected: false } }, options);
        await db.layoutSpecs.insertMany(specs.map((spec, orderNo) => ({ _id: randomUUID(), userId: job.userId, portfolioId, batchId, generationJobId: job._id, seedTemplateId: null, spec: spec as unknown as JsonObject, promptVersion: LAYOUT_PROMPT_VERSION, editedBy: "ai" as const, orderNo, selected: orderNo === 0, createdAt: now, instruction: null })), options);
      }
      await db.generationJobs.updateOne({ _id: job._id, attempts: job.attempts, runToken }, { $set: { stage: "charging", updatedAt: new Date() } }, options);
      await chargeMongoGenerationUsage(tx, job.userId, job._id);
      const storedSections = await db.portfolioSections.find({ userId: job.userId, portfolioId }, options).sort({ orderNo: 1, _id: 1 }).toArray();
      const storedBlocks = await db.blocks.find({ userId: job.userId, portfolioSectionId: { $in: storedSections.map(({ _id }) => _id) } }, options).sort({ orderNo: 1, _id: 1 }).toArray();
      const snapshot = await writeSnapshot(tx, job.userId, mongoPortfolioSnapshot(portfolioId, storedSections, storedBlocks));
      await db.portfolioSnapshots.insertOne({ _id: randomUUID(), userId: job.userId, portfolioId, kind: "initial_generation", snapshot: snapshot as unknown as JsonObject, createdAt: now }, options);
      const completed = await db.generationJobs.updateOne({ _id: job._id, userId: job.userId, status: "running", attempts: job.attempts, runToken }, { $set: { status: "done", stage: "done", usageCharged: true, portfolioId, runToken: null, updatedAt: new Date() } }, options);
      if (completed.matchedCount !== 1) throw new GenerationError(409, "generation ownership was lost");
    });
  }

  async #recordFailure(job: GenerationJobDoc, error: unknown) {
    const runToken = job.runToken;
    if (!runToken) return;
    const retryable = !(error instanceof GenerationValidationError || error instanceof GenerationError || error instanceof SentenceWriterUnavailableError);
    const code = error instanceof GenerationValidationError ? "EVIDENCE_INVALID" : error instanceof GenerationError ? "GENERATION_REJECTED" : error instanceof SentenceWriterUnavailableError ? "WRITER_UNAVAILABLE" : "PROVIDER_FAILED";
    await inTransaction(this.context, async (tx: MongoTransaction) => {
      const db = mongoCollections(tx.db); const options = { session: tx.session };
      await requireActiveUser(tx, job.userId);
      const current = await db.generationJobs.findOne({ _id: job._id, userId: job.userId, status: "running", attempts: job.attempts, runToken }, options);
      if (!current) return;
      let portfolioId = current.portfolioId ?? null; const now = new Date();
      if (!portfolioId) {
        portfolioId = randomUUID();
        await db.portfolios.insertOne({ _id: portfolioId, userId: job.userId, brewId: job.brewId, templateId: job.templateId, title: "Failed generation draft", status: "draft", styleOverrides: job.styleOverrides, createdAt: now, updatedAt: now }, options);
      }
      await db.generationJobs.updateOne({ _id: job._id, status: "running", attempts: job.attempts, runToken }, { $set: { status: "failed", stage: "failed", errorCode: code, failureRetryable: retryable, portfolioId, runToken: null, updatedAt: now } }, options);
    });
  }
}
