import { randomUUID } from "node:crypto";

import {
  GeneratedPageSchema,
  PAGE_PROMPT_VERSION,
  PageStyleGrammarSchema,
  PortfolioArchetypeSchema,
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
  RevertPageRevisionSchema,
  type RevertPageRevision,
  PAGE_REVERTIBLE_CHANGE_KINDS,
  AddStructuredSectionSchema,
  type AddStructuredSection,
  type StructuredElementStyle,
  type StructuredPortfolioSnapshot,
  type PageEditorDesign,
  type PageGenerationFormat,
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
import { brewPageSources } from "./brew-sources.js";
import { findDesignSnippet } from "./design-chat/service.js";
import { PageElementIssues, PageServiceError } from "./public.js";
import type { PageStream } from "./stream.js";
import type { PageRefineInput, PageRefineOutcome } from "./structured-generator.js";
import {
  applyElementEdit,
  checkElementEdit,
  elementGuide,
  markdownToText,
  recordCaseType,
  recordInsertIndex,
  recordSectionByRule,
  type AgentElementEdit,
  type ElementChange,
  type PageElementEditor,
} from "./element-edit.js";
import { elementTitle } from "@expresso/portfolio-renderer";
import { changedElementKeys, describeChange, revertChange, sameValue } from "./structured-history.js";

type StoredChange = NonNullable<GeneratedPageDoc["change"]>;

/**
 * `change` 칸이 생기기 전에 저장된 판의 변경을 추정합니다. 생성 작업이 있으면 생성, 다른 판이 다듬어 낸 판이면 다듬기, 저장 때
 * 남긴 지시문의 모양으로 직접 편집 · 기록 추가 · 복원을 가립니다. 지시문이 남은 나머지는 에이전트 고침입니다.
 */
function legacyChange(row: GeneratedPageDoc, refinedIds: ReadonlySet<string>): StoredChange {
  if (row.change) return row.change;
  const instruction = row.instruction?.trim() ?? "";
  if (row.generationJobId || row.revision === 0) return { actor: "ai", kind: "generated", summary: "지면 생성" };
  if (refinedIds.has(row._id)) return { actor: "ai", kind: "refined", summary: "AI가 화면을 보고 다듬음" };
  if (instruction === "구성·문장 직접 편집") return { actor: "user", kind: "edited", summary: "직접 편집" };
  if (instruction.startsWith("기록 추가:")) return { actor: "user", kind: "record", summary: instruction.slice(0, 200) };
  if (/^판 \d+로 되돌림$/.test(instruction)) return { actor: "user", kind: "restored", summary: instruction };
  // 지시문만 남은 옛 판은 에이전트 고침인지 지시로 다시 만든 판인지 가릴 수 없다. 스냅샷만 무르면 다시 만든 판이 섞이므로
  // 되돌리기 대상(element)으로 두지 않고 복원으로만 돌아가게 한다.
  if (instruction) return { actor: "ai", kind: "generated", summary: `지시로 고침: “${[...instruction].slice(0, 60).join("")}”` };
  return { actor: "ai", kind: "refined", summary: "AI가 화면을 보고 다듬음" };
}

/** 저장된 판의 지면 스냅샷. 계약으로 읽어, 옛 스키마로 저장된 판도 지금 판과 같은 모양(기본값 포함)으로 비교한다. */
function structuredOf(row: GeneratedPageDoc): StructuredPortfolioSnapshot | undefined {
  return toPage(row).generationManifest?.structured;
}

/** 저장한 초안을 다듬는 쪽입니다. 워커가 `StructuredPageGenerator`를 넘깁니다. */
export interface PageRefiner {
  refine(input: PageRefineInput): Promise<PageRefineOutcome>;
}

function toPage(row: GeneratedPageDoc): GeneratedPage {
  return GeneratedPageSchema.parse({
    id: row._id, portfolioId: row.portfolioId, generationJobId: row.generationJobId ?? null,
    html: row.html, css: row.css, ...(row.script ? { script: row.script } : {}), rationale: row.rationale, promptVersion: row.promptVersion,
    revision: row.revision, qualityStatus: row.qualityStatus, qaReport: row.qaReport,
    generationManifest: Object.keys(row.generationManifest).length > 0 ? row.generationManifest : null,
    styleSpec: row.styleSpecSnapshot ?? null, createdAt: row.createdAt.toISOString(),
    ...(row.refinement ? { refinement: row.refinement } : {}),
    ...(row.change ? { change: { ...row.change, keys: [] } } : {}),
  });
}

/**
 * 바탕 판을 이어 새 판 문서를 만듭니다. 다듬는 중(pending) 표시는 옮기지 않습니다 — 새 판을 다듬을 작업은 예약되지 않으므로
 * 옮기면 화면의 「AI가 다듬는 중」이 끝나지 않습니다. 끝난 다듬기 상태는 그대로 옮깁니다.
 */
function nextRevision(base: GeneratedPageDoc, changes: Partial<GeneratedPageDoc> & { revision?: number; change: StoredChange }): GeneratedPageDoc {
  const { refinement, ...rest } = base;
  return {
    ...rest,
    ...(refinement && refinement.status !== "pending" ? { refinement } : {}),
    _id: randomUUID(), generationJobId: null, revision: base.revision + 1, createdAt: new Date(),
    ...changes,
  };
}

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
  /**
   * 판 목록. 최신 판이 먼저입니다. 판마다 무엇을 바꿨는지(`change`)를 싣고, 바뀐 요소 키는 바로 앞 판과 비교해 계산합니다.
   * `change`가 없는 옛 판은 목록 전체를 보고 추정합니다 — 다듬어 낸 판은 초안이 가리키는 판이라 한 판만 봐서는 알 수 없습니다.
   */
  async history(userId: string, portfolioId: string): Promise<GeneratedPage[]> {
    const rows = await mongoCollections(this.context.db).generatedPages.find({ userId, portfolioId }).sort({ revision: -1 }).toArray();
    const refinedIds = new Set(rows.flatMap((row) => (row.refinement?.status === "adopted" && row.refinement.revisionId ? [row.refinement.revisionId] : [])));
    return rows.map((row, index) => {
      const change = legacyChange(row, refinedIds);
      const before = rows[index + 1] ? structuredOf(rows[index + 1]!) : undefined;
      const after = structuredOf(row);
      let keys: string[] = [];
      let summary = change.summary;
      if (before && after) {
        try {
          keys = changedElementKeys(before, after);
          // 옛 직접 편집은 「직접 편집」만 남아 있습니다. 두 판을 비교해 무엇을 고쳤는지 부릅니다.
          if (!row.change && change.kind === "edited") summary = describeChange(before, after);
        } catch { keys = []; }
      }
      return GeneratedPageSchema.parse({ ...toPage(row), change: { ...change, summary, keys } });
    });
  }
  async document(userId: string, portfolioId: string): Promise<string | null> {
    const db = mongoCollections(this.context.db);
    const row = await db.generatedPages.find({ userId, portfolioId, qualityStatus: "ready" }).sort({ revision: -1 }).limit(1).next();
    if (!row) return null;
    const portfolio = await db.portfolios.findOne({ _id: portfolioId, userId });
    return pageDocument({ html: row.html, css: row.css, title: portfolio?.title ?? "포트폴리오", description: row.rationale, ...(isPageStyleGrammar(row.styleSpecSnapshot) ? { grammar: row.styleSpecSnapshot } : {}) });
  }

  async #context(userId: string, portfolioId: string, instruction: string | undefined, previous: { html: string; css: string; script?: string | undefined } | undefined): Promise<PageGenerationContext> {
    const db = mongoCollections(this.context.db);
    const portfolio = await db.portfolios.findOne({ _id: portfolioId, userId });
    if (!portfolio) throw new PageServiceError(404, "portfolio not found");
    // 레시피 · 근거 · 공고는 제작에서 읽습니다. 디자인 대화도 같은 자료를 읽습니다(`brew-sources.ts`).
    const sources = await brewPageSources(this.context.db, userId, portfolio.brewId);
    const { records } = sources;
    const template = await db.templates.findOne({ _id: portfolio.templateId });
    const composed = template ? composeTemplateStyle(template.style, portfolio.styleOverrides) : null;
    const preset = template ? findPortfolioStyle(template.code) : undefined;
    // 디자인 시스템 판으로 만든 포트폴리오는 템플릿 이름 대신 고른 디자인의 이름을 남깁니다.
    const design = portfolio.designSystemRevisionId ? findDesignSystemRevision(portfolio.designSystemRevisionId)?.spec.identity ?? null : null;
    // 디자인 대화에서 고른 첫 화면으로 만든 포트폴리오는 그 첫 화면을 지면의 맨 앞에 그대로 둡니다. 스타일의 이름도 그것을 따릅니다.
    const snippet = portfolio.designSnippetId ? await findDesignSnippet(this.context.db, userId, portfolio.brewId, portfolio.designSnippetId) : null;
    const style: PageStyleGrammar | undefined = composed && template ? {
      name: snippet?.name ?? design?.name ?? template.name, description: snippet?.note ?? design?.description ?? template.description,
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
    const pageSections = await db.portfolioSections.find({ userId, portfolioId }).toArray();
    const mediaBlocks = await db.blocks.find({ userId, portfolioSectionId: { $in: pageSections.map(item => item._id) }, kind: "media" }).toArray();
    const supplied = mediaBlocks.flatMap(item => { const parsed = PortfolioMediaSchema.safeParse(item.content); return parsed.success ? [{ id: parsed.data.assetId, alt: parsed.data.alt }] : []; });
    for (const record of records) for (const match of record.bodyMd.matchAll(/\/v1\/media\/([a-f0-9-]{36})/gi)) supplied.push({ id: match[1]!, alt: record.title });
    const assets = await db.mediaAssets.find({ userId, _id: { $in: supplied.map(item => item.id) }, storageKey: { $ne: "" } }).toArray();
    const media = [...new Map(supplied.flatMap(item => { const asset = assets.find(value => value._id === item.id); return asset ? [[item.id, { src: `${PAGE_IMAGE_SRC_PREFIX}${asset._id}`, srcSet: "", alt: item.alt, width: asset.width, height: asset.height }] as const] : []; })).values()];
    return {
      userId,
      ...(sources.author ? { author: sources.author } : {}),
      portfolioPlan: sources.portfolioPlan,
      ...(style ? { style } : {}),
      design: findPortfolioDesign(portfolio),
      ...(PortfolioArchetypeSchema.safeParse(portfolio.archetype).success ? { archetype: PortfolioArchetypeSchema.parse(portfolio.archetype) } : {}),
      sections: sources.sections,
      evidence: sources.evidence,
      media, jobTitle: sources.jobTitle,
      company: sources.company,
      ...(snippet ? { seed: { name: snippet.name, words: snippet.note || snippet.words, tokens: snippet.tokens, html: snippet.html, css: snippet.css, script: snippet.script } } : {}),
      instruction, previous, useKit: !preset, modelTier: "sonnet",
    };
  }

  async generate(userId: string, portfolioId: string, generator: PageGenerator, options: { instruction?: string; generationJobId?: string; streamId?: string; pageFormat?: PageGenerationFormat | null } = {}): Promise<GeneratedPage> {
    if (!await this.owns(userId, portfolioId)) throw new PageServiceError(404, "portfolio not found");
    if (options.generationJobId) { const existing = await this.forGenerationJob(userId, options.generationJobId); if (existing) return existing; }
    const current = await this.latest(userId, portfolioId);
    const context = await this.#context(userId, portfolioId, options.instruction, current ? { html: current.html, css: current.css, script: current.script } : undefined);
    if (context.previous && current?.generationManifest?.structured) {
      context.previous.structured = current.generationManifest.structured;
      context.structuredContent = current.generationManifest.structured.content;
    }
    if (options.pageFormat) context.pageFormat = options.pageFormat;
    // 키트 없이 만드는 지면은 스타일 문법에 그 사실을 적습니다. 생성 중 미리보기(스트림 `begin`)와 저장하는 스냅샷이 이 값을 쓰고,
    // 지면 문서가 키트 CSS를 싣지 않습니다.
    if (context.style && generator.usesKit?.(context) === false) context.style = { ...context.style, kit: false };
    await this.#consent?.require(userId, "page_generation");
    const streamId = options.streamId ?? portfolioId; const stream = this.#stream;
    // 쓰기는 기다리지 않고 순서대로 쌓습니다. Redis 연결 하나의 명령은 보낸 순서로 처리됩니다.
    const sink: PageStreamSink | null = stream ? {
      delta: (value) => { void this.#publish(stream.delta(streamId, value)); },
      thinking: (tokens) => { void this.#publish(stream.thinking(streamId, tokens)); },
      blueprint: (page) => { void this.#publish(stream.blueprint(streamId, page)); },
      seed: (page) => { void this.#publish(stream.seed(streamId, page)); },
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
        // 지시로 고친 지면이 스크립트를 내지 않았으면 직전 판의 그림을 잇는다. 고치라는 말에 그림이 사라지면 안 된다.
        ...((result.script ?? (options.instruction ? context.previous?.script : undefined)) ? { script: (result.script ?? context.previous?.script)! } : {}),
        instruction: options.instruction ?? null, promptVersion: PAGE_PROMPT_VERSION,
        ungroundedNumbers: result.ungrounded, removed: result.removed, qualityStatus: result.qaReport.status,
        qaReport: result.qaReport as unknown as JsonObject, generationManifest: result.manifest as unknown as JsonObject,
        portfolioPlanSnapshot: context.portfolioPlan as unknown as JsonObject | null,
        styleSpecSnapshot: context.style as unknown as JsonObject | null,
        designPrinciplesVersion: DESIGN_PRINCIPLES_VERSION, createdAt: now,
        // 구조화 초안은 저장과 함께 다듬기를 예약합니다. 사용자는 초안을 먼저 보고, 워커가 이어서 다듬습니다.
        ...(result.manifest.structured ? { refinement: { status: "pending" as const } } : {}),
        change: {
          actor: "ai", kind: "generated",
          summary: options.instruction ? `지시로 다시 만듦: “${[...options.instruction.trim()].slice(0, 60).join("")}”` : "지면 생성",
        },
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
        change: { actor: "ai", kind: "refined", summary: "AI가 화면을 보고 다듬음" },
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
    return toPage(await this.#commitStructured(userId, portfolioId, input.expectedRevision, snapshot, {
      instruction: "구성·문장 직접 편집",
      change: { actor: "user", kind: "edited", summary: describeChange(previous, snapshot) },
    }));
  }

  /**
   * 에이전트가 요소 하나를 고치기 전에 읽는 설명입니다. 최신 판의 구조화 지면을 봅니다. 고칠 수 없는 요소면 그 이유를 `PageElementIssues`로 냅니다.
   */
  async elementGuide(userId: string, portfolioId: string, key: string) {
    const { previous, design } = await this.#latestStructured(userId, portfolioId);
    const guide = elementGuide(previous, key, design);
    if (!guide) throw new PageElementIssues([`'${key}'는 말로 고칠 수 있는 요소가 아닙니다. 지면 목차(outline)의 key를 쓰십시오.`]);
    return guide;
  }

  /**
   * 에이전트가 쓴 고침을 검사해 최신 판 위에 새 판으로 쌓습니다. AI를 다시 부르지 않습니다. 걸린 항목은 저장하지 않고 `PageElementIssues`로
   * 돌려줍니다 — 에이전트가 같은 대화에서 그 항목만 고쳐 다시 부릅니다. 고친 요소 밖의 Spec과 글은 그대로입니다.
   */
  async editElementByAgent(userId: string, portfolioId: string, key: string, input: AgentElementEdit, note: { instruction: string; rationale: string }): Promise<{ page: GeneratedPage; changes: ElementChange[]; label: string }> {
    const { current, previous, design } = await this.#latestStructured(userId, portfolioId);
    const checked = checkElementEdit(previous, key, input, design);
    if (checked.issues.length || !("snapshot" in checked)) throw new PageElementIssues(checked.issues);
    const row = await this.#commitStructured(userId, portfolioId, current.revision, checked.snapshot, {
      instruction: note.instruction.slice(0, 2_000), rationale: note.rationale.slice(0, 400),
      change: { actor: "ai", kind: "element", summary: describeChange(previous, checked.snapshot) },
    });
    return { page: toPage(row), changes: checked.changes, label: elementTitle(previous, key).title };
  }

  /** 최신 판이 구조화 지면일 때 그 스냅샷입니다. 에이전트는 판 번호를 모르므로 지금 최신 판을 기준으로 합니다. */
  async #latestStructured(userId: string, portfolioId: string) {
    const current = await this.latest(userId, portfolioId);
    if (!current) throw new PageServiceError(404, "지면이 없습니다.");
    if (!current.generationManifest?.structured) throw new PageElementIssues(["이 포트폴리오는 구조화 지면이 아니라 요소를 고칠 수 없습니다."]);
    return this.#structured(userId, portfolioId, current.revision);
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
      section = (await editor.writeSection({ userId, ...source })).section;
    } else section = recordSectionByRule(source);
    const spec = structuredClone(previous.spec);
    const root = spec.elements[spec.root];
    if (root?.type !== "PortfolioPage") throw new PageServiceError(409, "페이지 루트가 없습니다.");
    const key = `section-${record._id}`;
    spec.elements[key] = { type: recordCaseType(root.props.archetype), props: { section: { $state: `/sectionById/${record._id}` } }, children: [] } as (typeof spec.elements)[string];
    root.children.splice(recordInsertIndex(spec), 0, key);
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
    return toPage(await this.#commitStructured(userId, portfolioId, input.expectedRevision, snapshot, {
      instruction: `기록 추가: ${source.title}`, rationale: `「${source.title}」 기록을 사례로 더했습니다.`,
      change: { actor: "user", kind: "record", summary: [...`기록 추가: ${source.title}`].slice(0, 200).join("") },
    }));
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
  async #commitStructured(userId: string, portfolioId: string, expectedRevision: number, snapshot: StructuredPortfolioSnapshot, note: { instruction: string; rationale?: string; change: StoredChange }): Promise<GeneratedPageDoc> {
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
        instruction: note.instruction, ...(note.rationale ? { rationale: note.rationale } : {}), change: note.change,
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
      const created = nextRevision(source, {
        revision: latest.revision + 1, instruction: `판 ${input.revision + 1}로 되돌림`, rationale: `판 ${input.revision + 1}로 되돌렸습니다.`,
        change: { actor: "user", kind: "restored", summary: `판 ${input.revision + 1}로 복원` },
      });
      await db.generatedPages.insertOne(created, options);
      await db.portfolios.updateOne({ _id: portfolioId, userId }, { $set: { updatedAt: new Date() } }, options);
      return created;
    });
    return toPage(row);
  }

  /**
   * 판 하나의 변경만 무른다. 그 판이 바꾼 칸을 그 앞 판의 값으로 돌려 최신 판 위에 새 판으로 쌓는다. 그 뒤에 같은 칸을 또
   * 고쳤으면 묻지 않고 덮지 않는다 — `force` 없이는 409로 되묻고, 사용자가 한 번 더 누르면 덮는다.
   */
  async revertRevision(userId: string, portfolioId: string, raw: RevertPageRevision): Promise<GeneratedPage> {
    const input = RevertPageRevisionSchema.parse(raw);
    const { previous: current } = await this.#structured(userId, portfolioId, input.expectedRevision);
    if (input.revision > input.expectedRevision) throw new PageServiceError(404, "그 판이 없습니다.");
    const db = mongoCollections(this.context.db);
    const [target, prior] = await Promise.all([
      db.generatedPages.findOne({ userId, portfolioId, revision: input.revision }),
      db.generatedPages.findOne({ userId, portfolioId, revision: input.revision - 1 }),
    ]);
    if (!target || !prior) throw new PageServiceError(404, "그 판이 없습니다.");
    // 옛 판이 다듬어 낸 판인지는 그 판을 가리키는 초안으로 가린다.
    const draft = target.change ? null : await db.generatedPages.findOne({ userId, portfolioId, "refinement.revisionId": target._id });
    const refinedIds = new Set(draft ? [target._id] : []);
    const change = legacyChange(target, refinedIds);
    if (!PAGE_REVERTIBLE_CHANGE_KINDS.has(change.kind)) throw new PageServiceError(409, "이 판은 「복원」으로 판 전체를 되돌려 주세요.");
    const before = structuredOf(prior), changed = structuredOf(target);
    if (!before || !changed) throw new PageServiceError(409, "구조화 지면의 변경만 하나씩 되돌릴 수 있습니다.");
    const merged = revertChange(before, changed, current, input.force ?? false);
    if (merged.conflicts.length && !input.force) {
      throw new PageServiceError(409, "그 뒤에 이 자리를 또 고쳤습니다. 되돌리면 그 편집이 사라집니다.", { reason: "revert_conflict", paths: merged.conflicts.slice(0, 20) });
    }
    let snapshot: StructuredPortfolioSnapshot;
    try { snapshot = validateStructuredPortfolio(merged.spec, merged.content); }
    catch (error) { throw new PageServiceError(422, error instanceof Error && /\p{Script=Hangul}/u.test(error.message) ? error.message : "되돌린 지면이 올바르지 않습니다. 「복원」으로 판 전체를 되돌려 주세요."); }
    if (sameValue(snapshot.spec, current.spec) && sameValue(snapshot.content, current.content)) throw new PageServiceError(409, "되돌릴 변경이 없습니다.");
    return toPage(await this.#commitStructured(userId, portfolioId, input.expectedRevision, snapshot, {
      instruction: `판 ${input.revision + 1}의 변경 되돌림`,
      rationale: `판 ${input.revision + 1}의 변경을 되돌렸습니다.`,
      // 되돌린 것을 다시 무르면 처음 변경을 다시 적용한 것이다. 「되돌림: 되돌림: …」으로 쌓지 않는다.
      change: { actor: "user", kind: "reverted", summary: [...(change.summary.startsWith("되돌림: ") ? `다시 적용: ${change.summary.slice(5)}` : `되돌림: ${change.summary}`)].slice(0, 200).join("") },
    }));
  }
}

export { PageService as MongoPageService };
