import { randomUUID } from "node:crypto";

import {
  PortfolioIntentSchema,
  RecipeV2EditSchema,
  RecipeV2ReorderSchema,
  RecipeV2Schema,
  RecipeV2SectionRoleSchema,
  RecipeV2PresentationSchema,
  ROLE_OF_CONTENT_PATTERN,
  type PortfolioIntent,
  type RecipeV2,
  type RecipeV2Edit,
  type RecipeV2Reorder,
} from "@expresso/contracts";
import {
  mongoCollections,
  type JsonObject,
  type JsonValue,
  type RecipeSectionDoc,
} from "@expresso/database";
import { Decimal128 } from "mongodb";

import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction, type MongoTransaction } from "../../platform/mongo-transaction.js";
import { requireActiveUser } from "../identity/index.js";
import { addMongoRecipeRevision } from "./mongo-revisions.js";
import { RecipeError } from "./public.js";

/**
 * 02 레시피 — 어떤 내용이 어떤 순서로.
 *
 * v1 서비스(`service.ts`)가 모델을 불러 초안을 만들고, 여기는 그 초안을
 * 사용자가 고칠 수 있는 판으로 들고 있는다. 표시 방식 · 폭 · 강조 같은 지면의
 * 결정은 저장하지 않는다 — 그건 03 생성이 고른 디자인 안에서 정한다.
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

function intentOf(stored: unknown): PortfolioIntent {
  const parsed = PortfolioIntentSchema.safeParse(stored);
  return parsed.success ? parsed.data : EMPTY_INTENT;
}

type ElementDoc = { _id: string; userId: string; recipeId: string; recipeSectionId: string; orderNo: number; text: string; kind?: "point" | "metric" | "media" | "link"; metric?: JsonObject | null; media?: JsonObject | null; link?: JsonObject | null; updatedAt: Date };
type SourceDoc = { _id: string; userId: string; recipeId: string; recipeElementId: string; sourceType: "record" | "answer" | "requirement"; sourceId: string; role: "primary" | "supporting"; orderNo: number; createdAt: Date };

/** 저장된 역할 · 형식이 어휘에 없으면(형식이 사라진 뒤의 문서) 기본값으로 읽는다. */
function roleOf(value: unknown) {
  const parsed = RecipeV2SectionRoleSchema.safeParse(value);
  return parsed.success ? parsed.data : "other";
}
function presentationOf(value: unknown) {
  const parsed = RecipeV2PresentationSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** v1 초안 항목의 `content` 를 v2 문장의 종류 · 값으로. 모양이 안 맞으면 point 다. */
function contentOf(stored: unknown): Pick<ElementDoc, "kind" | "metric" | "media" | "link"> {
  const content = stored && typeof stored === "object" ? stored as Record<string, unknown> : {};
  const kind = content["kind"];
  if (kind === "metric" && content["metric"] && typeof content["metric"] === "object") {
    const metric = content["metric"] as Record<string, unknown>;
    return { kind, metric: { label: String(metric["label"] ?? ""), value: String(metric["value"] ?? ""), unit: String(metric["unit"] ?? ""), note: String(metric["note"] ?? "") }, media: null, link: null };
  }
  if (kind === "link" && content["link"] && typeof content["link"] === "object") {
    const link = content["link"] as Record<string, unknown>;
    return { kind, metric: null, media: null, link: { label: String(link["label"] ?? ""), url: String(link["url"] ?? "") } };
  }
  if (kind === "media") {
    return { kind, metric: null, media: { assetId: null, caption: String(content["caption"] ?? ""), frame: "none" }, link: null };
  }
  return { kind: "point", metric: null, media: null, link: null };
}

export class RecipeV2Service {
  constructor(readonly context: MongoContext) {}

  /**
   * 02 화면이 열릴 때 부른다. 이 제작의 v2 레시피가 없으면 만든다.
   *
   * 이미 v1 초안이 있으면 그것을 옮겨 온다 — 사용자가 02에서 만나는 것은 빈
   * 지면이 아니라 고칠 수 있는 초안이어야 한다(§10.4 legacy adapter).
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
    if (existing) {
      // 화면을 연 사이에 새 v1 초안이 만들어졌으면 그것도 데려온다.
      await this.#adoptNewer(userId, brewId, existing._id);
      return this.#load(userId, existing._id);
    }

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

      const legacy = await this.#latestLegacy(tx, userId, brewId);
      if (legacy) await this.#adopt(tx, userId, legacy, id);
      return id;
    });
    return this.#load(userId, recipeId);
  }

  /** 아직 옮겨 오지 않은 v1 초안이 있으면 지금 판에 얹는다. */
  async #adoptNewer(userId: string, brewId: string, recipeId: string): Promise<void> {
    const db = mongoCollections(this.context.db);
    const current = await db.recipes.findOne({ _id: recipeId, userId });
    const legacy = await db.recipes
      .find({ userId, brewId, schemaVersion: { $exists: false } })
      .sort({ version: -1, _id: -1 })
      .limit(1)
      .next();
    if (!legacy || current?.adoptedRecipeId === legacy._id) return;
    await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const scoped = mongoCollections(tx.db);
      const options = { session: tx.session };
      const guard = await scoped.recipes.findOne({ _id: recipeId, userId }, options);
      if (!guard || guard.adoptedRecipeId === legacy._id) return;
      // 초안이 새로 왔으면 이전 초안 자리를 비우고 새것을 얹는다.
      const sections = await scoped.recipeSections.find({ userId, recipeId }, options).project<{ _id: string }>({ _id: 1 }).toArray();
      if (sections.length) {
        await scoped.recipeElementSources.deleteMany({ userId, recipeId }, options);
        await scoped.recipeElements.deleteMany({ userId, recipeId }, options);
        await scoped.recipeSections.deleteMany({ userId, recipeId }, options);
      }
      await this.#adopt(tx, userId, legacy._id, recipeId);
      await scoped.recipes.updateOne({ _id: recipeId, userId }, { $set: { adoptedRecipeId: legacy._id, updatedAt: new Date() } }, options);
    });
  }

  async #latestLegacy(tx: MongoTransaction, userId: string, brewId: string): Promise<string | null> {
    const legacy = await mongoCollections(tx.db).recipes
      .find({ userId, brewId, schemaVersion: { $exists: false } }, { session: tx.session })
      .sort({ version: -1, _id: -1 })
      .limit(1)
      .next();
    return legacy?._id ?? null;
  }

  /** v1 레시피의 섹션과 항목을 v2로 옮긴다. 원본은 그대로 둔다. */
  async #adopt(tx: MongoTransaction, userId: string, legacyRecipeId: string, recipeId: string): Promise<void> {
    const db = mongoCollections(tx.db);
    const options = { session: tx.session };
    const sections = await db.recipeSections.find({ userId, recipeId: legacyRecipeId }, options).sort({ orderNo: 1, _id: 1 }).toArray();
    if (!sections.length) return;
    const items = await db.recipeItems.find({ userId, recipeSectionId: { $in: sections.map(({ _id }) => _id) } }, options).sort({ orderNo: 1, _id: 1 }).toArray();
    const paths = await db.recipeEvidencePaths.find({ userId, recipeId: legacyRecipeId }, options).toArray();
    const unused = await db.recipeUnusedSources.find({ userId, recipeId: legacyRecipeId }, options).toArray();
    const now = new Date();
    const newSections: RecipeSectionDoc[] = [];
    const elements: ElementDoc[] = [];
    const sources: SourceDoc[] = [];

    for (const [order, section] of sections.entries()) {
      const sectionId = randomUUID();
      const takeaway = typeof section.context["takeaway"] === "string" ? section.context["takeaway"] : "";
      // 초안이 역할 · 형식을 냈으면 그것, 아니면 contentPattern 에서 역할만 옮긴다.
      const role = roleOf(section.context["role"]) !== "other" || section.context["role"] !== undefined
        ? roleOf(section.context["role"])
        : ROLE_OF_CONTENT_PATTERN[String(section.context["contentPattern"])] ?? "other";
      newSections.push({
        _id: sectionId, userId, recipeId, orderNo: order, title: section.title,
        purpose: section.purpose, targetLength: section.targetLength, takeaway,
        role, presentation: presentationOf(section.context["presentation"]),
        context: { ...V1_SECTION_CONTEXT } as unknown as JsonObject,
        locked: false, editedBy: "ai", updatedAt: now,
      });
      for (const [itemOrder, item] of items.filter(({ recipeSectionId }) => recipeSectionId === section._id).entries()) {
        const elementId = randomUUID();
        elements.push({
          _id: elementId, userId, recipeId, recipeSectionId: sectionId,
          orderNo: itemOrder, text: item.pointText.slice(0, 2_000), ...contentOf(item.content), updatedAt: now,
        });
        const bound = paths.filter(({ recipeItemId }) => recipeItemId === item._id);
        const seen = new Set<string>();
        for (const path of bound) {
          if (seen.has(path.sourceId)) continue;
          seen.add(path.sourceId);
          sources.push({
            _id: randomUUID(), userId, recipeId, recipeElementId: elementId,
            sourceType: path.sourceType, sourceId: path.sourceId,
            role: seen.size === 1 ? "primary" : "supporting", orderNo: seen.size - 1, createdAt: now,
          });
        }
      }
    }
    await db.recipeSections.insertMany(newSections, options);
    if (elements.length) await db.recipeElements.insertMany(elements, options);
    if (sources.length) await db.recipeElementSources.insertMany(sources, options);
    if (unused.length) {
      await db.recipeUnusedSources.deleteMany({ userId, recipeId }, options);
      await db.recipeUnusedSources.insertMany(
        unused.map(({ recordId, reason }) => ({ _id: randomUUID(), userId, recipeId, recordId, reason, createdAt: now })),
        options,
      );
    }
  }

  async get(userId: string, recipeId: string): Promise<RecipeV2> {
    return this.#load(userId, recipeId);
  }

  async #load(userId: string, recipeId: string): Promise<RecipeV2> {
    const db = mongoCollections(this.context.db);
    const recipe = await db.recipes.findOne({ _id: recipeId, userId });
    if (!recipe || recipe.schemaVersion !== SCHEMA_VERSION) throw new RecipeError(404, "recipe not found");
    const [sections, elements, sources, unused, brewSources] = await Promise.all([
      db.recipeSections.find({ userId, recipeId }).sort({ orderNo: 1, _id: 1 }).toArray(),
      db.recipeElements.find({ userId, recipeId }).sort({ orderNo: 1, _id: 1 }).toArray(),
      db.recipeElementSources.find({ userId, recipeId }).sort({ orderNo: 1, _id: 1 }).toArray(),
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
        role: roleOf(section.role),
        presentation: presentationOf(section.presentation),
        items: elements
          .filter(({ recipeSectionId }) => recipeSectionId === section._id)
          .map((element) => ({
            id: element._id,
            order: element.orderNo,
            text: element.text,
            kind: element.kind ?? "point",
            metric: element.metric ?? null,
            media: element.media ?? null,
            link: element.link ?? null,
            sourceBindings: sources
              .filter(({ recipeElementId }) => recipeElementId === element._id)
              .map(({ sourceType, sourceId, role, orderNo }) => ({ sourceType, sourceId, role, order: orderNo })),
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
    if (!recipe || recipe.schemaVersion !== SCHEMA_VERSION) throw new RecipeError(404, "recipe not found");
    const guard = await db.recipes.updateOne(
      { _id: recipeId, userId, editVersion: recipe.editVersion ?? 1 },
      { $set: { updatedAt: new Date() }, $inc: { editVersion: 1 } },
      options,
    );
    if (!guard.matchedCount) throw new RecipeError(409, "recipe changed concurrently");
    return recipe;
  }

  async edit(userId: string, recipeId: string, editValue: RecipeV2Edit) {
    const edit = RecipeV2EditSchema.parse(editValue);
    const before = await this.#load(userId, recipeId);
    let revisionId = "";
    await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      await this.#guard(tx, userId, recipeId);
      await this.#apply(tx, userId, recipeId, edit);
      // 확정 뒤에 손을 대면 다시 초안이다. 03이 읽은 판과 지금 판이 다르다는 표시다.
      await mongoCollections(tx.db).recipes.updateOne(
        { _id: recipeId, userId },
        { $set: { status: edit.operation === "confirm" ? "confirmed" : "draft" } },
        { session: tx.session },
      );
      revisionId = await addMongoRecipeRevision(tx, {
        userId, recipeId, action: edit.operation,
        snapshot: before as unknown as JsonObject, diff: [] as JsonValue[],
      });
    });
    return { recipe: await this.#load(userId, recipeId), revisionId };
  }

  async #apply(tx: MongoTransaction, userId: string, recipeId: string, edit: RecipeV2Edit): Promise<void> {
    const db = mongoCollections(tx.db);
    const options = { session: tx.session };
    const now = new Date();

    if (edit.operation === "confirm") return;
    if (edit.operation === "restore") {
      await this.#restore(tx, userId, recipeId, edit);
      return;
    }
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
        targetLength: 0, takeaway: "", role: edit.role ?? "other", presentation: null,
        context: { ...V1_SECTION_CONTEXT } as unknown as JsonObject,
        locked: true, editedBy: "user", updatedAt: now,
      }, options);
      return;
    }
    if (edit.operation === "update_section") {
      const section = await db.recipeSections.findOne({ _id: edit.sectionId, userId, recipeId }, options);
      if (!section) throw new RecipeError(404, "recipe section not found");
      const patch: Partial<RecipeSectionDoc> = { editedBy: "user", locked: true, updatedAt: now };
      if (edit.title !== undefined) patch.title = edit.title;
      if (edit.purpose !== undefined) patch.purpose = edit.purpose;
      if (edit.takeaway !== undefined) patch.takeaway = edit.takeaway;
      if (edit.role !== undefined) patch.role = edit.role;
      if (edit.presentation !== undefined) patch.presentation = edit.presentation;
      await db.recipeSections.updateOne({ _id: section._id, userId }, { $set: patch }, options);
      return;
    }
    if (edit.operation === "delete_section") {
      const section = await db.recipeSections.findOne({ _id: edit.sectionId, userId, recipeId }, options);
      if (!section) throw new RecipeError(404, "recipe section not found");
      const itemIds = (await db.recipeElements.find({ userId, recipeSectionId: section._id }, options).project<{ _id: string }>({ _id: 1 }).toArray()).map(({ _id }) => _id);
      if (itemIds.length) {
        await db.recipeElementSources.deleteMany({ userId, recipeElementId: { $in: itemIds } }, options);
        await db.recipeElements.deleteMany({ userId, _id: { $in: itemIds } }, options);
      }
      await db.recipeSections.deleteOne({ _id: section._id, userId }, options);
      await this.#renumberSections(tx, userId, recipeId);
      return;
    }
    if (edit.operation === "add_item") {
      if (!await db.recipeSections.findOne({ _id: edit.sectionId, userId, recipeId }, options)) {
        throw new RecipeError(404, "recipe section not found");
      }
      const siblings = await db.recipeElements.find({ userId, recipeSectionId: edit.sectionId }, options).sort({ orderNo: 1, _id: 1 }).toArray();
      const at = Math.min(edit.order ?? siblings.length, siblings.length);
      const id = randomUUID();
      const ids = siblings.map(({ _id }) => _id);
      ids.splice(at, 0, id);
      await db.recipeElements.insertOne({
        _id: id, userId, recipeId, recipeSectionId: edit.sectionId,
        orderNo: siblings.length + 1_000, text: edit.text ?? "", updatedAt: now,
      }, options);
      await this.#writeOrder(tx, userId, edit.sectionId, ids);
      return;
    }
    if (edit.operation === "update_item") {
      const item = await db.recipeElements.findOne({ _id: edit.itemId, userId, recipeId }, options);
      if (!item) throw new RecipeError(404, "recipe item not found");
      await db.recipeElements.updateOne({ _id: item._id, userId }, { $set: { text: edit.text, updatedAt: now } }, options);
      return;
    }
    if (edit.operation === "update_item_content") {
      const item = await db.recipeElements.findOne({ _id: edit.itemId, userId, recipeId }, options);
      if (!item) throw new RecipeError(404, "recipe item not found");
      await db.recipeElements.updateOne(
        { _id: item._id, userId },
        { $set: { text: edit.text, kind: edit.kind, metric: edit.metric as JsonObject | null, media: edit.media as JsonObject | null, link: edit.link as JsonObject | null, updatedAt: now } },
        options,
      );
      return;
    }
    if (edit.operation === "duplicate_item") {
      const item = await db.recipeElements.findOne({ _id: edit.itemId, userId, recipeId }, options);
      if (!item) throw new RecipeError(404, "recipe item not found");
      const siblings = await db.recipeElements.find({ userId, recipeSectionId: item.recipeSectionId }, options).sort({ orderNo: 1, _id: 1 }).toArray();
      const id = randomUUID();
      const ids = siblings.map(({ _id }) => _id);
      ids.splice(ids.indexOf(item._id) + 1, 0, id);
      await db.recipeElements.insertOne({ ...item, _id: id, orderNo: siblings.length + 1_000, updatedAt: now }, options);
      const bound = await db.recipeElementSources.find({ userId, recipeElementId: item._id }, options).sort({ orderNo: 1 }).toArray();
      if (bound.length) {
        await db.recipeElementSources.insertMany(
          bound.map((source) => ({ ...source, _id: randomUUID(), recipeElementId: id, createdAt: now })),
          options,
        );
      }
      await this.#writeOrder(tx, userId, item.recipeSectionId, ids);
      return;
    }
    if (edit.operation === "delete_item") {
      const item = await db.recipeElements.findOne({ _id: edit.itemId, userId, recipeId }, options);
      if (!item) throw new RecipeError(404, "recipe item not found");
      await db.recipeElementSources.deleteMany({ userId, recipeElementId: item._id }, options);
      await db.recipeElements.deleteOne({ _id: item._id, userId }, options);
      const rest = await db.recipeElements.find({ userId, recipeSectionId: item.recipeSectionId }, options).sort({ orderNo: 1, _id: 1 }).toArray();
      await this.#writeOrder(tx, userId, item.recipeSectionId, rest.map(({ _id }) => _id));
      return;
    }
    if (edit.operation === "bind_source") {
      const item = await db.recipeElements.findOne({ _id: edit.itemId, userId, recipeId }, options);
      if (!item) throw new RecipeError(404, "recipe item not found");
      const bound = await db.recipeElementSources.find({ userId, recipeElementId: item._id }, options).sort({ orderNo: 1 }).toArray();
      if (bound.some(({ sourceId }) => sourceId === edit.sourceId)) throw new RecipeError(409, "source is already bound to this item");
      // 중심 근거는 하나다. 새 중심이 오면 앞의 중심은 보조로 내려간다.
      if (edit.role === "primary") {
        await db.recipeElementSources.updateMany({ userId, recipeElementId: item._id, role: "primary" }, { $set: { role: "supporting" } }, options);
      }
      await db.recipeElementSources.insertOne({
        _id: randomUUID(), userId, recipeId, recipeElementId: item._id,
        sourceType: edit.sourceType, sourceId: edit.sourceId, role: edit.role,
        orderNo: bound.length, createdAt: now,
      }, options);
      return;
    }
    const item = await db.recipeElements.findOne({ _id: edit.itemId, userId, recipeId }, options);
    if (!item) throw new RecipeError(404, "recipe item not found");
    const removed = await db.recipeElementSources.findOneAndDelete({ userId, recipeElementId: item._id, sourceId: edit.sourceId }, options);
    if (!removed) throw new RecipeError(404, "source binding not found");
    const rest = await db.recipeElementSources.find({ userId, recipeElementId: item._id }, options).sort({ orderNo: 1, _id: 1 }).toArray();
    for (const [orderNo, source] of rest.entries()) {
      await db.recipeElementSources.updateOne({ _id: source._id, userId }, { $set: { orderNo } }, options);
    }
  }

  /**
   * §11.3 — drop 한 번에 저장 한 번.
   *
   * 보낸 배열이 곧 최종 순서다. 자리 번호에 유일 인덱스가 걸려 있어 옮기기
   * 전에 전부 밀어 둔다 — 그러지 않으면 옮기는 도중에 두 항목이 같은 자리를
   * 갖는 순간이 생긴다.
   */
  async reorder(userId: string, recipeId: string, inputValue: RecipeV2Reorder): Promise<RecipeV2> {
    const input = RecipeV2ReorderSchema.parse(inputValue);
    await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      await this.#guard(tx, userId, recipeId);
      const db = mongoCollections(tx.db);
      const options = { session: tx.session };
      const sections = await db.recipeSections.find({ userId, recipeId }, options).toArray();
      const known = new Set(sections.map(({ _id }) => _id));
      if (input.sections.length !== sections.length || input.sections.some(({ sectionId }) => !known.has(sectionId))) {
        throw new RecipeError(409, "reorder must list every section of the recipe");
      }
      const elements = await db.recipeElements.find({ userId, recipeId }, options).toArray();
      const listed = input.sections.flatMap(({ itemIds }) => itemIds);
      if (listed.length !== elements.length || new Set(listed).size !== listed.length) {
        throw new RecipeError(409, "reorder must list every item exactly once");
      }
      const itemIds = new Set(elements.map(({ _id }) => _id));
      if (listed.some((id) => !itemIds.has(id))) throw new RecipeError(409, "reorder lists an unknown item");

      await db.recipeSections.updateMany({ userId, recipeId }, { $inc: { orderNo: 1_000 } }, options);
      await db.recipeElements.updateMany({ userId, recipeId }, { $inc: { orderNo: 1_000 } }, options);
      const now = new Date();
      // 순서를 바꾸는 것도 편집이다. 확정했던 판과 달라졌다.
      await db.recipes.updateOne({ _id: recipeId, userId }, { $set: { status: "draft" } }, options);
      for (const [orderNo, { sectionId, itemIds: ids }] of input.sections.entries()) {
        await db.recipeSections.updateOne({ _id: sectionId, userId }, { $set: { orderNo, editedBy: "user", locked: true, updatedAt: now } }, options);
        for (const [itemOrder, id] of ids.entries()) {
          await db.recipeElements.updateOne(
            { _id: id, userId },
            { $set: { recipeSectionId: sectionId, orderNo: itemOrder, updatedAt: now } },
            options,
          );
        }
      }
    });
    return this.#load(userId, recipeId);
  }

  /**
   * 화면이 보낸 판으로 되돌린다(실행 취소 · 다시 실행).
   *
   * 섹션 · 문장 · 근거를 전부 지우고 받은 순서대로 다시 넣는다. id는 받은 그대로다.
   * 지우기를 먼저 끝내야 자리 번호 유일 인덱스에 걸리지 않는다.
   */
  async #restore(
    tx: MongoTransaction,
    userId: string,
    recipeId: string,
    edit: Extract<RecipeV2Edit, { operation: "restore" }>,
  ): Promise<void> {
    const db = mongoCollections(tx.db);
    const options = { session: tx.session };
    const now = new Date();
    if (edit.intent.jobPostingId && !await db.jobPostings.findOne({ _id: edit.intent.jobPostingId }, options)) {
      throw new RecipeError(404, "job posting not found");
    }
    const sectionIds = new Set(edit.sections.map(({ id }) => id));
    const itemIds = edit.sections.flatMap(({ items }) => items.map(({ id }) => id));
    if (sectionIds.size !== edit.sections.length || new Set(itemIds).size !== itemIds.length) {
      throw new RecipeError(409, "restore lists an id twice");
    }
    await db.recipeElementSources.deleteMany({ userId, recipeId }, options);
    await db.recipeElements.deleteMany({ userId, recipeId }, options);
    await db.recipeSections.deleteMany({ userId, recipeId }, options);
    await db.recipes.updateOne(
      { _id: recipeId, userId },
      { $set: { title: edit.title, intent: edit.intent as unknown as JsonObject } },
      options,
    );
    const sections: RecipeSectionDoc[] = [];
    const elements: ElementDoc[] = [];
    const sources: SourceDoc[] = [];
    for (const [orderNo, section] of edit.sections.entries()) {
      sections.push({
        _id: section.id, userId, recipeId, orderNo, title: section.title, purpose: section.purpose,
        targetLength: 0, takeaway: section.takeaway, role: section.role, presentation: section.presentation,
        context: { ...V1_SECTION_CONTEXT } as unknown as JsonObject,
        locked: true, editedBy: "user", updatedAt: now,
      });
      for (const [itemOrder, item] of section.items.entries()) {
        elements.push({
          _id: item.id, userId, recipeId, recipeSectionId: section.id,
          orderNo: itemOrder, text: item.text,
          kind: item.kind, metric: item.metric as JsonObject | null, media: item.media as JsonObject | null, link: item.link as JsonObject | null,
          updatedAt: now,
        });
        const seen = new Set<string>();
        for (const binding of [...item.sourceBindings].sort((a, b) => a.order - b.order)) {
          if (seen.has(binding.sourceId)) continue;
          seen.add(binding.sourceId);
          sources.push({
            _id: randomUUID(), userId, recipeId, recipeElementId: item.id,
            sourceType: binding.sourceType, sourceId: binding.sourceId, role: binding.role,
            orderNo: seen.size - 1, createdAt: now,
          });
        }
      }
    }
    if (sections.length) await db.recipeSections.insertMany(sections, options);
    if (elements.length) await db.recipeElements.insertMany(elements, options);
    if (sources.length) await db.recipeElementSources.insertMany(sources, options);
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
