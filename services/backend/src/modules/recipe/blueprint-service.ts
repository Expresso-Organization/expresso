import { randomUUID } from "node:crypto";

import {
  BlueprintEditSchema,
  BlueprintReorderSchema,
  PortfolioIntentSchema,
  RecipeV2Schema,
  defaultPresentationVariant,
  presentationVariantsFor,
  type BlueprintEdit,
  type BlueprintElementKind,
  type BlueprintReorder,
  type PortfolioIntent,
  type RecipeV2,
} from "@expresso/contracts";
import {
  mongoCollections,
  type JsonObject,
  type JsonValue,
  type RecipeElementDoc,
  type RecipeSectionDoc,
} from "@expresso/database";
import { Decimal128 } from "mongodb";

import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction, type MongoTransaction } from "../../platform/mongo-transaction.js";
import { requireActiveUser } from "../identity/index.js";
import { addMongoRecipeRevision } from "./mongo-revisions.js";
import { RecipeError } from "./public.js";

/**
 * 02 레시피 — Recipe v2 블루프린트.
 *
 * v1 서비스(`service.ts`)와 나란히 산다. v1은 「무슨 말을 할지」의 목록을
 * 만들고, 여기는 「무엇을 어떤 모양으로 어떤 근거로 보여줄지」를 저장한다.
 * 기준은 `docs/architecture/portfolio-creation-flow-v2.md` §7 이다.
 */

const SCHEMA_VERSION = 2;

/** v1 섹션이 요구하는 자리. v2 섹션도 같은 컬렉션에 살아 이 값을 채워 둔다. */
const V1_SECTION_CONTEXT = {
  goal: "", points: [], metrics: [], format: "narrative", tone: "professional",
  exclude: [], takeaway: "검증된 근거 한 가지", contentPattern: "case-study",
  interactionOpportunity: null,
} as const;

const EMPTY_INTENT: PortfolioIntent = {
  role: "", audience: "", highlight: "", lengthPreset: "single",
  extraRequest: "", jobPostingId: null,
};

/** 요소 종류가 처음 놓일 때의 크기와 무게. 종류가 뜻하는 자리에 맞춘다. */
const ELEMENT_DEFAULTS: Record<BlueprintElementKind, { emphasis: RecipeV2["sections"][number]["elements"][number]["emphasis"]; width: RecipeV2["sections"][number]["elements"][number]["width"]; targetLength: number }> = {
  hero: { emphasis: "primary", width: "full", targetLength: 160 },
  project: { emphasis: "primary", width: "wide", targetLength: 400 },
  metric: { emphasis: "secondary", width: "narrow", targetLength: 60 },
  chart: { emphasis: "secondary", width: "content", targetLength: 80 },
  timeline: { emphasis: "secondary", width: "content", targetLength: 240 },
  skills: { emphasis: "supporting", width: "content", targetLength: 120 },
  text: { emphasis: "secondary", width: "content", targetLength: 320 },
  gallery: { emphasis: "secondary", width: "wide", targetLength: 80 },
  quote: { emphasis: "supporting", width: "content", targetLength: 120 },
  profile: { emphasis: "supporting", width: "narrow", targetLength: 160 },
  contact: { emphasis: "supporting", width: "full", targetLength: 120 },
};

function intentOf(stored: unknown): PortfolioIntent {
  const parsed = PortfolioIntentSchema.safeParse(stored);
  return parsed.success ? parsed.data : EMPTY_INTENT;
}

export class BlueprintService {
  constructor(readonly context: MongoContext) {}

  /**
   * 02 화면이 열릴 때 부른다. 이 제작의 v2 블루프린트가 없으면 만든다.
   *
   * v1 레시피가 이미 있으면 그것을 요소 모양으로 옮겨 온다 — 공고 기반으로
   * 시작한 제작이 02에서 빈 지면을 만나지 않게 한다(§10.4 legacy adapter).
   */
  async open(userId: string, brewId: string): Promise<RecipeV2> {
    const db = mongoCollections(this.context.db);
    const brew = await db.brews.findOne({ _id: brewId, userId });
    if (!brew) throw new RecipeError(404, "brew not found");
    const existing = await db.recipes
      .find({ userId, brewId, schemaVersion: SCHEMA_VERSION })
      .sort({ version: -1, _id: -1 })
      .limit(1)
      .next();
    if (existing) return this.#load(userId, existing._id);

    const legacy = await db.recipes
      .find({ userId, brewId, schemaVersion: { $exists: false } })
      .sort({ version: -1, _id: -1 })
      .limit(1)
      .next();
    const analysis = await db.jobAnalyses.findOne({ _id: brew.jobAnalysisId, userId });

    const recipeId = await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const scoped = mongoCollections(tx.db);
      const options = { session: tx.session };
      const replay = await scoped.recipes
        .find({ userId, brewId, schemaVersion: SCHEMA_VERSION }, options)
        .sort({ version: -1, _id: -1 })
        .limit(1)
        .next();
      if (replay) return replay._id;

      const now = new Date();
      const id = randomUUID();
      const version = ((await scoped.recipes.find({ userId, brewId }, options).sort({ version: -1 }).limit(1).next())?.version ?? 0) + 1;
      await scoped.recipes.insertOne({
        _id: id, userId, brewId, version, editVersion: 1, status: "draft",
        completeness: Decimal128.fromString("0"), generatedAt: now, updatedAt: now,
        promptVersion: 0, schemaVersion: SCHEMA_VERSION,
        designSystemRevisionId: brew.designSystemRevisionId ?? null,
        title: brew.freeTitle ?? null,
        intent: {
          ...EMPTY_INTENT,
          lengthPreset: brew.lengthPreset,
          highlight: brew.freeBrief ?? "",
          jobPostingId: analysis?.jobPostingId ?? null,
        } as unknown as JsonObject,
      }, options);

      if (legacy) await this.#adoptLegacy(tx, userId, legacy._id, id);
      return id;
    });
    return this.#load(userId, recipeId);
  }

  /** v1 레시피의 섹션과 항목을 v2 섹션·요소로 옮긴다. 원본은 그대로 둔다. */
  async #adoptLegacy(tx: MongoTransaction, userId: string, legacyRecipeId: string, recipeId: string): Promise<void> {
    const db = mongoCollections(tx.db);
    const options = { session: tx.session };
    const sections = await db.recipeSections.find({ userId, recipeId: legacyRecipeId }, options).sort({ orderNo: 1, _id: 1 }).toArray();
    if (!sections.length) return;
    const items = await db.recipeItems.find({ userId, recipeSectionId: { $in: sections.map(({ _id }) => _id) } }, options).sort({ orderNo: 1, _id: 1 }).toArray();
    const paths = await db.recipeEvidencePaths.find({ userId, recipeId: legacyRecipeId }, options).toArray();
    const now = new Date();
    const newSections: RecipeSectionDoc[] = [];
    const elements: RecipeElementDoc[] = [];
    const sources: Array<{ _id: string; userId: string; recipeId: string; recipeElementId: string; sourceType: "record" | "answer" | "requirement"; sourceId: string; role: "primary" | "supporting"; orderNo: number; createdAt: Date }> = [];

    for (const [order, section] of sections.entries()) {
      const sectionId = randomUUID();
      const takeaway = typeof section.context["takeaway"] === "string" ? section.context["takeaway"] : "";
      newSections.push({
        _id: sectionId, userId, recipeId, orderNo: order, title: section.title,
        purpose: section.purpose, targetLength: section.targetLength, takeaway,
        context: { ...V1_SECTION_CONTEXT } as unknown as JsonObject,
        locked: false, editedBy: "ai", updatedAt: now,
      });
      const own = items.filter(({ recipeSectionId }) => recipeSectionId === section._id);
      for (const [elementOrder, item] of own.entries()) {
        // v1 항목은 「무슨 말을 할지」다. 종류는 아직 모르니 본문으로 앉히고
        // 사용자가 02에서 바꾼다. 없는 판단을 지어내지 않는다.
        const kind: BlueprintElementKind = "text";
        const elementId = randomUUID();
        elements.push({
          _id: elementId, userId, recipeId, recipeSectionId: sectionId, orderNo: elementOrder,
          kind, intent: item.pointText.slice(0, 1_000), takeaway: "",
          presentationVariant: defaultPresentationVariant(kind),
          ...ELEMENT_DEFAULTS[kind], settings: {}, note: "", updatedAt: now,
        });
        const bound = paths.filter(({ recipeItemId }) => recipeItemId === item._id);
        for (const [sourceOrder, path] of bound.entries()) {
          sources.push({
            _id: randomUUID(), userId, recipeId, recipeElementId: elementId,
            sourceType: path.sourceType, sourceId: path.sourceId,
            role: sourceOrder === 0 ? "primary" : "supporting", orderNo: sourceOrder, createdAt: now,
          });
        }
      }
    }
    await db.recipeSections.insertMany(newSections, options);
    if (elements.length) await db.recipeElements.insertMany(elements, options);
    if (sources.length) await db.recipeElementSources.insertMany(sources, options);
  }

  async get(userId: string, recipeId: string): Promise<RecipeV2> {
    return this.#load(userId, recipeId);
  }

  async #load(userId: string, recipeId: string): Promise<RecipeV2> {
    const db = mongoCollections(this.context.db);
    const recipe = await db.recipes.findOne({ _id: recipeId, userId });
    if (!recipe || recipe.schemaVersion !== SCHEMA_VERSION) throw new RecipeError(404, "blueprint not found");
    const [sections, elements, sources, media, unused, brewSources] = await Promise.all([
      db.recipeSections.find({ userId, recipeId }).sort({ orderNo: 1, _id: 1 }).toArray(),
      db.recipeElements.find({ userId, recipeId }).sort({ orderNo: 1, _id: 1 }).toArray(),
      db.recipeElementSources.find({ userId, recipeId }).sort({ orderNo: 1, _id: 1 }).toArray(),
      db.recipeElementMedia.find({ userId, recipeId }).sort({ orderNo: 1, _id: 1 }).toArray(),
      db.recipeUnusedSources.find({ userId, recipeId }).sort({ recordId: 1 }).toArray(),
      db.brewSources.find({ userId, brewId: recipe.brewId, isSelected: true }).sort({ rank: 1, recordId: 1 }).toArray(),
    ]);
    const intent = intentOf(recipe.intent);
    const posting = intent.jobPostingId ? await db.jobPostings.findOne({ _id: intent.jobPostingId }) : null;
    const company = posting ? await db.companies.findOne({ _id: posting.companyId }) : null;

    return RecipeV2Schema.parse({
      schemaVersion: SCHEMA_VERSION,
      id: recipe._id,
      brewId: recipe.brewId,
      version: recipe.version,
      editVersion: recipe.editVersion ?? 1,
      designSystemRevisionId: recipe.designSystemRevisionId ?? null,
      title: recipe.title ?? "",
      intent,
      jobPosting: posting && company ? {
        jobPostingId: posting._id,
        title: posting.title,
        companyName: company.name,
        sourceUrl: posting.sourceUrl ?? null,
        deadlineNote: posting.deadlineNote ?? null,
        expiresAt: posting.expiresAt?.toISOString() ?? null,
      } : null,
      selectedRecordIds: brewSources.map(({ recordId }) => recordId),
      sections: sections.map((section) => ({
        id: section._id,
        order: section.orderNo,
        title: section.title,
        purpose: section.purpose,
        takeaway: section.takeaway ?? "",
        elements: elements
          .filter(({ recipeSectionId }) => recipeSectionId === section._id)
          .map((element) => ({
            id: element._id,
            order: element.orderNo,
            kind: element.kind,
            intent: element.intent,
            takeaway: element.takeaway,
            presentationVariant: element.presentationVariant,
            emphasis: element.emphasis,
            width: element.width,
            targetLength: element.targetLength,
            sourceBindings: sources
              .filter(({ recipeElementId }) => recipeElementId === element._id)
              .map(({ sourceType, sourceId, role, orderNo }) => ({ sourceType, sourceId, role, order: orderNo })),
            mediaBindings: media
              .filter(({ recipeElementId }) => recipeElementId === element._id)
              .map(({ mediaId, orderNo }) => ({ mediaId, order: orderNo })),
            settings: element.settings,
            note: element.note,
          })),
      })),
      unusedSources: unused.map(({ recordId, reason }) => ({ recordId, reason })),
      status: recipe.status,
      updatedAt: recipe.updatedAt.toISOString(),
    });
  }

  /** 낙관적 잠금. 편집마다 editVersion 이 하나 오른다. */
  async #guard(tx: MongoTransaction, userId: string, recipeId: string) {
    const db = mongoCollections(tx.db);
    const options = { session: tx.session };
    const recipe = await db.recipes.findOne({ _id: recipeId, userId }, options);
    if (!recipe || recipe.schemaVersion !== SCHEMA_VERSION) throw new RecipeError(404, "blueprint not found");
    const guard = await db.recipes.updateOne(
      { _id: recipeId, userId, editVersion: recipe.editVersion ?? 1 },
      { $set: { updatedAt: new Date() }, $inc: { editVersion: 1 } },
      options,
    );
    if (!guard.matchedCount) throw new RecipeError(409, "blueprint changed concurrently");
    return recipe;
  }

  async edit(userId: string, recipeId: string, editValue: BlueprintEdit) {
    const edit = BlueprintEditSchema.parse(editValue);
    const before = await this.#load(userId, recipeId);
    let revisionId = "";
    await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      await this.#guard(tx, userId, recipeId);
      await this.#apply(tx, userId, recipeId, edit);
      revisionId = await addMongoRecipeRevision(tx, {
        userId, recipeId, action: edit.operation,
        snapshot: before as unknown as JsonObject, diff: [] as JsonValue[],
      });
    });
    return { recipe: await this.#load(userId, recipeId), revisionId };
  }

  async #apply(tx: MongoTransaction, userId: string, recipeId: string, edit: BlueprintEdit): Promise<void> {
    const db = mongoCollections(tx.db);
    const options = { session: tx.session };
    const now = new Date();

    if (edit.operation === "update_intent") {
      if (edit.intent.jobPostingId && !await db.jobPostings.findOne({ _id: edit.intent.jobPostingId }, options)) {
        throw new RecipeError(404, "job posting not found");
      }
      await db.recipes.updateOne({ _id: recipeId, userId }, { $set: { intent: edit.intent as unknown as JsonObject } }, options);
      return;
    }
    if (edit.operation === "update_title") {
      await db.recipes.updateOne({ _id: recipeId, userId }, { $set: { title: edit.title } }, options);
      return;
    }
    if (edit.operation === "add_section") {
      const orderNo = await db.recipeSections.countDocuments({ userId, recipeId }, options);
      await db.recipeSections.insertOne({
        _id: randomUUID(), userId, recipeId, orderNo, title: edit.title, purpose: edit.purpose,
        targetLength: 0, takeaway: "", context: { ...V1_SECTION_CONTEXT } as unknown as JsonObject,
        locked: true, editedBy: "user", updatedAt: now,
      }, options);
      return;
    }
    if (edit.operation === "update_section") {
      const section = await db.recipeSections.findOne({ _id: edit.sectionId, userId, recipeId }, options);
      if (!section) throw new RecipeError(404, "blueprint section not found");
      const patch: Partial<RecipeSectionDoc> = { editedBy: "user", locked: true, updatedAt: now };
      if (edit.title !== undefined) patch.title = edit.title;
      if (edit.purpose !== undefined) patch.purpose = edit.purpose;
      if (edit.takeaway !== undefined) patch.takeaway = edit.takeaway;
      await db.recipeSections.updateOne({ _id: section._id, userId }, { $set: patch }, options);
      return;
    }
    if (edit.operation === "delete_section") {
      const section = await db.recipeSections.findOne({ _id: edit.sectionId, userId, recipeId }, options);
      if (!section) throw new RecipeError(404, "blueprint section not found");
      const elementIds = (await db.recipeElements.find({ userId, recipeSectionId: section._id }, options).project<{ _id: string }>({ _id: 1 }).toArray()).map(({ _id }) => _id);
      if (elementIds.length) {
        await db.recipeElementSources.deleteMany({ userId, recipeElementId: { $in: elementIds } }, options);
        await db.recipeElementMedia.deleteMany({ userId, recipeElementId: { $in: elementIds } }, options);
        await db.recipeElements.deleteMany({ userId, _id: { $in: elementIds } }, options);
      }
      await db.recipeSections.deleteOne({ _id: section._id, userId }, options);
      await this.#renumberSections(tx, userId, recipeId);
      return;
    }
    if (edit.operation === "add_element") {
      if (!await db.recipeSections.findOne({ _id: edit.sectionId, userId, recipeId }, options)) {
        throw new RecipeError(404, "blueprint section not found");
      }
      const siblings = await db.recipeElements.find({ userId, recipeSectionId: edit.sectionId }, options).sort({ orderNo: 1, _id: 1 }).toArray();
      const at = Math.min(edit.order ?? siblings.length, siblings.length);
      const id = randomUUID();
      const ids = siblings.map(({ _id }) => _id);
      ids.splice(at, 0, id);
      await db.recipeElements.insertOne({
        _id: id, userId, recipeId, recipeSectionId: edit.sectionId, orderNo: siblings.length + 1_000,
        kind: edit.kind, intent: "", takeaway: "",
        presentationVariant: defaultPresentationVariant(edit.kind),
        ...ELEMENT_DEFAULTS[edit.kind], settings: {}, note: "", updatedAt: now,
      }, options);
      await this.#writeOrder(tx, userId, edit.sectionId, ids);
      return;
    }
    if (edit.operation === "update_element") {
      const element = await db.recipeElements.findOne({ _id: edit.elementId, userId, recipeId }, options);
      if (!element) throw new RecipeError(404, "blueprint element not found");
      const patch: Partial<RecipeElementDoc> = { updatedAt: now };
      if (edit.kind !== undefined) {
        patch.kind = edit.kind;
        // 종류가 바뀌면 표시 방식의 갈래도 바뀐다. 같은 요청에서 함께 오지
        // 않았고 지금 값이 새 갈래에 없으면 그 갈래의 첫 번째로 내린다.
        const allowed = presentationVariantsFor(edit.kind);
        const next = edit.presentationVariant ?? element.presentationVariant;
        patch.presentationVariant = allowed.some(({ id }) => id === next) ? next : defaultPresentationVariant(edit.kind);
      } else if (edit.presentationVariant !== undefined) {
        const allowed = presentationVariantsFor(element.kind as BlueprintElementKind);
        if (!allowed.some(({ id }) => id === edit.presentationVariant)) {
          throw new RecipeError(409, "element kind does not support this presentation variant");
        }
        patch.presentationVariant = edit.presentationVariant;
      }
      if (edit.intent !== undefined) patch.intent = edit.intent;
      if (edit.takeaway !== undefined) patch.takeaway = edit.takeaway;
      if (edit.emphasis !== undefined) patch.emphasis = edit.emphasis;
      if (edit.width !== undefined) patch.width = edit.width;
      if (edit.targetLength !== undefined) patch.targetLength = edit.targetLength;
      if (edit.note !== undefined) patch.note = edit.note;
      await db.recipeElements.updateOne({ _id: element._id, userId }, { $set: patch }, options);
      return;
    }
    if (edit.operation === "duplicate_element") {
      const element = await db.recipeElements.findOne({ _id: edit.elementId, userId, recipeId }, options);
      if (!element) throw new RecipeError(404, "blueprint element not found");
      const siblings = await db.recipeElements.find({ userId, recipeSectionId: element.recipeSectionId }, options).sort({ orderNo: 1, _id: 1 }).toArray();
      const id = randomUUID();
      const ids = siblings.map(({ _id }) => _id);
      ids.splice(ids.indexOf(element._id) + 1, 0, id);
      await db.recipeElements.insertOne({ ...element, _id: id, orderNo: siblings.length + 1_000, updatedAt: now }, options);
      const bound = await db.recipeElementSources.find({ userId, recipeElementId: element._id }, options).sort({ orderNo: 1 }).toArray();
      if (bound.length) {
        await db.recipeElementSources.insertMany(
          bound.map((source) => ({ ...source, _id: randomUUID(), recipeElementId: id, createdAt: now })),
          options,
        );
      }
      await this.#writeOrder(tx, userId, element.recipeSectionId, ids);
      return;
    }
    if (edit.operation === "delete_element") {
      const element = await db.recipeElements.findOne({ _id: edit.elementId, userId, recipeId }, options);
      if (!element) throw new RecipeError(404, "blueprint element not found");
      await db.recipeElementSources.deleteMany({ userId, recipeElementId: element._id }, options);
      await db.recipeElementMedia.deleteMany({ userId, recipeElementId: element._id }, options);
      await db.recipeElements.deleteOne({ _id: element._id, userId }, options);
      const rest = await db.recipeElements.find({ userId, recipeSectionId: element.recipeSectionId }, options).sort({ orderNo: 1, _id: 1 }).toArray();
      await this.#writeOrder(tx, userId, element.recipeSectionId, rest.map(({ _id }) => _id));
      return;
    }
    if (edit.operation === "bind_source") {
      const element = await db.recipeElements.findOne({ _id: edit.elementId, userId, recipeId }, options);
      if (!element) throw new RecipeError(404, "blueprint element not found");
      const bound = await db.recipeElementSources.find({ userId, recipeElementId: element._id }, options).sort({ orderNo: 1 }).toArray();
      if (bound.some(({ sourceId }) => sourceId === edit.sourceId)) throw new RecipeError(409, "source is already bound to this element");
      // 중심 근거는 하나다. 새 중심이 오면 앞의 중심은 보조로 내려간다.
      if (edit.role === "primary") {
        await db.recipeElementSources.updateMany({ userId, recipeElementId: element._id, role: "primary" }, { $set: { role: "supporting" } }, options);
      }
      await db.recipeElementSources.insertOne({
        _id: randomUUID(), userId, recipeId, recipeElementId: element._id,
        sourceType: edit.sourceType, sourceId: edit.sourceId, role: edit.role,
        orderNo: bound.length, createdAt: now,
      }, options);
      return;
    }
    const element = await db.recipeElements.findOne({ _id: edit.elementId, userId, recipeId }, options);
    if (!element) throw new RecipeError(404, "blueprint element not found");
    const removed = await db.recipeElementSources.findOneAndDelete({ userId, recipeElementId: element._id, sourceId: edit.sourceId }, options);
    if (!removed) throw new RecipeError(404, "source binding not found");
    const rest = await db.recipeElementSources.find({ userId, recipeElementId: element._id }, options).sort({ orderNo: 1, _id: 1 }).toArray();
    for (const [orderNo, source] of rest.entries()) {
      await db.recipeElementSources.updateOne({ _id: source._id, userId }, { $set: { orderNo } }, options);
    }
  }

  /**
   * §11.3 — drop 한 번에 저장 한 번.
   *
   * 보낸 배열이 곧 최종 순서다. 자리 번호에 유일 인덱스가 걸려 있어 옮기기
   * 전에 전부 1000씩 밀어 둔다 — 그러지 않으면 옮기는 도중에 두 요소가 같은
   * 자리를 갖는 순간이 생긴다.
   */
  async reorder(userId: string, recipeId: string, inputValue: BlueprintReorder): Promise<RecipeV2> {
    const input = BlueprintReorderSchema.parse(inputValue);
    await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      await this.#guard(tx, userId, recipeId);
      const db = mongoCollections(tx.db);
      const options = { session: tx.session };
      const sections = await db.recipeSections.find({ userId, recipeId }, options).toArray();
      const known = new Set(sections.map(({ _id }) => _id));
      if (input.sections.length !== sections.length || input.sections.some(({ sectionId }) => !known.has(sectionId))) {
        throw new RecipeError(409, "reorder must list every section of the blueprint");
      }
      const elements = await db.recipeElements.find({ userId, recipeId }, options).toArray();
      const listed = input.sections.flatMap(({ elementIds }) => elementIds);
      if (listed.length !== elements.length || new Set(listed).size !== listed.length) {
        throw new RecipeError(409, "reorder must list every element exactly once");
      }
      const elementIds = new Set(elements.map(({ _id }) => _id));
      if (listed.some((id) => !elementIds.has(id))) throw new RecipeError(409, "reorder lists an unknown element");

      await db.recipeSections.updateMany({ userId, recipeId }, { $inc: { orderNo: 1_000 } }, options);
      await db.recipeElements.updateMany({ userId, recipeId }, { $inc: { orderNo: 1_000 } }, options);
      const now = new Date();
      for (const [orderNo, { sectionId, elementIds: ids }] of input.sections.entries()) {
        await db.recipeSections.updateOne({ _id: sectionId, userId }, { $set: { orderNo, editedBy: "user", locked: true, updatedAt: now } }, options);
        for (const [elementOrder, id] of ids.entries()) {
          await db.recipeElements.updateOne(
            { _id: id, userId },
            { $set: { recipeSectionId: sectionId, orderNo: elementOrder, updatedAt: now } },
            options,
          );
        }
      }
    });
    return this.#load(userId, recipeId);
  }

  /** 자리 번호를 0부터 다시 매긴다. 유일 인덱스 때문에 두 번에 나눠 쓴다. */
  async #writeOrder(tx: MongoTransaction, userId: string, sectionId: string, ids: string[]): Promise<void> {
    const db = mongoCollections(tx.db);
    const options = { session: tx.session };
    await db.recipeElements.updateMany({ userId, recipeSectionId: sectionId }, { $inc: { orderNo: 10_000 } }, options);
    for (const [orderNo, id] of ids.entries()) {
      await db.recipeElements.updateOne({ _id: id, userId }, { $set: { orderNo, updatedAt: new Date() } }, options);
    }
  }

  async #renumberSections(tx: MongoTransaction, userId: string, recipeId: string): Promise<void> {
    const db = mongoCollections(tx.db);
    const options = { session: tx.session };
    const sections = await db.recipeSections.find({ userId, recipeId }, options).sort({ orderNo: 1, _id: 1 }).toArray();
    await db.recipeSections.updateMany({ userId, recipeId }, { $inc: { orderNo: 1_000 } }, options);
    for (const [orderNo, section] of sections.entries()) {
      await db.recipeSections.updateOne({ _id: section._id, userId }, { $set: { orderNo } }, options);
    }
  }
}
