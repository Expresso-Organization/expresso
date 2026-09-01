import { randomUUID } from "node:crypto";

import {
  CareerViewConfigurationSchema,
  CareerRecordSchema,
  type CareerViewConfiguration,
} from "@expresso/contracts";
import { mongoCollections, type CareerViewDoc } from "@expresso/database";
import type { Document } from "mongodb";
import { z } from "zod";

import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import { requireActiveUser } from "../identity/index.js";
import { CareerError } from "./errors.js";
import { mapMongoCategory, requireCareerCategory } from "./mongo-categories.js";
import { CareerViewQuery } from "./view-query.js";

const ViewCreateSchema = CareerViewConfigurationSchema.omit({
  id: true, categoryId: true, version: true, order: true, createdAt: true, updatedAt: true,
});
const CURSOR_LIFETIME_MS = 15 * 60_000;
const ViewUpdateSchema = CareerViewConfigurationSchema.omit({
  id: true, categoryId: true, version: true, order: true, createdAt: true, updatedAt: true,
}).partial().refine((value) => Object.keys(value).length > 0, "at least one view field is required");

export const CareerViewCreateSchema = ViewCreateSchema;
export const CareerViewUpdateSchema = ViewUpdateSchema;
export const CareerViewDuplicateSchema = z.strictObject({ name: z.string().trim().min(1).max(120) });
export const CareerViewReorderSchema = z.strictObject({ orderedIds: z.array(z.string().uuid()).min(1).max(100) });
export const CareerViewQueryInputSchema = z.strictObject({ cursor: z.string().min(1).max(4096).nullable().default(null), limit: z.coerce.number().int().min(1).max(100).default(50) });

export type CreateCareerViewConfiguration = z.infer<typeof ViewCreateSchema>;
export type UpdateCareerViewConfiguration = z.infer<typeof ViewUpdateSchema>;
export type CareerViewPage = {
  data: ReturnType<typeof CareerRecordSchema.parse>[];
  page: { hasNextPage: boolean; nextCursor: string | null };
};

function configuration(view: CareerViewDoc): CareerViewConfiguration {
  if (!view.configuration) throw new CareerError(404, "career view configuration not found");
  return CareerViewConfigurationSchema.parse(view.configuration);
}

function asDoc(config: CareerViewConfiguration): CareerViewDoc {
  return {
    _id: config.id,
    userId: "",
    categoryId: config.categoryId,
    // 레거시 API와 초기 Mongo validator를 만족시키는 호환 projection입니다.
    name: config.name,
    viewType: config.type,
    filters: config.filter === null ? [] : [config.filter] as never,
    sorts: config.sorts as never,
    visibleProperties: config.visiblePropertyIds as never,
    sortOrder: config.order,
    createdAt: new Date(config.createdAt),
    configuration: config,
  };
}

function compatibilitySet(config: CareerViewConfiguration) {
  const doc = asDoc(config);
  return {
    configuration: config, name: doc.name!, viewType: doc.viewType!, filters: doc.filters!,
    sorts: doc.sorts!, visibleProperties: doc.visibleProperties!, sortOrder: doc.sortOrder!,
  };
}

function versionConflict(): CareerError {
  return new CareerError(412, "career view version is stale");
}

/**
 * 저장된 뷰는 기록을 복제하지 않습니다. 이 서비스는 설정만 저장하고 조회 때 허용된
 * projection pipeline을 만들어 원본 `career_records`를 읽습니다.
 */
export class CareerViewService {
  readonly queryCompiler = new CareerViewQuery();

  constructor(readonly context: MongoContext) {}

  async list(userId: string, categoryId: string): Promise<CareerViewConfiguration[]> {
    await requireCareerCategory(this.context, userId, categoryId);
    const views = await mongoCollections(this.context.db).careerViews
      .find({ userId, categoryId, configuration: { $exists: true } })
      .sort({ "configuration.order": 1, _id: 1 })
      .toArray();
    return views.map(configuration);
  }

  async create(userId: string, categoryId: string, expectedCategoryVersion: number, inputValue: CreateCareerViewConfiguration): Promise<CareerViewConfiguration> {
    const input = ViewCreateSchema.parse(inputValue);
    return inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const category = await requireCareerCategory(tx, userId, categoryId, tx.session);
      if (category.version !== expectedCategoryVersion) throw versionConflict();
      const views = mongoCollections(tx.db).careerViews;
      const count = await views.countDocuments({ userId, categoryId, configuration: { $exists: true } }, { session: tx.session });
      if (count >= 20) throw new CareerError(409, "category view limit exceeded");
      const now = new Date();
      const config = CareerViewConfigurationSchema.parse({
        ...input, id: randomUUID(), categoryId, version: 1, order: count,
        createdAt: now.toISOString(), updatedAt: now.toISOString(),
      });
      // compile은 저장 전 모든 property UUID와 view-type 설정을 검사한다.
      this.queryCompiler.compile(mapMongoCategory(category), config);
      const doc = asDoc(config);
      doc.userId = userId;
      await views.insertOne(doc, { session: tx.session });
      return config;
    });
  }

  async update(userId: string, viewId: string, expectedVersion: number, inputValue: UpdateCareerViewConfiguration): Promise<CareerViewConfiguration> {
    const input = ViewUpdateSchema.parse(inputValue);
    return inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const views = mongoCollections(tx.db).careerViews;
      const currentDoc = await views.findOne({ _id: viewId, userId, configuration: { $exists: true } }, { session: tx.session });
      if (!currentDoc) throw new CareerError(404, "career view configuration not found");
      const current = configuration(currentDoc);
      if (current.version !== expectedVersion) throw versionConflict();
      const category = await requireCareerCategory(tx, userId, current.categoryId, tx.session);
      const next = CareerViewConfigurationSchema.parse({
        ...current, ...input, id: current.id, categoryId: current.categoryId, order: current.order,
        version: current.version + 1, createdAt: current.createdAt, updatedAt: new Date().toISOString(),
      });
      this.queryCompiler.compile(mapMongoCategory(category), next);
      const result = await views.updateOne(
        { _id: viewId, userId, "configuration.version": expectedVersion },
        { $set: compatibilitySet(next) },
        { session: tx.session },
      );
      if (result.modifiedCount !== 1) throw versionConflict();
      return next;
    });
  }

  async duplicate(userId: string, viewId: string, expectedVersion: number, name: string): Promise<CareerViewConfiguration> {
    const parsedName = CareerViewDuplicateSchema.parse({ name }).name;
    return inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const views = mongoCollections(tx.db).careerViews;
      const sourceDoc = await views.findOne({ _id: viewId, userId, configuration: { $exists: true } }, { session: tx.session });
      if (!sourceDoc) throw new CareerError(404, "career view configuration not found");
      const source = configuration(sourceDoc);
      if (source.version !== expectedVersion) throw versionConflict();
      const category = await requireCareerCategory(tx, userId, source.categoryId, tx.session);
      const order = await views.countDocuments({ userId, categoryId: source.categoryId, configuration: { $exists: true } }, { session: tx.session });
      if (order >= 20) throw new CareerError(409, "category view limit exceeded");
      const now = new Date().toISOString();
      const copy = CareerViewConfigurationSchema.parse({ ...source, id: randomUUID(), name: parsedName, version: 1, order, createdAt: now, updatedAt: now });
      this.queryCompiler.compile(mapMongoCategory(category), copy);
      const doc = asDoc(copy);
      doc.userId = userId;
      await views.insertOne(doc, { session: tx.session });
      return copy;
    });
  }

  async delete(userId: string, viewId: string, expectedVersion: number): Promise<void> {
    await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const views = mongoCollections(tx.db).careerViews;
      const row = await views.findOne({ _id: viewId, userId, configuration: { $exists: true } }, { session: tx.session });
      if (!row) throw new CareerError(404, "career view configuration not found");
      if (configuration(row).version !== expectedVersion) throw versionConflict();
      const removed = await views.deleteOne({ _id: viewId, userId, "configuration.version": expectedVersion }, { session: tx.session });
      if (removed.deletedCount !== 1) throw versionConflict();
      await views.updateMany(
        { userId, categoryId: row.categoryId, "configuration.order": { $gt: configuration(row).order } },
        { $inc: { "configuration.order": -1 } },
        { session: tx.session },
      );
    });
  }

  async reorder(userId: string, categoryId: string, expectedCategoryVersion: number, orderedIds: readonly string[]): Promise<CareerViewConfiguration[]> {
    const parsed = CareerViewReorderSchema.parse({ orderedIds });
    return inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const categories = mongoCollections(tx.db).careerCategories;
      const category = await categories.findOne({ _id: categoryId, $or: [{ userId: null }, { userId }] }, { session: tx.session });
      if (!category) throw new CareerError(404, "career category not found");
      if (category.version !== expectedCategoryVersion) throw versionConflict();
      const views = mongoCollections(tx.db).careerViews;
      const rows = await views.find({ userId, categoryId, configuration: { $exists: true } }, { session: tx.session }).toArray();
      const actual = new Set(rows.map((row) => row._id));
      if (new Set(parsed.orderedIds).size !== parsed.orderedIds.length || parsed.orderedIds.length !== actual.size || parsed.orderedIds.some((id) => !actual.has(id))) {
        throw new CareerError(400, "view reorder must contain every category view exactly once");
      }
      const bulk = parsed.orderedIds.map((id, order) => ({ updateOne: { filter: { _id: id, userId }, update: { $set: { "configuration.order": order, "configuration.updatedAt": new Date().toISOString(), sortOrder: order }, $inc: { "configuration.version": 1 } } } }));
      if (bulk.length) await views.bulkWrite(bulk, { session: tx.session });
      const changed = await categories.findOneAndUpdate({ _id: categoryId, version: expectedCategoryVersion }, { $inc: { version: 1 }, $set: { updatedAt: new Date() } }, { session: tx.session, returnDocument: "after" });
      if (!changed) throw versionConflict();
      return (await views.find({ _id: { $in: parsed.orderedIds }, userId }, { session: tx.session }).toArray()).map(configuration).sort((left, right) => left.order - right.order);
    });
  }

  async query(userId: string, viewId: string, cursor: string | null, limit: number): Promise<CareerViewPage> {
    const views = mongoCollections(this.context.db).careerViews;
    const viewDoc = await views.findOne({ _id: viewId, userId, configuration: { $exists: true } });
    if (!viewDoc) throw new CareerError(404, "career view configuration not found");
    const view = configuration(viewDoc);
    const categoryDoc = await requireCareerCategory(this.context, userId, view.categoryId);
    const category = mapMongoCategory(categoryDoc);
    const compiled = this.queryCompiler.compile(category, view);
    const pipeline = [{ $match: { userId, categoryId: view.categoryId, deletedAt: null } } as Document, ...compiled.pipeline];
    if (cursor) {
      const payload = this.queryCompiler.decodeCursor(cursor, { userId, viewId, viewVersion: view.version });
      const sortIndex = pipeline.findIndex((stage) => "$sort" in stage);
      pipeline.splice(sortIndex, 0, { $match: this.queryCompiler.cursorMatch(payload, compiled.sortParts) });
    }
    const projectIndex = pipeline.findIndex((stage) => "$project" in stage);
    pipeline.splice(projectIndex, 0, { $limit: limit + 1 });
    const rows = await mongoCollections(this.context.db).careerRecords.aggregate<Document>(pipeline).toArray();
    const hasNextPage = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    const last = pageRows.at(-1);
    const nextCursor = hasNextPage && last
      ? this.queryCompiler.encodeCursor({ userId, viewId, viewVersion: view.version, expiresAt: Date.now() + CURSOR_LIFETIME_MS, values: compiled.sortParts.map((part) => last[part.field]), id: String(last._id) })
      : null;
    return {
      data: pageRows.map((row) => CareerRecordSchema.parse({
        id: String(row._id), categoryId: row.categoryId, title: row.title, status: row.status, origin: row.origin,
        properties: row.properties ?? {}, bodyMd: row.bodyMd ?? "", version: row.version, updatedAt: new Date(row.updatedAt).toISOString(),
      })),
      page: { hasNextPage, nextCursor },
    };
  }
}
