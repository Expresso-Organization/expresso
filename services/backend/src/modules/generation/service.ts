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
import { writeSnapshot } from "../../platform/snapshot-payload.js";
import { assertActiveRecordsForWrite, type CanonicalCareerReadService } from "../career/index.js";
import type { ConsentApi } from "../consent/index.js";
import { findDesignSystemRevision, generationStyleFor } from "../design-systems/index.js";
import { MongoEntitlementService } from "../entitlements/index.js";
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

/** 브루의 가장 최근 구성(레시피). 구성 잡이 다시 만들면 새 판이 생기므로 만든 시각이 가장 늦은 것을 쓴다. */
async function latestRecipe(tx: MongoTransaction, userId: string, brewId: string) {
  const [recipe] = await mongoCollections(tx.db).recipes
    .find({ userId, brewId }, { session: tx.session })
    .sort({ generatedAt: -1, _id: -1 })
    .limit(1)
    .toArray();
  return recipe ?? null;
}

/**
 * 요청의 스타일 출처를 템플릿과 스타일 값으로 정합니다.
 *
 * 디자인 시스템 판으로 요청하면 판의 토큰에서 정하고, 어떤 판인지 함께 돌려줍니다.
 */
function resolveStyle(input: SubmitGeneration): {
  templateId: string;
  styleOverrides: Record<string, unknown>;
  designSystemRevisionId: string | null;
} {
  if (input.designSystemRevisionId) {
    const revision = findDesignSystemRevision(input.designSystemRevisionId);
    if (!revision) throw new GenerationError(404, "design system revision not found");
    return { ...generationStyleFor(revision), designSystemRevisionId: revision.revisionId };
  }
  if (!input.templateId) throw new GenerationError(400, "templateId or designSystemRevisionId is required");
  return { templateId: input.templateId, styleOverrides: input.styleOverrides ?? {}, designSystemRevisionId: null };
}

function requestHash(input: SubmitGeneration): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export class GenerationService {
  readonly #consent: ConsentApi | null;
  constructor(readonly context: MongoContext, consent?: ConsentApi | null, readonly careerReads?: CanonicalCareerReadService) {
    this.#consent = consent ?? null;
  }

  /**
   * 생성을 맡긴다.
   *
   * `recipeId` 대신 `brewId`가 오면 그 브루의 가장 최근 구성(레시피)으로 시작한다. 구성이 아직 없으면
   * `recipeId: null`로 저장만 하고 `portfolio.generate`는 내지 않는다 — 구성 잡이 끝나면 워커가
   * `attachRecipe`로 붙이고 그때 시작한다. 저장한 뒤 한 번 더 붙여 본다: 구성 잡이 이 요청과 엇갈려
   * 끝났으면 워커의 `attachRecipe`는 이 잡을 못 봤을 수 있다.
   */
  async submit(userId: string, idempotencyKey: string, input: SubmitGeneration) {
    const hash = requestHash(input);
    const { jobId, waitingBrewId } = await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const db = mongoCollections(tx.db); const options = { session: tx.session };
      const recipe = input.recipeId
        ? await db.recipes.findOne({ _id: input.recipeId, userId }, options)
        : await latestRecipe(tx, userId, input.brewId!);
      if (input.recipeId && !recipe) throw new GenerationError(404, "recipe not found");
      const brewId = recipe?.brewId ?? input.brewId!;
      if (!recipe && !await db.brews.findOne({ _id: brewId, userId }, options)) throw new GenerationError(404, "brew not found");
      const style = resolveStyle(input);
      if (!await db.templates.findOne({ _id: style.templateId, isActive: true }, options)) {
        throw new GenerationError(404, "template not found");
      }
      const existing = await db.generationJobs.findOne({ userId, inputIdempotencyKey: idempotencyKey }, options);
      if (existing) {
        if (existing.requestHash !== hash) throw new GenerationError(409, "idempotency key reused for another generation");
        return { jobId: existing._id, waitingBrewId: existing.recipeId === null ? existing.brewId : null };
      }
      // 한도는 생성을 시작할 때 본다. 이번 달 AI 사용량(크레딧)이 플랜 한도에 닿았으면
      // 새 생성만 막는다 — 편집 · 배포 · 기록 관리는 그대로 열린다(기능 명세서 T12.1.1).
      const decision = await new MongoEntitlementService(tx).check(userId, "portfolio.generate");
      if (!decision.allowed) throw new GenerationError(403, "monthly AI credits are exhausted");
      const now = new Date(); const id = randomUUID();
      await db.generationJobs.insertOne({
        _id: id, userId, brewId, recipeId: recipe?._id ?? null, templateId: style.templateId,
        status: "queued", usageCharged: false, stage: "queued", attempts: 0,
        inputIdempotencyKey: idempotencyKey, requestHash: hash, portfolioId: null,
        errorCode: null, failureRetryable: null, runToken: null,
        createdAt: now, updatedAt: now,
        styleOverrides: style.styleOverrides as JsonObject,
        designSystemRevisionId: style.designSystemRevisionId,
        archetype: input.archetype ?? null,
      }, options);
      if (!recipe) return { jobId: id, waitingBrewId: brewId };
      await addMongoOutboxEvent(tx, {
        userId, topic: "portfolio.generate", payload: { generationJobId: id, userId },
        idempotencyKey: `portfolio-generation:${id}`,
      });
      return { jobId: id, waitingBrewId: null };
    });
    if (waitingBrewId) await this.attachRecipe(userId, waitingBrewId);
    return this.getStatus(userId, jobId);
  }

  /**
   * 구성을 기다리던 생성에 그 브루의 가장 최근 구성을 붙이고 시작한다. 붙인 잡 수를 돌려준다.
   *
   * 구성 잡이 성공한 뒤 워커가 부르고, `submit`도 구성을 기다리는 잡을 저장한 뒤 부른다. `recipeId: null`인
   * 잡만 바꾸므로 두 번 불려도 한 번만 붙고 `portfolio.generate`도 한 번만 나간다.
   */
  async attachRecipe(userId: string, brewId: string): Promise<number> {
    return inTransaction(this.context, async (tx) => {
      const db = mongoCollections(tx.db); const options = { session: tx.session };
      const recipe = await latestRecipe(tx, userId, brewId);
      if (!recipe) return 0;
      const waiting = await db.generationJobs.find({ userId, brewId, recipeId: null, status: "queued" }, options).toArray();
      let attached = 0;
      for (const job of waiting) {
        const updated = await db.generationJobs.updateOne(
          { _id: job._id, userId, recipeId: null, status: "queued" },
          { $set: { recipeId: recipe._id, updatedAt: new Date() } },
          options,
        );
        if (updated.modifiedCount !== 1) continue;
        attached += 1;
        await addMongoOutboxEvent(tx, {
          userId, topic: "portfolio.generate", payload: { generationJobId: job._id, userId },
          idempotencyKey: `portfolio-generation:${job._id}`,
        });
      }
      return attached;
    });
  }

  /**
   * 구성 잡이 끝내 실패하면 그 구성을 기다리던 생성도 끝낸다. 코드는 구성 잡의 실패 코드다 — 화면은 그 이유를
   * 디자인 선택의 실패 줄에 보인다. 다시 돌 수 있는 실패에서는 부르지 않는다(워커가 마지막 시도인지 본다).
   */
  async failWaiting(userId: string, brewId: string, code: string): Promise<number> {
    const result = await mongoCollections(this.context.db).generationJobs.updateMany(
      { userId, brewId, recipeId: null, status: "queued" },
      { $set: { status: "failed", stage: "failed", errorCode: code, failureRetryable: false, updatedAt: new Date() } },
    );
    return result.modifiedCount;
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
      // 구성이 붙기 전에는 `portfolio.generate`가 나가지 않는다. 그래도 들어왔다면 순서가 어긋난 것이다.
      if (job.recipeId === null) throw new GenerationError(409, "generation is waiting for its recipe");
      let portfolioId = job.portfolioId ?? null;
      if (!portfolioId) {
        portfolioId = randomUUID(); const now = new Date();
        const brew = await db.brews.findOne({ _id: job.brewId, userId: job.userId }, options);
        await db.portfolios.insertOne({
          _id: portfolioId, userId: job.userId, brewId: job.brewId, templateId: job.templateId,
          title: brew?.freeTitle ?? "Generated portfolio", status: "draft", styleOverrides: job.styleOverrides,
          designSystemRevisionId: job.designSystemRevisionId ?? null,
          archetype: job.archetype ?? null,
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
        userId: job.userId,
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
      return await designer.design(design);
    } catch (error) {
      console.error(JSON.stringify({ level: "warn", event: "layout.design_failed", generationJobId: job._id, message: error instanceof Error ? error.message : String(error) }));
      return [];
    }
  }

  async #context(job: GenerationJobDoc) {
    const db = mongoCollections(this.context.db);
    const recipeId = job.recipeId;
    if (recipeId === null) throw new GenerationError(409, "generation is waiting for its recipe");
    const sections = await db.recipeSections.find({ userId: job.userId, recipeId }).sort({ orderNo: 1, _id: 1 }).toArray();
    const sectionIds = sections.map(({ _id }) => _id);
    const items = await db.recipeItems.find({ userId: job.userId, recipeSectionId: { $in: sectionIds } }).sort({ orderNo: 1, _id: 1 }).toArray();
    const contextRows: ContextRow[] = sections.flatMap((section) => items
      .filter((item) => item.recipeSectionId === section._id)
      .map((item) => ({
        section_id: section._id, section_title: section.title, section_purpose: section.purpose,
        target_length: section.targetLength, item_id: item._id, point_text: item.pointText,
        context: section.context,
      }) as ContextRow));
    const paths = await db.recipeEvidencePaths.find({ userId: job.userId, recipeId }).sort({ createdAt: 1, _id: 1 }).toArray();
    const [records, answers, requirements] = await Promise.all([
      db.careerRecords.find({ _id: { $in: paths.filter((p) => p.sourceType === "record").map((p) => p.sourceId) }, userId: job.userId }).toArray(),
      db.answers.find({ _id: { $in: paths.filter((p) => p.sourceType === "answer").map((p) => p.sourceId) }, userId: job.userId }).toArray(),
      db.jobPostingRequirements.find({ _id: { $in: paths.filter((p) => p.sourceType === "requirement").map((p) => p.sourceId) } }).toArray(),
    ]);
    const projectedRecords = this.careerReads ? await Promise.all(records.map(async record => { const canonical=await this.careerReads!.mapRecord(record);return {...record,title:canonical.title,bodyMd:canonical.bodyMd}; })) : records;
    const recordById = new Map(projectedRecords.map((row) => [row._id, row]));
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
    return { contextRows, evidence, lockedTexts, recipeEditVersion: (await db.recipes.findOne({ _id: recipeId, userId: job.userId }))?.editVersion ?? 0 };
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
      const context = buildWriterContext({ userId: claimed.userId, items: prepared.contextRows, evidence: prepared.evidence, subject, lockedTexts: prepared.lockedTexts });
      const output = validateGenerationOutput(
        await writer.write(context),
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
      if (job.recipeId === null) throw new GenerationError(409, "generation is waiting for its recipe");
      const recipe = await db.recipes.findOne({ _id: job.recipeId, userId: job.userId, editVersion: recipeEditVersion }, options);
      if (!recipe) throw new GenerationError(409, "recipe changed during generation");
      const recordIds = evidence.filter(({ source_type }) => source_type === "record").map(({ source_id }) => source_id);
      await assertActiveRecordsForWrite(tx, job.userId, recordIds);
      if (!await db.templates.findOne({ _id: job.templateId, isActive: true }, options)) throw new GenerationError(409, "template changed during generation");
      await db.generationJobs.updateOne({ _id: job._id, attempts: job.attempts, runToken }, { $set: { stage: "materializing", updatedAt: new Date() } }, options);

      let portfolioId = current.portfolioId ?? null; const now = new Date();
      if (!portfolioId) {
        portfolioId = randomUUID();
        await db.portfolios.insertOne({ _id: portfolioId, userId: job.userId, brewId: job.brewId, templateId: job.templateId, title: "Generated portfolio", status: "draft", styleOverrides: job.styleOverrides, designSystemRevisionId: job.designSystemRevisionId ?? null, archetype: job.archetype ?? null, createdAt: now, updatedAt: now }, options);
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
        await db.portfolios.insertOne({ _id: portfolioId, userId: job.userId, brewId: job.brewId, templateId: job.templateId, title: "Failed generation draft", status: "draft", styleOverrides: job.styleOverrides, designSystemRevisionId: job.designSystemRevisionId ?? null, archetype: job.archetype ?? null, createdAt: now, updatedAt: now }, options);
      }
      await db.generationJobs.updateOne({ _id: job._id, status: "running", attempts: job.attempts, runToken }, { $set: { status: "failed", stage: "failed", errorCode: code, failureRetryable: retryable, portfolioId, runToken: null, updatedAt: now } }, options);
    });
  }
}

export { GenerationService as MongoGenerationService };
