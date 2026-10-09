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
  EditStructuredPageSchema,
  applyStructuredTextPatches,
  validateStructuredPortfolio,
  type EditStructuredPage,
  PortfolioMediaSchema,
  PAGE_IMAGE_SRC_PREFIX,
} from "@expresso/contracts";
import { renderStructuredPortfolio, librarySelection } from "@expresso/portfolio-renderer";
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
    const [records, answers, requirements, template, brew, author] = await Promise.all([
      db.careerRecords.find({ userId, _id: { $in: paths.filter((p) => p.sourceType === "record").map((p) => p.sourceId) } }).toArray(),
      db.answers.find({ userId, _id: { $in: paths.filter((p) => p.sourceType === "answer").map((p) => p.sourceId) } }).toArray(),
      db.jobPostingRequirements.find({ _id: { $in: paths.filter((p) => p.sourceType === "requirement").map((p) => p.sourceId) } }).toArray(),
      db.templates.findOne({ _id: portfolio.templateId }), db.brews.findOne({ _id: portfolio.brewId, userId }), db.users.findOne({ _id: userId }),
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
      // 지면 문법은 명조와 고딕만 안다. 고정폭 스타일은 고딕으로 내려 둔다.
      font: composed.font === "serif" ? "serif" : "sans",
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
    const pageSections = await db.portfolioSections.find({ userId, portfolioId }).toArray();
    const mediaBlocks = await db.blocks.find({ userId, portfolioSectionId: { $in: pageSections.map(item => item._id) }, kind: "media" }).toArray();
    const supplied = mediaBlocks.flatMap(item => { const parsed = PortfolioMediaSchema.safeParse(item.content); return parsed.success ? [{ id: parsed.data.assetId, alt: parsed.data.alt }] : []; });
    for (const record of records) for (const match of record.bodyMd.matchAll(/\/v1\/media\/([a-f0-9-]{36})/gi)) supplied.push({ id: match[1]!, alt: record.title });
    const assets = await db.mediaAssets.find({ userId, _id: { $in: supplied.map(item => item.id) }, storageKey: { $ne: "" } }).toArray();
    const media = [...new Map(supplied.flatMap(item => { const asset = assets.find(value => value._id === item.id); return asset ? [[item.id, { src: `${PAGE_IMAGE_SRC_PREFIX}${asset._id}`, srcSet: "", alt: item.alt, width: asset.width, height: asset.height }] as const] : []; })).values()];
    return {
      ...(author ? { author: { name: author.displayName } } : {}),
      portfolioPlan: recipe.portfolioPlan ? PortfolioPlanSchema.parse(recipe.portfolioPlan) : null,
      ...(style ? { style } : {}),
      sections: sections.map((row) => ({ id: row._id, title: row.title, purpose: row.purpose, goal: typeof row.context.goal === "string" ? row.context.goal : "", points: Array.isArray(row.context.points) ? row.context.points.filter((v): v is string => typeof v === "string") : [], targetLength: row.targetLength })),
      evidence: [...new Map(paths.map((path) => [path.sourceId, { id: path.sourceId, label: path.sourceLabel, text: sourceText(path.sourceId) }])).values()].filter(({ text }) => text.trim().length > 0),
      media, jobTitle: posting?.title ?? brew?.freeTitle ?? null,
      company: company ? { name: company.name, industry: company.industry ?? null, toneSummary: company.toneSummary ?? null, brandColors: Array.isArray(company.brandColors) ? company.brandColors.filter((v): v is string => typeof v === "string") : [] } : null,
      instruction, previous, useKit: !preset, modelTier: "sonnet",
    };
  }

  async generate(userId: string, portfolioId: string, generator: PageGenerator, options: { instruction?: string; generationJobId?: string; streamId?: string } = {}): Promise<GeneratedPage> {
    if (!await this.owns(userId, portfolioId)) throw new PageServiceError(404, "portfolio not found");
    if (options.generationJobId) { const existing = await this.forGenerationJob(userId, options.generationJobId); if (existing) return existing; }
    const current = await this.latest(userId, portfolioId);
    const context = await this.#context(userId, portfolioId, options.instruction, current ? { html: current.html, css: current.css } : undefined);
    if (context.previous && current?.generationManifest?.structured) {
      context.previous.structured = current.generationManifest.structured;
      context.structuredContent = current.generationManifest.structured.content;
    }
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

  async editComposition(userId: string, portfolioId: string, raw: EditStructuredPage): Promise<GeneratedPage> {
    const input = EditStructuredPageSchema.parse(raw), current = await this.latest(userId, portfolioId);
    if (!current) throw new PageServiceError(404, "지면이 없습니다.");
    if (current.revision !== input.expectedRevision) throw new PageServiceError(409, "다른 편집이 먼저 저장됐습니다. 새로고침해 주세요.");
    const previous = current.generationManifest?.structured;
    if (!previous) throw new PageServiceError(409, "구조화 지면에서만 구성을 편집할 수 있습니다.");
    let snapshot, rendered;
    try {
      const content = applyStructuredTextPatches(previous.content, input.patches);
      snapshot = validateStructuredPortfolio(input.spec ?? previous.spec, content);
      rendered = renderStructuredPortfolio(snapshot.spec, snapshot.content, current.styleSpec ?? undefined);
    } catch (error) { throw new PageServiceError(422, error instanceof Error ? error.message : "구성이 올바르지 않습니다."); }
    const row = await inTransaction(this.context, async tx => {
      await requireActiveUser(tx, userId);
      const db = mongoCollections(tx.db), options = { session: tx.session };
      const portfolio = await db.portfolios.findOne({ _id: portfolioId, userId }, options);
      if (!portfolio) throw new PageServiceError(404, "portfolio not found");
      // 같은 포트폴리오의 동시 편집은 이 문서 쓰기로 충돌시킵니다.
      const root = snapshot.spec.elements[snapshot.spec.root]!;
      if (root.type !== "PortfolioPage") throw new PageServiceError(422, "페이지 루트가 필요합니다.");
      const structure = root.props.design.layout === "editorial" ? "wide-margin" : root.props.design.layout === "dossier" ? "dense-grid" : "single-column";
      await db.portfolios.updateOne({ _id: portfolioId, userId }, { $set: { updatedAt: new Date(), "styleOverrides.structure": structure } }, options);
      const latest = await db.generatedPages.find({ userId, portfolioId }, options).sort({ revision: -1 }).limit(1).next();
      if (!latest || latest.revision !== input.expectedRevision) throw new PageServiceError(409, "다른 편집이 먼저 저장됐습니다.");
      const created: GeneratedPageDoc = { ...latest, _id: randomUUID(), generationJobId: null, revision: latest.revision + 1, html: rendered.html, css: rendered.css, styleSpecSnapshot: latest.styleSpecSnapshot ? { ...latest.styleSpecSnapshot, structure } : null, instruction: "구성·문장 직접 편집", createdAt: new Date(), generationManifest: { ...latest.generationManifest, structured: snapshot, library: librarySelection(snapshot.spec) } as unknown as JsonObject };
      await db.generatedPages.insertOne(created, options);
      return created;
    });
    return toPage(row);
  }
}

export { PageService as MongoPageService };
