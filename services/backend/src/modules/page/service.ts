import { randomUUID } from "node:crypto";

import {
  GeneratedPageSchema,
  PAGE_PROMPT_VERSION,
  PageStyleGrammarSchema,
  PortfolioPlanSchema,
  composeTemplateStyle,
  findPortfolioStyle,
  pageDocument,
  type GeneratedPage,
  type PageStyleGrammar,
} from "@expresso/contracts";
import { mongoCollections, type GeneratedPageDoc, type JsonObject } from "@expresso/database";

import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import { withTimeout } from "../../platform/timeouts.js";
import type { ConsentApi } from "../consent/index.js";
import { requireActiveUser } from "../identity/index.js";
import { DESIGN_PRINCIPLES_VERSION, type PageGenerationContext, type PageGenerator } from "./generator.js";
import { PageServiceError } from "./public.js";
import type { PageStream } from "./stream.js";

function toPage(row: GeneratedPageDoc): GeneratedPage {
  return GeneratedPageSchema.parse({
    id: row._id, portfolioId: row.portfolioId, generationJobId: row.generationJobId ?? null,
    html: row.html, css: row.css, rationale: row.rationale, promptVersion: row.promptVersion,
    revision: row.revision, qualityStatus: row.qualityStatus, qaReport: row.qaReport,
    generationManifest: Object.keys(row.generationManifest).length > 0 ? row.generationManifest : null,
    styleSpec: row.styleSpecSnapshot ?? null, createdAt: row.createdAt.toISOString(),
  });
}

function isPageStyleGrammar(value: unknown): value is PageStyleGrammar { return PageStyleGrammarSchema.safeParse(value).success; }

export class PageService {
  readonly #consent: ConsentApi | null; readonly #stream: PageStream | null;
  constructor(readonly context: MongoContext, consent?: ConsentApi | null, stream?: PageStream | null) {
    this.#consent = consent ?? null; this.#stream = stream ?? null;
  }

  async owns(userId: string, portfolioId: string): Promise<boolean> {
    return Boolean(await mongoCollections(this.context.db).portfolios.findOne({ _id: portfolioId, userId }));
  }
  async latest(userId: string, portfolioId: string): Promise<GeneratedPage | null> {
    const row = await mongoCollections(this.context.db).generatedPages.find({ userId, portfolioId }).sort({ revision: -1 }).limit(1).next();
    return row ? toPage(row) : null;
  }
  async forGenerationJob(userId: string, generationJobId: string): Promise<GeneratedPage | null> {
    const row = await mongoCollections(this.context.db).generatedPages.findOne({ userId, generationJobId });
    return row ? toPage(row) : null;
  }
  async history(userId: string, portfolioId: string): Promise<GeneratedPage[]> {
    return (await mongoCollections(this.context.db).generatedPages.find({ userId, portfolioId }).sort({ revision: -1 }).toArray()).map(toPage);
  }
  async document(userId: string, portfolioId: string): Promise<string | null> {
    const db = mongoCollections(this.context.db);
    const row = await db.generatedPages.find({ userId, portfolioId, qualityStatus: "ready" }).sort({ revision: -1 }).limit(1).next();
    if (!row) return null;
    const portfolio = await db.portfolios.findOne({ _id: portfolioId, userId });
    return pageDocument({ html: row.html, css: row.css, title: portfolio?.title ?? "포트폴리오", description: row.rationale, ...(isPageStyleGrammar(row.styleSpecSnapshot) ? { grammar: row.styleSpecSnapshot } : {}) });
  }

  async #context(userId: string, portfolioId: string, instruction: string | undefined, previous: { html: string; css: string } | undefined): Promise<PageGenerationContext> {
    const db = mongoCollections(this.context.db);
    const portfolio = await db.portfolios.findOne({ _id: portfolioId, userId });
    if (!portfolio) throw new PageServiceError(404, "portfolio not found");
    const recipe = await db.recipes.find({ userId, brewId: portfolio.brewId }).sort({ version: -1 }).limit(1).next();
    if (!recipe) throw new PageServiceError(404, "recipe not found for portfolio");
    const sections = await db.recipeSections.find({ userId, recipeId: recipe._id }).sort({ orderNo: 1 }).toArray();
    if (sections.length === 0) throw new PageServiceError(409, "recipe has no sections");
    const paths = await db.recipeEvidencePaths.find({ userId, recipeId: recipe._id }).toArray();
    const [records, answers, requirements, template, brew] = await Promise.all([
      db.careerRecords.find({ userId, _id: { $in: paths.filter((p) => p.sourceType === "record").map((p) => p.sourceId) } }).toArray(),
      db.answers.find({ userId, _id: { $in: paths.filter((p) => p.sourceType === "answer").map((p) => p.sourceId) } }).toArray(),
      db.jobPostingRequirements.find({ _id: { $in: paths.filter((p) => p.sourceType === "requirement").map((p) => p.sourceId) } }).toArray(),
      db.templates.findOne({ _id: portfolio.templateId }), db.brews.findOne({ _id: portfolio.brewId, userId }),
    ]);
    const sourceText = (sourceId: string) => {
      const record = records.find(({ _id }) => _id === sourceId); if (record) return `${record.title}\n${record.bodyMd}`;
      const answer = answers.find(({ _id }) => _id === sourceId); if (answer) return answer.transcript;
      const requirement = requirements.find(({ _id }) => _id === sourceId);
      return requirement ? `${requirement.label}\n${typeof requirement.sourceSpan.quote === "string" ? requirement.sourceSpan.quote : ""}` : "";
    };
    const composed = template ? composeTemplateStyle(template.style, portfolio.styleOverrides) : null;
    const preset = template ? findPortfolioStyle(template.code) : undefined;
    const style: PageStyleGrammar | undefined = composed && template ? {
      name: template.name, description: template.description,
      toneTags: Array.isArray(template.toneTags) ? template.toneTags.filter((v): v is string => typeof v === "string") : [],
      ...composed,
      ...(preset ? { designReference: { code: preset.code, sourceUrl: preset.sourceUrl, version: preset.version, prompt: preset.prompt } } : {}),
      composition: composed.structure === "dense-grid" ? "evidence-grid" : composed.structure === "wide-margin" ? "asymmetric-editorial" : "linear-story",
      typography: composed.font === "serif" ? "editorial" : composed.structure === "dense-grid" ? "technical" : "display-led",
      geometry: composed.structure === "dense-grid" ? "ruled-sections" : composed.structure === "wide-margin" ? "open-planes" : "contained-cards",
      motion: composed.density === "compact" ? "precise-technical" : "calm-responsive",
      interaction: composed.structure === "dense-grid" ? "comparison" : "evidence-exploration",
      imagery: composed.structure === "wide-margin" ? "project-artifacts-first" : composed.structure === "dense-grid" ? "data-visual-first" : "typography-first",
      antiPatterns: ["generic-saas-landing", "three-identical-cards", "decorative-dashboard-without-evidence", "color-only-variation"],
    } : undefined;
    const analysis = brew ? await db.jobAnalyses.findOne({ _id: brew.jobAnalysisId, userId }) : null;
    const posting = analysis?.jobPostingId ? await db.jobPostings.findOne({ _id: analysis.jobPostingId }) : null;
    const company = posting ? await db.companies.findOne({ _id: posting.companyId }) : null;
    return {
      portfolioPlan: recipe.portfolioPlan ? PortfolioPlanSchema.parse(recipe.portfolioPlan) : null,
      ...(style ? { style } : {}),
      sections: sections.map((row) => ({ title: row.title, purpose: row.purpose, goal: typeof row.context.goal === "string" ? row.context.goal : "", points: Array.isArray(row.context.points) ? row.context.points.filter((v): v is string => typeof v === "string") : [], targetLength: row.targetLength })),
      evidence: paths.map((path) => ({ label: path.sourceLabel, text: sourceText(path.sourceId) })).filter(({ text }) => text.trim().length > 0),
      media: [], jobTitle: posting?.title ?? brew?.freeTitle ?? null,
      company: company ? { name: company.name, industry: company.industry ?? null, toneSummary: company.toneSummary ?? null, brandColors: Array.isArray(company.brandColors) ? company.brandColors.filter((v): v is string => typeof v === "string") : [] } : null,
      instruction, previous, useKit: !preset, modelTier: "sonnet",
    };
  }

  async generate(userId: string, portfolioId: string, generator: PageGenerator, options: { instruction?: string; generationJobId?: string; streamId?: string } = {}): Promise<GeneratedPage> {
    if (!await this.owns(userId, portfolioId)) throw new PageServiceError(404, "portfolio not found");
    if (options.generationJobId) { const existing = await this.forGenerationJob(userId, options.generationJobId); if (existing) return existing; }
    const current = await this.latest(userId, portfolioId);
    const context = await this.#context(userId, portfolioId, options.instruction, current ? { html: current.html, css: current.css } : undefined);
    await this.#consent?.require(userId, "page_generation");
    const streamId = options.streamId ?? portfolioId; const stream = this.#stream;
    const sink = stream ? { delta: (value: string) => { void this.#publish(stream.delta(streamId, value)); }, thinking: (tokens: number) => { void this.#publish(stream.thinking(streamId, tokens)); } } : null;
    await this.#publish(stream?.begin(streamId, JSON.stringify(context.style ?? null)));
    let result;
    try { result = await withTimeout(generator.generate(context, sink), 900_000, "page generator"); }
    catch (error) { await this.#publish(stream?.failed(streamId, error instanceof Error ? error.name : "PAGE_GENERATION_FAILED")); throw error; }
    const row = await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const db = mongoCollections(tx.db); const transactionOptions = { session: tx.session };
      if (!await db.portfolios.findOne({ _id: portfolioId, userId }, transactionOptions)) throw new PageServiceError(404, "portfolio not found");
      if (options.generationJobId) {
        const existing = await db.generatedPages.findOne({ userId, generationJobId: options.generationJobId }, transactionOptions);
        if (existing) return existing;
      }
      const last = await db.generatedPages.find({ userId, portfolioId }, transactionOptions).sort({ revision: -1 }).limit(1).next();
      const now = new Date();
      const created: GeneratedPageDoc = {
        _id: randomUUID(), userId, portfolioId, generationJobId: options.generationJobId ?? null,
        html: result.html, css: result.css, rationale: result.rationale, revision: (last?.revision ?? -1) + 1,
        instruction: options.instruction ?? null, promptVersion: PAGE_PROMPT_VERSION,
        ungroundedNumbers: result.ungrounded, removed: result.removed, qualityStatus: result.qaReport.status,
        qaReport: result.qaReport as unknown as JsonObject, generationManifest: result.manifest as unknown as JsonObject,
        portfolioPlanSnapshot: context.portfolioPlan as unknown as JsonObject | null,
        styleSpecSnapshot: context.style as unknown as JsonObject | null,
        designPrinciplesVersion: DESIGN_PRINCIPLES_VERSION, createdAt: now,
      };
      await db.generatedPages.insertOne(created, transactionOptions); return created;
    });
    await this.#publish(stream?.done(streamId, row._id));
    if (result.removed.length > 0) console.error(JSON.stringify({ level: "warn", event: "page.sanitized", portfolioId, removed: result.removed }));
    return toPage(row);
  }

  async #publish(work: Promise<void> | undefined): Promise<void> {
    if (!work) return;
    try { await work; } catch (error) { console.error(JSON.stringify({ level: "warn", event: "page.stream_failed", detail: error instanceof Error ? error.message : String(error) })); }
  }
}

export { PageService as MongoPageService };
