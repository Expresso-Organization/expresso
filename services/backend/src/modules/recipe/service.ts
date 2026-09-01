import { randomUUID } from "node:crypto";
import { Decimal128, type ClientSession } from "mongodb";
import { RecipeEditResultSchema, RecipeEditSchema, RecipeSchema, type Recipe, type RecipeEdit } from "@expresso/contracts";
import { mongoCollections, type JsonObject, type JsonValue, type RecipeDoc, type RecipeEvidencePathDoc, type RecipeItemDoc, type RecipeSectionDoc } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction, type MongoTransaction } from "../../platform/mongo-transaction.js";
import { withTimeout } from "../../platform/timeouts.js";
import { requireActiveUser } from "../identity/index.js";
import { assertActiveRecordsForWrite } from "../career/index.js";
import type { ConsentApi } from "../consent/index.js";
import { DeterministicRecipePlanner, RECIPE_PROMPT_VERSION, type PlannerContext, type PlannerSource, type RecipePlanner } from "./planner.js";
import type { RecipeStream } from "./stream.js";
import type { RecipeApi } from "./index.js";
import { RecipeError } from "./public.js";
import { addMongoRecipeRevision } from "./mongo-revisions.js";
import { readSnapshot, snapshotRefFromStored } from "../../platform/snapshot-payload.js";

const TOTAL_LENGTH = { single: 900, double: 1_800, triple: 2_700 } as const;
const DEFAULT_CONTEXT = { goal: "선택한 근거로 핵심 경험을 설명", points: [] as string[], metrics: [] as string[], format: "narrative", tone: "professional", exclude: ["근거 없는 수치", "출처 없는 주장"], takeaway: "검증된 근거 한 가지", contentPattern: "case-study", interactionOpportunity: null } as const;

export class RecipeService implements RecipeApi {
  readonly planner: RecipePlanner;
  readonly promptVersion: number;
  readonly #stream: RecipeStream | null;
  constructor(readonly context: MongoContext, planner?: RecipePlanner | null, readonly consent: ConsentApi | null = null, stream: RecipeStream | null = null) {
    this.planner = planner ?? new DeterministicRecipePlanner();
    this.promptVersion = planner ? RECIPE_PROMPT_VERSION : 0;
    this.#stream = stream;
  }

  /**
   * 흘려보내다 넘어져도 레시피를 잃지 않는다.
   *
   * Redis가 잠깐 없는 것은 짜던 것을 버릴 이유가 아니다 — 화면이 조용해질 뿐이고,
   * 다 되면 잡의 상태로 넘어간다.
   */
  async #publish(work: Promise<void> | undefined): Promise<void> {
    await work?.catch(() => undefined);
  }

  async #plannerContext(userId: string, brewId: string) {
    const db = mongoCollections(this.context.db); const brew = await db.brews.findOne({ _id: brewId, userId });
    if (!brew) throw new RecipeError(404, "brew not found");
    const analysis = await db.jobAnalyses.findOne({ _id: brew.jobAnalysisId, userId });
    if (!analysis) throw new RecipeError(404, "job analysis not found");
    // 고른 재료는 전부 모델에게 간다. 상한은 고르기 쪽 상한(`UpdateBrewMaterialsSchema`)과 같은 10이다 —
    // 8로 잘려 있던 동안, 10건을 고른 사용자의 2건은 레시피에도 「안 쓴 기록」에도 없이 사라졌다.
    const brewSources = await db.brewSources.find({ userId, brewId, isSelected: true }).sort({ rank: 1, _id: 1 }).limit(10).toArray();
    const records = await db.careerRecords.find({ userId, _id: { $in: brewSources.map(({ recordId }) => recordId) }, deletedAt: null }).toArray();
    const byId = new Map(records.map((record) => [record._id, record])); const orderedRecords = brewSources.flatMap(({ recordId }) => byId.get(recordId) ? [byId.get(recordId)!] : []);
    const requirements = analysis.jobPostingId ? await db.jobPostingRequirements.find({ jobPostingId: analysis.jobPostingId }).sort({ orderNo: 1, _id: 1 }).toArray() : [];
    const interview = await db.interviewSessions.findOne({ userId, brewId });
    const questions = interview ? await db.questions.find({ userId, interviewSessionId: interview._id, active: true }).sort({ orderNo: 1, _id: 1 }).limit(6).toArray() : [];
    const answers = await db.answers.find({ userId, questionId: { $in: questions.map(({ _id }) => _id) } }).toArray(); const answerByQuestion = new Map(answers.map((answer) => [answer.questionId, answer]));
    const orderedAnswers = questions.flatMap(({ _id, text }) => answerByQuestion.get(_id) ? [{ ...answerByQuestion.get(_id)!, prompt: text }] : []);
    const posting = analysis.jobPostingId ? await db.jobPostings.findOne({ _id: analysis.jobPostingId }) : null;
    const company = posting ? await db.companies.findOne({ _id: posting.companyId }) : null;
    const research = company ? await db.companyResearchItems.find({ userId, companyId: company._id }).sort({ kind: 1, capturedAt: -1, _id: 1 }).toArray() : [];
    const sources: PlannerSource[] = [
      ...orderedRecords.map((record) => ({ type: "record" as const, id: record._id, label: record.title, text: record.bodyMd })),
      ...requirements.map((requirement) => ({ type: "requirement" as const, id: requirement._id, label: requirement.label, text: typeof requirement.sourceSpan.quote === "string" ? requirement.sourceSpan.quote : requirement.label })),
      ...orderedAnswers.map((answer) => ({ type: "answer" as const, id: answer._id, label: answer.prompt, text: answer.transcript })),
    ];
    const plannerContext: PlannerContext = {
      sources,
      company: company ? { name: company.name, industry: company.industry ?? null, toneSummary: company.toneSummary ?? null } : null,
      jobTitle: posting?.title ?? null,
      freeTitle: brew.freeTitle ?? null,
      freeBrief: brew.freeBrief ?? null,
      requirements: requirements.map(({ label, kind }) => ({ label, kind })),
      companyResearch: research.map((item) => ({ id: item._id, companyId: item.companyId, kind: item.kind, topic: item.topic, statement: item.statement, sourceUrl: item.sourceUrl ?? null, publishedAt: item.publishedAt?.toISOString() ?? null, capturedAt: item.capturedAt.toISOString(), confidence: item.confidence, basisFactIds: Array.isArray(item.basisFactIds) ? item.basisFactIds.filter((id): id is string => typeof id === "string") : [] })),
      totalLength: TOTAL_LENGTH[brew.lengthPreset] ?? TOTAL_LENGTH.single,
    };
    return { plannerContext, brew, recordIds: orderedRecords.map(({ _id }) => _id) };
  }

  /**
   * `streamId`가 있으면 짜이는 동안을 그리로 흘린다 — 잡의 id다(`RecipeStream`).
   */
  async generate(userId: string, brewId: string, idempotencyKey: string, options: { streamId?: string } = {}) {
    const existing = await mongoCollections(this.context.db).recipes.findOne({ userId, inputIdempotencyKey: idempotencyKey });
    if (existing) return this.getRecipe(userId, existing._id);
    if (this.promptVersion > 0) await this.consent?.require(userId, "recipe_draft");
    const { plannerContext, brew, recordIds } = await this.#plannerContext(userId, brewId);
    const stream = options.streamId ? this.#stream : null; const streamId = options.streamId ?? "";
    const sink = stream ? { delta: (text: string) => { void this.#publish(stream.delta(streamId, text)); }, thinking: (tokens: number) => { void this.#publish(stream.thinking(streamId, tokens)); } } : null;
    await this.#publish(stream?.begin(streamId));
    // 넘어지면 그 자리에서 알린다 — 안 알리면 화면은 끝난 줄도 모르고 계속 기다린다.
    const abandon = async (error: unknown) => { await this.#publish(stream?.failed(streamId, error instanceof Error ? error.name : "RECIPE_PLAN_FAILED")); throw error; };
    const planned = await withTimeout(this.planner.plan(plannerContext, sink), 420_000, "recipe planner").catch(abandon);
    const recipeId = await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId); const db = mongoCollections(tx.db); const options = { session: tx.session };
      const replay = await db.recipes.findOne({ userId, inputIdempotencyKey: idempotencyKey }, options); if (replay) return replay._id;
      await assertActiveRecordsForWrite(tx, userId, recordIds);
      const expectedReferenceVersion = brew.referenceVersion ?? 0;
      const guardedBrew = await db.brews.updateOne({ _id: brewId, userId, $or: [{ referenceVersion: expectedReferenceVersion }, ...(expectedReferenceVersion === 0 ? [{ referenceVersion: { $exists: false } }] : [])] }, { $set: { status: "recipe", updatedAt: new Date() }, $inc: { referenceVersion: 1 } }, options);
      if (!guardedBrew.matchedCount) throw new RecipeError(409, "brew materials changed while planning");
      const version = (await db.recipes.find({ userId, brewId }, options).sort({ version: -1 }).limit(1).next())?.version ?? 0;
      const now = new Date(); const recipe: RecipeDoc = { _id: randomUUID(), userId, brewId, version: version + 1, editVersion: 1, status: "draft", completeness: Decimal128.fromString("100"), generatedAt: now, inputIdempotencyKey: idempotencyKey, updatedAt: now, promptVersion: this.promptVersion };
      const citedNumbers = new Set<number>(); const sections: RecipeSectionDoc[] = []; const items: RecipeItemDoc[] = []; const paths: RecipeEvidencePathDoc[] = [];
      for (const [sectionOrder, section] of planned.draft.sections.entries()) {
        const sectionId = randomUUID(); const evidenceIds = new Set<string>();
        sections.push({ _id: sectionId, userId, recipeId: recipe._id, orderNo: sectionOrder, title: section.title, purpose: section.purpose, targetLength: section.targetLength, context: { goal: section.goal, points: section.points, metrics: section.metrics, format: section.format, tone: section.tone, exclude: section.exclude, takeaway: section.takeaway, contentPattern: section.contentPattern, interactionOpportunity: section.interactionOpportunity }, locked: false, editedBy: "ai", updatedAt: now });
        for (const [itemOrder, item] of section.items.entries()) {
          const cited = [...new Set(item.sources)].flatMap((number) => plannerContext.sources[number - 1] ? [{ number, source: plannerContext.sources[number - 1]! }] : []);
          for (const { number, source } of cited) { citedNumbers.add(number); evidenceIds.add(source.id); }
          const itemId = randomUUID(); items.push({ _id: itemId, userId, recipeSectionId: sectionId, orderNo: itemOrder, pointText: item.pointText, evidence: cited.map(({ source }) => ({ sourceType: source.type, sourceId: source.id })), locked: false, editedBy: "ai", updatedAt: now });
          for (const { source } of cited) paths.push({ _id: randomUUID(), userId, recipeId: recipe._id, recipeItemId: itemId, sourceType: source.type, sourceId: source.id, sourceLabel: source.label.slice(0, 5_000), targetPath: `sections[${sectionOrder}].items[${itemOrder}]`, createdAt: now });
        }
      }
      const manifest = { methodologyVersion: 1, model: planned.usage?.model ?? null, promptVersion: this.promptVersion, attempts: planned.attempts, sourceCounts: { records: plannerContext.sources.filter(({ type }) => type === "record").length, requirements: plannerContext.sources.filter(({ type }) => type === "requirement").length, answers: plannerContext.sources.filter(({ type }) => type === "answer").length, companyResearch: plannerContext.companyResearch.length }, sourceUrls: [...new Set(plannerContext.companyResearch.flatMap(({ sourceUrl }) => sourceUrl ? [sourceUrl] : []))], usage: planned.usage ? { inputTokens: planned.usage.inputTokens, outputTokens: planned.usage.outputTokens, cacheReadTokens: planned.usage.cacheReadTokens, cacheCreationTokens: planned.usage.cacheCreationTokens, durationMs: planned.usage.durationMs, costUsd: planned.usage.costUsd } : null };
      // 설계안은 여기서 만들지 않는다 — 지면의 판단은 03 생성이 지면을 쓰면서 한다.
      recipe.planningManifest = manifest as JsonObject;
      await db.recipes.insertOne(recipe, options); if (sections.length) await db.recipeSections.insertMany(sections, options); if (items.length) await db.recipeItems.insertMany(items, options); if (paths.length) await db.recipeEvidencePaths.insertMany(paths, options);
      const unusedReasons = new Map(planned.draft.unused.map(({ source, reason }) => [source, reason])); const unused = plannerContext.sources.flatMap((source, index) => source.type === "record" && !citedNumbers.has(index + 1) ? [{ _id: randomUUID(), userId, recipeId: recipe._id, recordId: source.id, reason: unusedReasons.get(index + 1) ?? "이번 공고에서 우선순위가 높은 근거를 먼저 배치함", createdAt: now }] : []); if (unused.length) await db.recipeUnusedSources.insertMany(unused, options);
      return recipe._id;
    }).catch(abandon);
    // 마지막에 알린다 — 이걸 받은 화면은 곧바로 진짜 문서를 다시 읽는다.
    await this.#publish(stream?.done(streamId, recipeId));
    return this.getRecipe(userId, recipeId);
  }

  async #load(userId: string, recipeId: string, session?: ClientSession): Promise<Recipe> {
    const db = mongoCollections(this.context.db); const options = session ? { session } : {}; const recipe = await db.recipes.findOne({ _id: recipeId, userId }, options); if (!recipe) throw new RecipeError(404, "recipe not found");
    const sections = await db.recipeSections.find({ userId, recipeId }, options).sort({ orderNo: 1, _id: 1 }).toArray(); const items = await db.recipeItems.find({ userId, recipeSectionId: { $in: sections.map(({ _id }) => _id) } }, options).sort({ orderNo: 1, _id: 1 }).toArray(); const paths = await db.recipeEvidencePaths.find({ userId, recipeId }, options).sort({ targetPath: 1, _id: 1 }).toArray(); const unused = await db.recipeUnusedSources.find({ userId, recipeId }, options).sort({ recordId: 1 }).toArray();
    const mapped = paths.map((path) => ({ id: path._id, sourceType: path.sourceType, sourceId: path.sourceId, sourceLabel: path.sourceLabel, recipeItemId: path.recipeItemId, targetPath: path.targetPath }));
    return RecipeSchema.parse({ id: recipe._id, brewId: recipe.brewId, version: recipe.version, status: recipe.status, completeness: Number(recipe.completeness.toString()), sections: sections.map((section) => ({ id: section._id, order: section.orderNo, title: section.title, purpose: section.purpose, targetLength: section.targetLength, context: section.context, locked: section.locked, editedBy: section.editedBy, items: items.filter(({ recipeSectionId }) => recipeSectionId === section._id).map((item) => ({ id: item._id, order: item.orderNo, pointText: item.pointText, locked: item.locked, editedBy: item.editedBy, evidence: mapped.filter(({ recipeItemId }) => recipeItemId === item._id) })) })), evidencePaths: mapped, unusedSources: unused.map(({ recordId, reason }) => ({ recordId, reason })), portfolioPlan: recipe.portfolioPlan ?? null, planningManifest: recipe.planningManifest ?? null, updatedAt: recipe.updatedAt.toISOString() });
  }
  getRecipe(userId: string, recipeId: string) { return this.#load(userId, recipeId); }

  async edit(userId: string, recipeId: string, editValue: RecipeEdit) {
    const edit = RecipeEditSchema.parse(editValue); let revisionId = ""; let diff: Array<{ path: string; before?: unknown; after?: unknown }> = [];
    await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId); const db = mongoCollections(tx.db); const options = { session: tx.session }; const recipe = await db.recipes.findOne({ _id: recipeId, userId }, options); if (!recipe) throw new RecipeError(404, "recipe not found");
      const before = await this.#load(userId, recipeId, tx.session); const sections = await db.recipeSections.find({ userId, recipeId }, options).sort({ orderNo: 1, _id: 1 }).toArray(); const sectionById = new Map(sections.map((section) => [section._id, section]));
      const guard = await db.recipes.updateOne({ _id: recipeId, userId, editVersion: recipe.editVersion ?? 1 }, { $set: { updatedAt: new Date() }, $inc: { editVersion: 1 } }, options); if (!guard.matchedCount) throw new RecipeError(409, "recipe changed concurrently");
      if (edit.operation === "move_section") { if (!sectionById.has(edit.sectionId)) throw new RecipeError(404, "recipe section not found"); const ids = sections.map(({ _id }) => _id).filter((id) => id !== edit.sectionId); ids.splice(Math.min(edit.toOrder, ids.length), 0, edit.sectionId); await db.recipeSections.updateMany({ userId, recipeId }, { $inc: { orderNo: 1_000 } }, options); for (const [orderNo, id] of ids.entries()) await db.recipeSections.updateOne({ _id: id, userId }, { $set: { orderNo, editedBy: "user", locked: true, updatedAt: new Date() } }, options); diff = [{ path: "sections.order", before: sections.map(({ _id }) => _id), after: ids }]; }
      else if (edit.operation === "add_section") { const id = randomUUID(); await db.recipeSections.insertOne({ _id: id, userId, recipeId, orderNo: sections.length, title: edit.title, purpose: edit.purpose, targetLength: 300, context: DEFAULT_CONTEXT as unknown as JsonObject, locked: true, editedBy: "user", updatedAt: new Date() }, options); diff = [{ path: `sections.${id}`, after: edit.title }]; }
      else if (edit.operation === "delete_section") { const section = sectionById.get(edit.sectionId); if (!section) throw new RecipeError(404, "recipe section not found"); if (sections.length === 1) throw new RecipeError(409, "recipe must keep one section"); const itemIds = (await db.recipeItems.find({ userId, recipeSectionId: section._id }, options).project<{ _id: string }>({ _id: 1 }).toArray()).map(({ _id }) => _id); if (itemIds.length) { await db.recipeEvidencePaths.deleteMany({ userId, recipeId, recipeItemId: { $in: itemIds } }, options); await db.recipeItems.deleteMany({ userId, _id: { $in: itemIds } }, options); } await db.recipeSections.deleteOne({ _id: section._id, userId }, options); diff = [{ path: `sections.${section._id}`, before: section.title }]; }
      else if (edit.operation === "update_item") { const item = await this.#findItem(tx, userId, recipeId, edit.itemId); await db.recipeItems.updateOne({ _id: item._id, userId }, { $set: { pointText: edit.pointText, locked: true, editedBy: "user", updatedAt: new Date() } }, options); diff = [{ path: `items.${item._id}.pointText`, before: item.pointText, after: edit.pointText }]; }
      else if (edit.operation === "move_item") { const item = await this.#findItem(tx, userId, recipeId, edit.itemId); const items = await db.recipeItems.find({ userId, recipeSectionId: item.recipeSectionId }, options).sort({ orderNo: 1, _id: 1 }).toArray(); const ids = items.map(({ _id }) => _id).filter((id) => id !== item._id); ids.splice(Math.min(edit.toOrder, ids.length), 0, item._id); await db.recipeItems.updateMany({ userId, recipeSectionId: item.recipeSectionId }, { $inc: { orderNo: 1_000 } }, options); for (const [orderNo, id] of ids.entries()) await db.recipeItems.updateOne({ _id: id, userId }, { $set: { orderNo, locked: true, editedBy: "user", updatedAt: new Date() } }, options); diff = [{ path: `sections.${item.recipeSectionId}.items.order`, before: items.map(({ _id }) => _id), after: ids }]; }
      else if (edit.operation === "add_item") { if (!sectionById.has(edit.sectionId)) throw new RecipeError(404, "recipe section not found"); const source = await db.recipeEvidencePaths.findOne({ _id: edit.sourcePathId, userId, recipeId }, options); if (!source) throw new RecipeError(404, "recipe evidence path not found"); const orderNo = await db.recipeItems.countDocuments({ userId, recipeSectionId: edit.sectionId }, options); const id = randomUUID(); await db.recipeItems.insertOne({ _id: id, userId, recipeSectionId: edit.sectionId, orderNo, pointText: edit.pointText, evidence: [{ sourceType: source.sourceType, sourceId: source.sourceId }], locked: true, editedBy: "user", updatedAt: new Date() }, options); await db.recipeEvidencePaths.insertOne({ _id: randomUUID(), userId, recipeId, recipeItemId: id, sourceType: source.sourceType, sourceId: source.sourceId, sourceLabel: source.sourceLabel, targetPath: `sections.${edit.sectionId}.items.${id}`, createdAt: new Date() }, options); diff = [{ path: `items.${id}`, after: edit.pointText }]; }
      else if (edit.operation === "delete_item") { const item = await this.#findItem(tx, userId, recipeId, edit.itemId); await db.recipeEvidencePaths.deleteMany({ userId, recipeId, recipeItemId: item._id }, options); await db.recipeItems.deleteOne({ _id: item._id, userId }, options); diff = [{ path: `items.${item._id}`, before: item.pointText }]; }
      else { const match = edit.instruction.match(/^(?:section|섹션)\s*(\d+)\s*(?:title|제목)\s*[:：]\s*(.+)$/i); if (!match) throw new RecipeError(409, "instruction is ambiguous; use 'section N title: ...'"); const section = sections.find(({ orderNo }) => orderNo === Number(match[1]) - 1); if (!section) throw new RecipeError(404, "instruction section not found"); const title = match[2]!.trim(); await db.recipeSections.updateOne({ _id: section._id, userId }, { $set: { title, locked: true, editedBy: "user", updatedAt: new Date() } }, options); diff = [{ path: `sections.${section._id}.title`, before: section.title, after: title }]; }
      revisionId = await addMongoRecipeRevision(tx, { userId, recipeId, action: edit.operation, snapshot: before as unknown as JsonObject, diff: diff as JsonValue[] });
    });
    return RecipeEditResultSchema.parse({ recipe: await this.getRecipe(userId, recipeId), revisionId, diff });
  }

  async #findItem(tx: MongoTransaction, userId: string, recipeId: string, itemId: string) { const db = mongoCollections(tx.db); const options = { session: tx.session }; const item = await db.recipeItems.findOne({ _id: itemId, userId }, options); if (!item || !await db.recipeSections.findOne({ _id: item.recipeSectionId, userId, recipeId }, options)) throw new RecipeError(404, "recipe item not found"); return item; }

  async restoreItem(userId: string, recipeId: string, revisionId: string, itemId: string) { const revision = await mongoCollections(this.context.db).recipeRevisions.findOne({ _id: revisionId, userId, recipeId }); if (!revision) throw new RecipeError(404, "item is not present in revision snapshot"); const snapshot = await readSnapshot(this.context, snapshotRefFromStored(revision.snapshot)) as { sections?: Array<{ items: Array<{ id: string; pointText: string }> }> }; const previous = snapshot.sections?.flatMap(({ items }) => items).find(({ id }) => id === itemId); if (!previous) throw new RecipeError(404, "item is not present in revision snapshot"); return this.edit(userId, recipeId, { operation: "update_item", itemId, pointText: previous.pointText }); }
}

export { RecipeService as MongoRecipeService };
