import { randomUUID } from "node:crypto";
import { careerDocumentToMarkdown, encodeDocumentAsYUpdate, encodeDocumentStateVector, markdownToCareerDocument, parseCareerDocument, reconstructYDocument } from "@expresso/editor";
import { CareerPropertySchemaSchema, CareerProfileSchema, CreateCareerCategorySchema, CreateCareerRecordSchema, CreateCareerViewSchema, SaveCareerProfileSchema, UpdateCareerRecordSchema, type CareerPropertySchema, type CreateCareerCategory, type CreateCareerRecord, type CreateCareerView, type ListCareerRecordsQuery, type SaveCareerProfile, type UpdateCareerRecord } from "@expresso/contracts";
import { mongoCollections, type CareerCategoryDoc, type CareerRecordDoc, type CareerViewDoc } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import { requireActiveUser } from "../identity/index.js";
import { CareerError } from "./errors.js";
import { validateCareerProperties } from "./properties.js";
import { mapMongoCategory, mapMongoView, requireCareerCategory } from "./mongo-categories.js";
import { careerRequestHash, listMongoRecords, mapMongoRecord } from "./mongo-records.js";
import type { CareerApi } from "./index.js";
import type { RecomputeCareerSkill } from "@expresso/contracts";
import { createMongoLink, listMongoLinks, mongoDeleteImpact, trashMongoRecord, restoreMongoRecord } from "./mongo-links.js";
import { recomputeMongoSkill, listMongoSkills, listMongoSkillEvidence } from "./mongo-skills.js";
import { MongoCareerDocumentRepository, hashUpdate } from "../career-editor/repository.js";
import { Binary } from "mongodb";
import { MongoCareerPropertySchemaService } from "./property-schema.js";

const duplicate = (error: unknown) => (error as { code?: number })?.code === 11000;

export class CareerService implements CareerApi {
  constructor(readonly context: MongoContext) {}

  previewChange(userId: string, categoryId: string, change: import("@expresso/contracts").CareerPropertySchemaChange) { return new MongoCareerPropertySchemaService(this.context).previewChange(userId, categoryId, change); }
  applyChange(userId: string, categoryId: string, expectedVersion: number, idempotencyKey: string, input: import("@expresso/contracts").ApplyCareerPropertyChange) { return new MongoCareerPropertySchemaService(this.context).applyChange(userId, categoryId, expectedVersion, idempotencyKey, input); }
  restoreProperty(userId: string, categoryId: string, propertyId: string, expectedVersion: number) { return new MongoCareerPropertySchemaService(this.context).restoreProperty(userId, categoryId, propertyId, expectedVersion); }

  createLink(userId: string, recordId: string, toRecordId: string, relation: "related" | "parent" | "duplicate_of") { return createMongoLink(this.context, userId, recordId, toRecordId, relation); }
  listLinks(userId: string, recordId: string) { return listMongoLinks(this.context, userId, recordId); }
  getDeleteImpact(userId: string, recordId: string, at = new Date()) { return mongoDeleteImpact(this.context, userId, recordId, at); }
  trashRecord(userId: string, recordId: string, at = new Date()) { return trashMongoRecord(this.context, userId, recordId, at); }
  restoreRecord(userId: string, recordId: string, at = new Date()) { return restoreMongoRecord(this.context, userId, recordId, at); }
  recomputeSkill(userId: string, input: RecomputeCareerSkill, computedAt = new Date()) { return recomputeMongoSkill(this.context, userId, input, computedAt); }
  listSkills(userId: string) { return listMongoSkills(this.context, userId); }
  listSkillEvidence(userId: string, skillId: string) { return listMongoSkillEvidence(this.context, userId, skillId); }

  async listCategories(userId: string) {
    const rows = await mongoCollections(this.context.db).careerCategories.aggregate<CareerCategoryDoc & { counts: { total: number }[] }>([
      { $match: { $or: [{ userId: null }, { userId }] } },
      { $sort: { isSystem: -1, sortOrder: 1, _id: 1 } },
      { $lookup: { from: "career_records", let: { categoryId: "$_id" }, pipeline: [{ $match: { userId, deletedAt: null, $expr: { $eq: ["$categoryId", "$$categoryId"] } } }, { $count: "total" }], as: "counts" } },
    ]).toArray();
    const keys = new Set(rows.filter((row) => row.isSystem).map((row) => row.key));
    if (["experience", "project", "education_history", "certification_award", "academic_writing", "activity_leadership", "skill_tool"].some((key) => !keys.has(key))) throw new Error("default career categories are not installed");
    return rows.map((row) => mapMongoCategory(row, row.counts[0]?.total ?? 0));
  }

  listRecords(userId: string, query: ListCareerRecordsQuery) { return listMongoRecords(this.context, userId, query); }

  async createCategory(userId: string, inputValue: CreateCareerCategory) {
    const input = CreateCareerCategorySchema.parse(inputValue);
    try {
      return await inTransaction(this.context, async (tx) => {
        await requireActiveUser(tx, userId);
        const categories = mongoCollections(tx.db).careerCategories;
        const propertySchema = Object.fromEntries(Object.entries(input.propertySchema).map(([key, definition]) => [key, { ...definition, id: definition.id ?? randomUUID() }]));
        const category: CareerCategoryDoc = { _id: randomUUID(), userId, ...input, propertySchema, isSystem: false, sortOrder: 7 + await categories.countDocuments({ userId }, { session: tx.session }), version: 1, updatedAt: new Date() };
        await categories.insertOne(category, { session: tx.session });
        return mapMongoCategory(category);
      });
    } catch (error) { if (duplicate(error)) throw new CareerError(409, "career category key already exists"); throw error; }
  }

  async updatePropertySchema(userId: string, categoryId: string, expectedVersion: number, nextSchemaInput: CareerPropertySchema, confirmValueRemoval: boolean) {
    const nextSchema = CareerPropertySchemaSchema.parse(nextSchemaInput);
    return inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const db = mongoCollections(tx.db);
      const category = await db.careerCategories.findOne({ _id: categoryId, userId, isSystem: false }, { session: tx.session });
      if (!category) throw new CareerError(404, "career category not found");
      if (category.version !== expectedVersion) throw new CareerError(412, "category version is stale");
      const normalizedSchema = Object.fromEntries(Object.entries(nextSchema).map(([key, definition]) => [key, { ...definition, id: definition.id ?? category.propertySchema[key]?.id ?? randomUUID() }]));
      const removed = Object.keys(category.propertySchema).filter((key) => !Object.hasOwn(normalizedSchema, key));
      const protectedProperties = removed.filter((key) => category.propertySchema[key]?.system);
      if (protectedProperties.length) throw new CareerError(403, "system properties cannot be removed", { protectedProperties });
      const propertyValueCounts: Record<string, number> = {};
      for (const key of removed) {
        const count = await db.careerRecords.countDocuments({ userId, categoryId, deletedAt: null, [`properties.${key}`]: { $exists: true } }, { session: tx.session });
        if (count) propertyValueCounts[key] = count;
      }
      if (Object.keys(propertyValueCounts).length && !confirmValueRemoval) throw new CareerError(409, "category properties still contain values", { propertyValueCounts });
      for (const key of Object.keys(propertyValueCounts)) {
        await db.careerRecords.updateMany({ userId, categoryId, [`properties.${key}`]: { $exists: true } }, { $unset: { [`properties.${key}`]: "" }, $inc: { version: 1 }, $set: { updatedAt: new Date() } }, { session: tx.session });
      }
      const updated = await db.careerCategories.findOneAndUpdate({ _id: categoryId, userId, version: expectedVersion }, { $set: { propertySchema: normalizedSchema, updatedAt: new Date() }, $inc: { version: 1 } }, { session: tx.session, returnDocument: "after" });
      if (!updated) throw new CareerError(412, "category version is stale");
      return mapMongoCategory(updated);
    });
  }

  async createRecord(userId: string, idempotencyKey: string, inputValue: CreateCareerRecord) {
    const input = CreateCareerRecordSchema.parse(inputValue);
    const hash = careerRequestHash(input);
    return inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const category = await requireCareerCategory(tx, userId, input.categoryId, tx.session);
      validateCareerProperties(category.propertySchema, input.properties);
      const records = mongoCollections(tx.db).careerRecords;
      const existing = await records.findOne({ userId, createIdempotencyKey: idempotencyKey }, { session: tx.session });
      if (existing) {
        if (existing.createRequestHash !== hash) throw new CareerError(409, "idempotency key was reused with another request");
        return { record: mapMongoRecord(existing), created: false };
      }
      const record: CareerRecordDoc = { _id: randomUUID(), userId, ...input, status: "draft", origin: "manual", version: 1, updatedAt: new Date(), deletedAt: null, purgeAfter: null, createIdempotencyKey: idempotencyKey, createRequestHash: hash };
      await records.insertOne(record, { session: tx.session });
      return { record: mapMongoRecord(record), created: true };
    });
  }

  async getRecord(userId: string, recordId: string) {
    const record = await mongoCollections(this.context.db).careerRecords.findOne({ _id: recordId, userId, deletedAt: null });
    if (!record) throw new CareerError(404, "career record not found");
    const snapshot = await mongoCollections(this.context.db).careerDocumentSnapshots.findOne({ recordId }, { sort: { documentVersion: -1 } });
    if (!snapshot) return mapMongoRecord(record);
    try {
      const updates = await mongoCollections(this.context.db).careerDocumentUpdates.find({ recordId, serverSequence: { $gt: snapshot.serverSequence }, compactedAt: null }).sort({ serverSequence: 1 }).toArray();
      const document = reconstructYDocument([encodeDocumentAsYUpdate(parseCareerDocument(snapshot.content)), ...updates.map((row) => new Uint8Array(row.update.buffer))]);
      return mapMongoRecord(record, careerDocumentToMarkdown(document));
    }
    catch { return mapMongoRecord(record); }
  }

  async updateRecord(userId: string, recordId: string, expectedVersion: number, inputValue: UpdateCareerRecord) {
      const input = UpdateCareerRecordSchema.parse(inputValue);
    return inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const records = mongoCollections(tx.db).careerRecords;
      const existing = await records.findOne({ _id: recordId, userId, deletedAt: null }, { session: tx.session });
      if (!existing) throw new CareerError(404, "career record not found");
      if (existing.version !== expectedVersion) throw new CareerError(412, "career record version is stale");
      if (input.bodyMd !== undefined) {
        const latestSnapshot = await mongoCollections(tx.db).careerDocumentSnapshots.findOne(
          { recordId },
          { sort: { documentVersion: -1 }, session: tx.session },
        );
        const pending = await mongoCollections(tx.db).careerDocumentUpdates.countDocuments(
          { recordId, serverSequence: { $gt: latestSnapshot?.serverSequence ?? 0 }, compactedAt: null },
          { session: tx.session },
        );
        if (pending > 0) throw new CareerError(409, "document has unacknowledged updates");
      }
      const category = await requireCareerCategory(tx, userId, existing.categoryId, tx.session);
      const properties = input.properties ?? existing.properties;
      validateCareerProperties(category.propertySchema, properties);
      const updated = await records.findOneAndUpdate({ _id: recordId, userId, deletedAt: null, version: expectedVersion }, { $set: { title: input.title ?? existing.title, bodyMd: input.bodyMd ?? existing.bodyMd, properties, updatedAt: new Date() }, $inc: { version: 1 } }, { session: tx.session, returnDocument: "after" });
      if (!updated) throw new CareerError(412, "career record version is stale");
      if (input.bodyMd !== undefined) {
        // 레거시 저장도 편집기 리비전으로 남기며, 동시 Yjs 변경이 있으면 충돌시킨다.
        const repository = new MongoCareerDocumentRepository(this.context);
        const current = existing.documentVersion ?? 0;
        if (existing.documentVersion == null) {
          const snapshotId = randomUUID();
          const initialized = await records.updateOne(
            { _id: recordId, userId, $or: [{ documentVersion: null }, { documentVersion: { $exists: false } }] },
            { $set: { documentVersion: 0, documentSchemaVersion: 1, latestSnapshotId: snapshotId } },
            { session: tx.session },
          );
          if (!initialized.modifiedCount) throw new CareerError(412, "document version is stale");
        }
        const next = await repository.bumpDocumentVersion(recordId, userId, current, undefined, tx.session);
        if (next === null) throw new CareerError(412, "document version is stale");
        const document = markdownToCareerDocument(input.bodyMd);
        const update = encodeDocumentAsYUpdate(document);
        const snapshotId = randomUUID();
        await repository.insertSnapshot({ _id: snapshotId, userId, recordId, documentVersion: next, version: next, schemaVersion: 1, content: document as never, stateVector: new Binary(Buffer.from(encodeDocumentStateVector(document))), serverSequence: next, checksum: hashUpdate(update), actor: "user", createdAt: new Date() }, tx.session);
        await records.updateOne({ _id: recordId, userId, documentVersion: next }, { $set: { latestSnapshotId: snapshotId } }, { session: tx.session });
        await repository.insertRevision({ _id: randomUUID(), userId, recordId, actor: "user", summary: "레거시 본문 저장", beforeVersion: current, afterVersion: next, snapshotId, createdAt: new Date() }, tx.session);
      }
      return mapMongoRecord(updated);
    });
  }

  async createView(userId: string, categoryId: string, inputValue: CreateCareerView) {
    const input = CreateCareerViewSchema.parse(inputValue);
    try {
      return await inTransaction(this.context, async (tx) => {
        await requireActiveUser(tx, userId);
        const category = await requireCareerCategory(tx, userId, categoryId, tx.session);
        const allowed = new Set(["title", "status", "period", ...Object.keys(category.propertySchema)]);
        for (const field of [...input.filters.map((item) => item.property), ...input.sorts.map((item) => item.property), ...input.visibleProperties]) {
          if (!allowed.has(field)) throw new CareerError(400, `view references an unknown property: ${field}`);
        }
        if (input.viewType === "timeline" && !Object.values(category.propertySchema).some((property) => property.type === "date")) throw new CareerError(400, "timeline views require a date property");
        const views = mongoCollections(tx.db).careerViews;
        const count = await views.countDocuments({ userId, categoryId }, { session: tx.session });
        if (count >= 8) throw new CareerError(409, "category view limit exceeded");
        const view: CareerViewDoc = { _id: randomUUID(), userId, categoryId, ...input, filters: input.filters.map(({ property, operator, value }) => value === undefined ? { property, operator } : { property, operator, value }), sortOrder: count, createdAt: new Date() };
        await views.insertOne(view, { session: tx.session });
        return mapMongoView(view);
      });
    } catch (error) { if (duplicate(error)) throw new CareerError(409, "career view name already exists"); throw error; }
  }

  async listViews(userId: string, categoryId: string) {
    await requireCareerCategory(this.context, userId, categoryId);
    return (await mongoCollections(this.context.db).careerViews.find({ userId, categoryId }).sort({ sortOrder: 1, _id: 1 }).toArray()).map(mapMongoView);
  }

  async getProfile(userId: string) {
    const user = await mongoCollections(this.context.db).users.findOne({ _id: userId });
    return user?.profile ? CareerProfileSchema.parse({ ...user.profile, updatedAt: user.profile.updatedAt.toISOString() }) : null;
  }

  async saveProfile(userId: string, inputValue: SaveCareerProfile) {
    const input = SaveCareerProfileSchema.parse(inputValue);
    return inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const profile = { ...input, targetRoles: [...new Set(input.targetRoles)], updatedAt: new Date() };
      await mongoCollections(tx.db).users.updateOne({ _id: userId }, { $set: { profile } }, { session: tx.session });
      return CareerProfileSchema.parse({ ...profile, updatedAt: profile.updatedAt.toISOString() });
    });
  }
}

export { CareerService as MongoCareerService };
