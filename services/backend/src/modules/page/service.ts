import { randomUUID } from "node:crypto";

import {
  GeneratedPageSchema,
  PAGE_PROMPT_VERSION,
  PageStyleGrammarSchema,
  PortfolioArchetypeSchema,
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
  RestorePageRevisionSchema,
  type RestorePageRevision,
  AddStructuredSectionSchema,
  InstructStructuredElementSchema,
  type AddStructuredSection,
  type InstructStructuredElement,
  type StructuredElementStyle,
  type StructuredPortfolioSnapshot,
  type PageEditorDesign,
} from "@expresso/contracts";
import { renderStructuredPortfolio, librarySelection, styleProblems } from "@expresso/portfolio-renderer";
import { mongoCollections, type GeneratedPageDoc, type JsonObject } from "@expresso/database";

import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import { addMongoOutboxEvent } from "../../platform/mongo-outbox.js";
import type { ConsentApi } from "../consent/index.js";
import { findDesignSystemRevision, findPortfolioDesign } from "../design-systems/index.js";
import { requireActiveUser } from "../identity/index.js";
import { DESIGN_PRINCIPLES_VERSION, type PageGenerationContext, type PageGenerator, type PageStreamSink } from "./generator.js";
import { PageServiceError } from "./public.js";
import type { PageStream } from "./stream.js";
import type { PageRefineInput, PageRefineOutcome } from "./structured-generator.js";
import {
  applyElementEdit,
  elementChanges,
  markdownToText,
  recordCaseType,
  recordSectionByRule,
  type ElementChange,
  type PageElementEditor,
} from "./element-edit.js";

/** 저장한 초안을 다듬는 쪽입니다. 워커가 `StructuredPageGenerator`를 넘깁니다. */
export interface PageRefiner {
  refine(input: PageRefineInput): Promise<PageRefineOutcome>;
}

function toPage(row: GeneratedPageDoc): GeneratedPage {
  return GeneratedPageSchema.parse({
    id: row._id, portfolioId: row.portfolioId, generationJobId: row.generationJobId ?? null,
    html: row.html, css: row.css, rationale: row.rationale, promptVersion: row.promptVersion,
    revision: row.revision, qualityStatus: row.qualityStatus, qaReport: row.qaReport,
    generationManifest: Object.keys(row.generationManifest).length > 0 ? row.generationManifest : null,
    styleSpec: row.styleSpecSnapshot ?? null, createdAt: row.createdAt.toISOString(),
    ...(row.refinement ? { refinement: row.refinement } : {}),
  });
}

/**
 * 바탕 판을 이어 새 판 문서를 만듭니다. 다듬는 중(pending) 표시는 옮기지 않습니다 — 새 판을 다듬을 작업은 예약되지 않으므로
 * 옮기면 화면의 「AI가 다듬는 중」이 끝나지 않습니다. 끝난 다듬기 상태는 그대로 옮깁니다.
 */
function nextRevision(base: GeneratedPageDoc, changes: Partial<GeneratedPageDoc> & { revision?: number }): GeneratedPageDoc {
  const { refinement, ...rest } = base;
  return {
    ...rest,
    ...(refinement && refinement.status !== "pending" ? { refinement } : {}),
    _id: randomUUID(), generationJobId: null, revision: base.revision + 1, createdAt: new Date(),
    ...changes,
  };
}

/** 지면 끝에 모이는 보조 요소입니다. 기록으로 더한 사례는 이 요소들 앞에 둡니다. */
const SUPPORT_TYPES = new Set(["CareerTimeline", "EvidenceGrid", "Contact"]);

/** `1rem` · `18px` 같은 길이를 px로 읽습니다. 읽지 못하면 무한대로 두어 맨 뒤에 놓습니다. */
function cssPixels(value: string): number {
  const match = /^(\d*\.?\d+)(rem|em|px)$/.exec(value.trim());
  if (!match) return Number.POSITIVE_INFINITY;
  return Number(match[1]) * (match[2] === "px" ? 1 : 16);
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
    // 디자인 시스템 판으로 만든 포트폴리오는 템플릿 이름 대신 고른 디자인의 이름을 남깁니다.
    const design = portfolio.designSystemRevisionId ? findDesignSystemRevision(portfolio.designSystemRevisionId)?.spec.identity ?? null : null;
    const style: PageStyleGrammar | undefined = composed && template ? {
      name: design?.name ?? template.name, description: design?.description ?? template.description,
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
      userId,
      ...(author ? { author: { name: author.displayName } } : {}),
      portfolioPlan: recipe.portfolioPlan ? PortfolioPlanSchema.parse(recipe.portfolioPlan) : null,
      ...(style ? { style } : {}),
      design: findPortfolioDesign(portfolio),
      ...(PortfolioArchetypeSchema.safeParse(portfolio.archetype).success ? { archetype: PortfolioArchetypeSchema.parse(portfolio.archetype) } : {}),
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
    // 쓰기는 기다리지 않고 순서대로 쌓습니다. Redis 연결 하나의 명령은 보낸 순서로 처리됩니다.
    const sink: PageStreamSink | null = stream ? {
      delta: (value) => { void this.#publish(stream.delta(streamId, value)); },
      thinking: (tokens) => { void this.#publish(stream.thinking(streamId, tokens)); },
      blueprint: (page) => { void this.#publish(stream.blueprint(streamId, page)); },
      fill: (path, text, done, revised) => { void this.#publish(stream.fill(streamId, path, text, done, revised ?? false)); },
      stage: (name) => { void this.#publish(stream.stage(streamId, name)); },
    } : null;
    await this.#publish(stream?.begin(streamId, JSON.stringify(context.style ?? null)));
    let result;
    try { result = await generator.generate(context, sink); }
    catch (error) { await this.#publish(stream?.failed(streamId, error instanceof Error ? error.name : "PAGE_GENERATION_FAILED")); throw error; }
    result = await this.#carryStyles(userId, portfolioId, current?.generationManifest?.structured?.spec, result);
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
        // 구조화 초안은 저장과 함께 다듬기를 예약합니다. 사용자는 초안을 먼저 보고, 워커가 이어서 다듬습니다.
        ...(result.manifest.structured ? { refinement: { status: "pending" as const } } : {}),
      };
      await db.generatedPages.insertOne(created, transactionOptions);
      if (created.refinement) await addMongoOutboxEvent(tx, { userId, topic: "page.refine", payload: { userId, pageId: created._id }, idempotencyKey: `page-refine:${created._id}` });
      return created;
    });
    await this.#publish(stream?.done(streamId, row._id));
    if (result.removed.length > 0) console.error(JSON.stringify({ level: "warn", event: "page.sanitized", portfolioId, removed: result.removed }));
    return toPage(row);
  }

  /**
   * 지시를 붙여 다시 만든 지면에 사용자가 직접 고친 글자 모양을 옮깁니다. 모델은 모양을 쓰지 않으므로, 같은 키 · 같은 부품인
   * 요소에만 옮기고 다시 그립니다. 옮길 것이 없거나 다시 그리지 못하면 생성 결과를 그대로 둡니다.
   */
  async #carryStyles<T extends { html: string; css: string; manifest: { structured?: StructuredPortfolioSnapshot | undefined } }>(userId: string, portfolioId: string, before: StructuredPortfolioSnapshot["spec"] | undefined, result: T): Promise<T> {
    const after = result.manifest.structured;
    // 수집 원본으로 그린 판은 키트를 쓰지 않아 글자 모양 규칙이 없습니다.
    if (!before || !after || Object.values(after.spec.elements).some((node) => "sourceId" in node.props && node.props.sourceId)) return result;
    const spec = structuredClone(after.spec);
    let carried = 0;
    for (const [key, node] of Object.entries(before.elements)) {
      const style = (node.props as { style?: StructuredElementStyle }).style;
      const target = spec.elements[key];
      if (!style || !target || target.type !== node.type) continue;
      (target.props as { style?: StructuredElementStyle }).style = style;
      carried++;
    }
    if (!carried) return result;
    const owner = await mongoCollections(this.context.db).portfolios.findOne({ _id: portfolioId, userId });
    if (!owner) return result;
    try {
      const snapshot = validateStructuredPortfolio(spec, after.content);
      const rendered = renderStructuredPortfolio(snapshot.spec, snapshot.content, { design: findPortfolioDesign(owner) });
      return { ...result, html: rendered.html, css: rendered.css, manifest: { ...result.manifest, structured: snapshot } };
    } catch (error) {
      console.error(JSON.stringify({ level: "warn", event: "page.style_carry_failed", portfolioId, detail: error instanceof Error ? error.message : String(error) }));
      return result;
    }
  }

  async #publish(work: Promise<void> | undefined): Promise<void> {
    if (!work) return;
    try { await work; } catch (error) { console.error(JSON.stringify({ level: "warn", event: "page.stream_failed", detail: error instanceof Error ? error.message : String(error) })); }
  }

  /**
   * 예약된 초안을 다듬습니다(워커 `page.refine`).
   *
   * 초안이 더는 최신 판이 아니면(사용자가 고쳤거나 다시 뽑았으면) 손대지 않습니다. 채택하면 새 판을 저장하고,
   * 아니면 초안에 결과와 이유만 남깁니다. 재전달로 다시 와도 `pending`이 아니면 바로 끝냅니다.
   */
  async refine(userId: string, pageId: string, refiner: PageRefiner | null): Promise<void> {
    const db = mongoCollections(this.context.db);
    const draft = await db.generatedPages.findOne({ _id: pageId, userId });
    if (!draft || draft.refinement?.status !== "pending") return;
    const mark = (refinement: NonNullable<GeneratedPageDoc["refinement"]>, review?: PageRefineOutcome["review"]) =>
      db.generatedPages.updateOne(
        { _id: pageId, userId, "refinement.status": "pending" },
        { $set: { refinement, ...(review ? { "generationManifest.visualReview": review as unknown as JsonObject } : {}) } },
      );
    const latestId = async () => (await db.generatedPages.find({ userId, portfolioId: draft.portfolioId }).sort({ revision: -1 }).limit(1).next())?._id;
    if (await latestId() !== draft._id) { await mark({ status: "superseded" }); return; }
    if (!refiner) { await mark({ status: "skipped", reason: "AI가 꺼져 있습니다." }); return; }
    const structured = toPage(draft).generationManifest?.structured;
    const owner = await db.portfolios.findOne({ _id: draft.portfolioId, userId });
    if (!structured || !owner) { await mark({ status: "skipped", reason: "구조화 지면이 아닙니다." }); return; }
    try { await this.#consent?.require(userId, "page_review"); }
    catch (error) { await mark({ status: "skipped", reason: error instanceof Error ? error.message.slice(0, 1_000) : "동의가 필요합니다." }); return; }
    const root = structured.spec.elements[structured.spec.root] as { props?: { archetype?: unknown } } | undefined;
    const archetype = PortfolioArchetypeSchema.safeParse(root?.props?.archetype);
    let outcome: PageRefineOutcome;
    try {
      outcome = await refiner.refine({
        userId,
        snapshot: structured,
        design: findPortfolioDesign(owner),
        style: isPageStyleGrammar(draft.styleSpecSnapshot) ? draft.styleSpecSnapshot : undefined,
        archetype: archetype.success ? archetype.data : undefined,
        instruction: draft.instruction ?? undefined,
      });
    } catch (error) {
      await mark({ status: "failed", reason: (error instanceof Error ? error.message : String(error)).slice(0, 1_000) });
      return;
    }
    const result = outcome.result;
    if (outcome.status !== "adopted" || !result) {
      await mark({ status: outcome.status, ...(outcome.review.reason ? { reason: outcome.review.reason.slice(0, 1_000) } : {}) }, outcome.review);
      return;
    }
    const saved = await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const collections = mongoCollections(tx.db); const options = { session: tx.session };
      const latest = await collections.generatedPages.find({ userId, portfolioId: draft.portfolioId }, options).sort({ revision: -1 }).limit(1).next();
      // 다듬는 동안 사용자가 지면을 고쳤으면 덮지 않습니다.
      if (!latest || latest._id !== draft._id) return null;
      const created: GeneratedPageDoc = {
        _id: randomUUID(), userId, portfolioId: draft.portfolioId, generationJobId: null,
        html: result.html, css: result.css, rationale: result.rationale, revision: draft.revision + 1,
        instruction: draft.instruction ?? null, promptVersion: PAGE_PROMPT_VERSION,
        ungroundedNumbers: result.ungrounded, removed: result.removed, qualityStatus: result.qaReport.status,
        qaReport: result.qaReport as unknown as JsonObject, generationManifest: result.manifest as unknown as JsonObject,
        portfolioPlanSnapshot: draft.portfolioPlanSnapshot ?? null, styleSpecSnapshot: draft.styleSpecSnapshot ?? null,
        designPrinciplesVersion: DESIGN_PRINCIPLES_VERSION, createdAt: new Date(),
      };
      await collections.generatedPages.insertOne(created, options);
      await collections.generatedPages.updateOne(
        { _id: draft._id, userId },
        { $set: { refinement: { status: "adopted", revisionId: created._id }, "generationManifest.visualReview": outcome.review as unknown as JsonObject } },
        options,
      );
      return created;
    });
    if (!saved) await mark({ status: "superseded" }, outcome.review);
  }

  async editComposition(userId: string, portfolioId: string, raw: EditStructuredPage): Promise<GeneratedPage> {
    const input = EditStructuredPageSchema.parse(raw);
    const { previous, design } = await this.#structured(userId, portfolioId, input.expectedRevision);
    let snapshot;
    try {
      const content = applyStructuredTextPatches(previous.content, input.patches);
      snapshot = validateStructuredPortfolio(input.spec ?? previous.spec, content);
      // 직접 고친 글자 모양은 그 요소의 부분과 이 디자인의 단계만 씁니다.
      const problems = Object.values(snapshot.spec.elements).flatMap((node) => styleProblems(node.type, (node.props as { style?: StructuredElementStyle }).style, design));
      if (problems.length) throw new Error(problems.join(" "));
    } catch (error) { throw new PageServiceError(422, error instanceof Error ? error.message : "구성이 올바르지 않습니다."); }
    return toPage(await this.#commitStructured(userId, portfolioId, input.expectedRevision, snapshot, { instruction: "구성·문장 직접 편집" }));
  }

  /**
   * 고른 요소 하나를 말로 고칩니다. 고친 요소 밖의 Spec과 글은 그대로입니다. 결과는 새 판이고, 화면은 바뀐 곳 목록을 함께 받습니다.
   */
  async instructElement(userId: string, portfolioId: string, key: string, raw: InstructStructuredElement, editor: PageElementEditor | null): Promise<{ page: GeneratedPage; changes: ElementChange[]; note: string }> {
    const input = InstructStructuredElementSchema.parse(raw);
    if (!editor) throw new PageServiceError(503, "AI가 꺼져 있어 말로 고칠 수 없습니다.");
    const { previous, design } = await this.#structured(userId, portfolioId, input.expectedRevision);
    if (!previous.spec.elements[key] || key === previous.spec.root) throw new PageServiceError(404, "고칠 요소가 없습니다.");
    await this.#consent?.require(userId, "partial_edit");
    const { edit, note } = await editor.instruct({ snapshot: previous, key, instruction: input.instruction, design });
    let snapshot;
    // 같은 대화에서 고친 뒤에도 남은 위반은 저장하지 않고 알립니다. 출력을 버리고 다시 쓰게 하지 않습니다.
    try { snapshot = applyElementEdit(previous, key, edit, design); }
    catch (error) { throw new PageServiceError(422, error instanceof Error ? error.message : "지면 규칙에 맞지 않습니다."); }
    const changes = elementChanges(previous, snapshot, key);
    if (!changes.length) throw new PageServiceError(422, `바꾼 곳이 없습니다. ${note}`);
    const row = await this.#commitStructured(userId, portfolioId, input.expectedRevision, snapshot, { instruction: input.instruction, rationale: note });
    return { page: toPage(row), changes, note };
  }

  /**
   * 커리어 기록 하나를 지면의 새 사례로 더합니다. 사례는 최상위의 경력 · 근거 자료 · 연락처 앞에 둡니다. AI가 있으면 기록을 읽고 사례 글을 쓰고,
   * 없으면 기록 제목과 본문을 그대로 넣습니다.
   */
  async addRecordSection(userId: string, portfolioId: string, raw: AddStructuredSection, editor: PageElementEditor | null): Promise<GeneratedPage> {
    const input = AddStructuredSectionSchema.parse(raw);
    const { previous } = await this.#structured(userId, portfolioId, input.expectedRevision);
    const record = await mongoCollections(this.context.db).careerRecords.findOne({ _id: input.recordId, userId, deletedAt: null });
    if (!record) throw new PageServiceError(404, "기록이 없습니다.");
    const used = previous.content.sections.some((section) => section.id === record._id || section.sourceIds.includes(record._id))
      || previous.content.evidence.some((item) => item.id === record._id);
    if (used) throw new PageServiceError(409, "이미 지면에 쓰인 기록입니다.");
    const text = markdownToText(record.bodyMd);
    if (!text) throw new PageServiceError(422, "본문이 비어 있는 기록입니다.");
    const source = { id: record._id, title: record.title || "제목 없는 기록", text };
    let section;
    if (editor) {
      await this.#consent?.require(userId, "page_generation");
      section = (await editor.writeSection(source)).section;
    } else section = recordSectionByRule(source);
    const spec = structuredClone(previous.spec);
    const root = spec.elements[spec.root];
    if (root?.type !== "PortfolioPage") throw new PageServiceError(409, "페이지 루트가 없습니다.");
    const key = `section-${record._id}`;
    spec.elements[key] = { type: recordCaseType(root.props.archetype), props: { section: { $state: `/sectionById/${record._id}` } }, children: [] } as (typeof spec.elements)[string];
    // 사례들 뒤, 경력 · 근거 자료 · 연락처 같은 보조 요소 앞에 둡니다.
    const supportAt = root.children.findIndex((child) => SUPPORT_TYPES.has(spec.elements[child]?.type ?? ""));
    root.children.splice(supportAt === -1 ? root.children.length : supportAt, 0, key);
    // 근거 자료 목록이 있는 지면이면 기록을 근거로도 더해 사례에서 이어지게 합니다. 없는 지면에 목록을 새로 만들지 않습니다.
    const hasEvidence = Object.values(spec.elements).some((node) => node.type === "EvidenceGrid");
    const content = {
      ...previous.content,
      sections: [...previous.content.sections, { ...section, sourceIds: hasEvidence ? [record._id] : [] }],
      evidence: hasEvidence
        ? [...previous.content.evidence, { id: record._id, title: source.title, kind: "기록", summary: section.summary.slice(0, 100), body: [...text].slice(0, 300).join("") }]
        : previous.content.evidence,
    };
    let snapshot;
    try { snapshot = validateStructuredPortfolio(spec, content); }
    catch (error) { throw new PageServiceError(422, error instanceof Error ? error.message : "지면에 더할 수 없습니다."); }
    return toPage(await this.#commitStructured(userId, portfolioId, input.expectedRevision, snapshot, { instruction: `기록 추가: ${source.title}`, rationale: `「${source.title}」 기록을 사례로 더했습니다.` }));
  }

  /** 편집 화면이 고를 수 있는 이 포트폴리오 디자인의 글자 크기 단계 · 색 · 서체입니다. */
  async editorDesign(userId: string, portfolioId: string): Promise<PageEditorDesign> {
    const owner = await mongoCollections(this.context.db).portfolios.findOne({ _id: portfolioId, userId });
    if (!owner) throw new PageServiceError(404, "portfolio not found");
    const design = findPortfolioDesign(owner);
    return {
      // 디자인의 단계는 역할 순서(본문 · 눈썹 · 제목 …)로 적혀 있습니다. 화면의 크기 조절은 작은 것부터 큰 것으로 걷습니다.
      steps: design.typography.scale
        .map((step) => ({ name: step.name, size: step.size }))
        .sort((a, b) => cssPixels(a.size) - cssPixels(b.size)),
      colors: { text: design.colors.text.value, muted: design.colors.muted.value, accent: design.colors.accent.value },
      fonts: { display: design.typography.display.family, body: design.typography.body.family, mono: design.typography.mono.family },
    };
  }

  /**
   * 편집 화면이 그릴 최신 판입니다. 저장된 스냅샷을 지금 렌더러로 다시 그려 요소 키 표시(`data-xp-key`)를 답니다.
   * 표시가 생기기 전에 저장된 판도 지면에서 바로 고를 수 있습니다. 아무것도 저장하지 않습니다. 다음 편집이 같은 렌더러로
   * 새 판을 저장하므로, 배포 문서와 이 그림은 첫 편집부터 같습니다.
   */
  async editableRender(userId: string, portfolioId: string): Promise<{ revision: number; html: string; css: string } | null> {
    const current = await this.latest(userId, portfolioId);
    const snapshot = current?.generationManifest?.structured;
    if (!current || !snapshot) return null;
    if (current.html.includes("data-xp-key=")) return { revision: current.revision, html: current.html, css: current.css };
    const owner = await mongoCollections(this.context.db).portfolios.findOne({ _id: portfolioId, userId });
    if (!owner) return null;
    try {
      const rendered = renderStructuredPortfolio(snapshot.spec, snapshot.content, {
        design: findPortfolioDesign(owner),
        theme: isPageStyleGrammar(current.styleSpec) ? current.styleSpec : undefined,
      });
      return { revision: current.revision, ...rendered };
    } catch {
      return { revision: current.revision, html: current.html, css: current.css };
    }
  }

  /** 구조화 지면을 고치기 전 확인입니다. 최신 판 번호가 맞고 구조화 지면이어야 합니다. */
  async #structured(userId: string, portfolioId: string, expectedRevision: number) {
    const current = await this.latest(userId, portfolioId);
    if (!current) throw new PageServiceError(404, "지면이 없습니다.");
    if (current.revision !== expectedRevision) throw new PageServiceError(409, "다른 편집이 먼저 저장됐습니다. 새로고침해 주세요.");
    const previous = current.generationManifest?.structured;
    if (!previous) throw new PageServiceError(409, "구조화 지면에서만 구성을 편집할 수 있습니다.");
    const owner = await mongoCollections(this.context.db).portfolios.findOne({ _id: portfolioId, userId });
    if (!owner) throw new PageServiceError(404, "portfolio not found");
    return { current, previous, owner, design: findPortfolioDesign(owner) };
  }

  /** 고친 스냅샷을 생성 때와 같은 디자인으로 다시 그려 새 판으로 쌓습니다. */
  async #commitStructured(userId: string, portfolioId: string, expectedRevision: number, snapshot: StructuredPortfolioSnapshot, note: { instruction: string; rationale?: string }): Promise<GeneratedPageDoc> {
    const { current, owner } = await this.#structured(userId, portfolioId, expectedRevision);
    let rendered;
    try {
      // 수집 원본으로 그린 판은 렌더러가 저장된 사용자 색을 씁니다.
      rendered = renderStructuredPortfolio(snapshot.spec, snapshot.content, {
        design: findPortfolioDesign(owner),
        theme: isPageStyleGrammar(current.styleSpec) ? current.styleSpec : undefined,
      });
    } catch (error) { throw new PageServiceError(422, error instanceof Error ? error.message : "구성이 올바르지 않습니다."); }
    return inTransaction(this.context, async tx => {
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
      if (!latest || latest.revision !== expectedRevision) throw new PageServiceError(409, "다른 편집이 먼저 저장됐습니다.");
      const created = nextRevision(latest, {
        html: rendered.html, css: rendered.css,
        styleSpecSnapshot: latest.styleSpecSnapshot ? { ...latest.styleSpecSnapshot, structure } : null,
        instruction: note.instruction, ...(note.rationale ? { rationale: note.rationale } : {}),
        generationManifest: { ...latest.generationManifest, structured: snapshot, library: librarySelection(snapshot.spec) } as unknown as JsonObject,
      });
      await db.generatedPages.insertOne(created, options);
      return created;
    });
  }

  /**
   * 고른 판의 내용을 새 판으로 쌓는다. 다듬는 중(pending)이던 판은 그 상태를 옮기지
   * 않는다 — 옛 판을 다시 다듬지 않는다. 끝난 다듬기 상태는 그대로 옮겨, 다듬기 전
   * 초안을 되돌린 판이 「다듬은 판」으로 보이지 않게 한다.
   */
  async restoreRevision(userId: string, portfolioId: string, raw: RestorePageRevision): Promise<GeneratedPage> {
    const input = RestorePageRevisionSchema.parse(raw);
    const row = await inTransaction(this.context, async tx => {
      await requireActiveUser(tx, userId);
      const db = mongoCollections(tx.db), options = { session: tx.session };
      const latest = await db.generatedPages.find({ userId, portfolioId }, options).sort({ revision: -1 }).limit(1).next();
      if (!latest) throw new PageServiceError(404, "지면이 없습니다.");
      if (latest.revision !== input.expectedRevision) throw new PageServiceError(409, "다른 편집이 먼저 저장됐습니다. 새로고침해 주세요.");
      if (input.revision === latest.revision) throw new PageServiceError(409, "지금 보고 있는 판입니다.");
      const source = await db.generatedPages.findOne({ userId, portfolioId, revision: input.revision }, options);
      if (!source) throw new PageServiceError(404, "그 판이 없습니다.");
      const created = nextRevision(source, { revision: latest.revision + 1, instruction: `판 ${input.revision + 1}로 되돌림`, rationale: `판 ${input.revision + 1}로 되돌렸습니다.` });
      await db.generatedPages.insertOne(created, options);
      await db.portfolios.updateOne({ _id: portfolioId, userId }, { $set: { updatedAt: new Date() } }, options);
      return created;
    });
    return toPage(row);
  }
}

export { PageService as MongoPageService };
