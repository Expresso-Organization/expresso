import { randomUUID } from "node:crypto";
import { careerDocumentToMarkdown, encodeDocumentAsYUpdate, encodeDocumentStateVector, encodeDocumentUpdatesStateVector, markdownToCareerDocument, parseCareerDocument, reconstructYDocument } from "@expresso/editor";
import { CareerProfileSchema, CreateCareerCategorySchema, CreateCareerRecordSchema, SaveCareerProfileSchema, UpdateCareerRecordSchema, type CreateCareerCategory, type CreateCareerRecord, type ListCareerRecordsQuery, type SaveCareerProfile, type UpdateCareerRecord } from "@expresso/contracts";
import { mongoCollections, type CareerCategoryDoc, type CareerRecordDoc } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import { readCareerSnapshotUpdate } from "../../platform/career-document-snapshot.js";
import { addMongoOutboxEvent } from "../../platform/mongo-outbox.js";
import { requireActiveUser } from "../identity/index.js";
import { CareerError } from "./errors.js";
import { validateCareerProperties } from "./properties.js";
import { mapMongoCategory, requireCareerCategory } from "./mongo-categories.js";
import { careerRequestHash, listMongoRecords, mapMongoRecord } from "./mongo-records.js";
import type { CareerApi } from "./index.js";
import type { RecomputeCareerSkill } from "@expresso/contracts";
import { createMongoLink, listMongoLinks, mongoDeleteImpact, trashMongoRecord, restoreMongoRecord } from "./mongo-links.js";
import { recomputeMongoSkill, listMongoSkills, listMongoSkillEvidence } from "./mongo-skills.js";
import { MongoCareerDocumentRepository, hashUpdate } from "../career-editor/repository.js";
import { Binary } from "mongodb";
import { readCareerPropertyMutationStatus,resumeCareerPropertyMutation } from "./property-mutation-status.js";
import { normalizeCanonicalConfiguration, registerCanonicalCareerPropertyOption } from "./canonical-property-schema.js";
import { MongoCareerPropertySchemaService } from "./property-schema.js";
import { CareerViewService } from "./views.js";
import { MongoCategoryMoveService } from "./category-move.js";
import { MongoRelationService } from "./relations.js";
import { MongoCareerComputationService } from "../career-computation/index.js";

const duplicate = (error: unknown) => (error as { code?: number })?.code === 11000;
/** 기본 7종과 사용자가 더한 카테고리 100개. */
const CATEGORY_LIMIT = 107;

export class CareerService implements CareerApi {
  constructor(readonly context: MongoContext) {}

  getPropertyMutationStatus(userId:string,mutationId:string) {return readCareerPropertyMutationStatus(this.context,userId,mutationId); }
  resumePropertyMutation(userId:string,mutationId:string) {return resumeCareerPropertyMutation(this.context,userId,mutationId); }
  registerPropertyOption(userId:string,categoryId:string,propertyId:string,input:import("@expresso/contracts").CareerRegisterPropertyOption) { return registerCanonicalCareerPropertyOption(this.context,userId,categoryId,propertyId,input); }
  previewChange(userId: string, categoryId: string, change: import("@expresso/contracts").CareerPropertySchemaChange) { return new MongoCareerPropertySchemaService(this.context).previewChange(userId, categoryId, change); }
  applyChange(userId: string, categoryId: string, expectedVersion: number, idempotencyKey: string, input: import("@expresso/contracts").ApplyCareerPropertyChange) { return new MongoCareerPropertySchemaService(this.context).applyChange(userId, categoryId, expectedVersion, idempotencyKey, input); }
  restoreProperty(userId: string, categoryId: string, propertyId: string, expectedVersion: number) { return new MongoCareerPropertySchemaService(this.context).restoreProperty(userId, categoryId, propertyId, expectedVersion); }

  listViewConfigurations(userId: string, categoryId: string) { return new CareerViewService(this.context, { source: "legacy" }).list(userId, categoryId); }
  createViewConfiguration(userId: string, categoryId: string, expectedCategoryVersion: number, input: import("./views.js").CreateCareerViewConfiguration) { return new CareerViewService(this.context, { source: "legacy" }).create(userId, categoryId, expectedCategoryVersion, input); }
  updateViewConfiguration(userId: string, viewId: string, expectedVersion: number, input: import("./views.js").UpdateCareerViewConfiguration) { return new CareerViewService(this.context, { source: "legacy" }).update(userId, viewId, expectedVersion, input); }
  duplicateViewConfiguration(userId: string, viewId: string, expectedVersion: number, name: string) { return new CareerViewService(this.context, { source: "legacy" }).duplicate(userId, viewId, expectedVersion, name); }
  deleteViewConfiguration(userId: string, viewId: string, expectedVersion: number) { return new CareerViewService(this.context, { source: "legacy" }).delete(userId, viewId, expectedVersion); }
  reorderViewConfigurations(userId: string, categoryId: string, expectedCategoryVersion: number, orderedIds: readonly string[]) { return new CareerViewService(this.context, { source: "legacy" }).reorder(userId, categoryId, expectedCategoryVersion, orderedIds); }
  queryViewConfiguration(userId: string, viewId: string, cursor: string | null, limit: number) { return new CareerViewService(this.context, { source: "legacy" }).query(userId, viewId, cursor, limit); }
  replaceTargets(userId: string, recordId: string, propertyId: string, targetIds: readonly string[], expectedVersion: number) { return new MongoRelationService(this.context).replaceTargets(userId, recordId, propertyId, targetIds, expectedVersion); }
  listRelationTargets(userId: string, recordId: string, propertyId: string) { return new MongoRelationService(this.context).listTargets(userId, recordId, propertyId); }
  removeRelationTargetsForRecord(userId: string, recordId: string) { return new MongoRelationService(this.context).removeForRecord(userId, recordId); }
  previewCategoryMove(userId: string, recordId: string, targetCategoryId: string) { return new MongoCategoryMoveService(this.context).preview(userId, recordId, targetCategoryId); }
  commitCategoryMove(userId: string, recordId: string, input: unknown) { return new MongoCategoryMoveService(this.context).commit(userId, recordId, input); }
  previewFormula(userId: string, input: import("@expresso/contracts").PreviewCareerFormula) { return new MongoCareerComputationService(this.context).previewFormula(userId, input); }
  previewRollup(userId: string, input: import("@expresso/contracts").PreviewCareerRollup) { return new MongoCareerComputationService(this.context).previewRollup(userId, input); }

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
      { $match: { userId } },
      { $sort: { sortOrder: 1, _id: 1 } },
      { $limit: CATEGORY_LIMIT },
      { $lookup: { from: "career_records", let: { categoryId: "$_id" }, pipeline: [{ $match: { userId, deletedAt: null, $expr: { $eq: ["$categoryId", "$$categoryId"] } } }, { $count: "total" }], as: "counts" } },
    ]).toArray();
    return rows.map((row) => mapMongoCategory(row, row.counts[0]?.total ?? 0));
  }

  listRecords(userId: string, query: ListCareerRecordsQuery) { return listMongoRecords(this.context, userId, query); }

  async createCategory(userId: string, inputValue: CreateCareerCategory) {
    const input = CreateCareerCategorySchema.parse(inputValue);
    input.propertySchemaV2=input.propertySchemaV2.map(definition=>definition.type==="select" || definition.type==="multi_select"
      ? {...definition,config:normalizeCanonicalConfiguration(definition.type,definition.config)} : definition);
    const keys = new Set(input.propertySchemaV2.map((definition) => definition.key));
    const ids = new Set(input.propertySchemaV2.map((definition) => definition.id));
    if (keys.size !== input.propertySchemaV2.length || ids.size !== input.propertySchemaV2.length) throw new CareerError(400, "property keys and IDs must be unique");
    try {
      return await inTransaction(this.context, async (tx) => {
        await requireActiveUser(tx, userId);
        const categories = mongoCollections(tx.db).careerCategories;
        const owned = await categories.find({ userId }, { session: tx.session }).project<{ sortOrder: number }>({ sortOrder: 1 }).toArray();
        if (owned.length >= CATEGORY_LIMIT) throw new CareerError(409, "career category limit exceeded");
        const sortOrder = Math.max(-1, ...owned.map((category) => category.sortOrder)) + 1;
        const category: CareerCategoryDoc = { _id: randomUUID(), userId, ...input, sortOrder, schemaVersion: 1, version: 1, updatedAt: new Date() };
        await categories.insertOne(category, { session: tx.session });
        return mapMongoCategory(category);
      });
    } catch (error) { if (duplicate(error)) throw new CareerError(409, "career category key already exists"); throw error; }
  }

  async createRecord(userId: string, idempotencyKey: string, inputValue: CreateCareerRecord) {
    const input = CreateCareerRecordSchema.parse(inputValue);
    if (input.propertyValues !== undefined) throw new CareerError(503, "canonical business writes require Spring");
    const { propertyValues: _canonical, ...legacyInput } = input;
    const hash = careerRequestHash(input);
    return inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const category = await requireCareerCategory(tx, userId, input.categoryId, tx.session);
      validateCareerProperties(category.propertySchemaV2, input.properties);
      const records = mongoCollections(tx.db).careerRecords;
      const existing = await records.findOne({ userId, createIdempotencyKey: idempotencyKey }, { session: tx.session });
      if (existing) {
        if (existing.createRequestHash !== hash) throw new CareerError(409, "idempotency key was reused with another request");
        return { record: mapMongoRecord(existing), created: false };
      }
      const now = new Date();
      const record: CareerRecordDoc = { _id: randomUUID(), userId, ...legacyInput, status: "draft", origin: "manual", version: 1, createdAt: now, updatedAt: now, deletedAt: null, purgeAfter: null, createIdempotencyKey: idempotencyKey, createRequestHash: hash };
      await records.insertOne(record, { session: tx.session });
      const definitions = category.propertySchemaV2.filter((definition) => definition.deletedAt === null);
      const changedPropertyIds = definitions.filter((definition) => definition.type === "formula" || definition.type === "rollup" || Object.hasOwn(input.properties, definition.key) || (definition.type === "title" && input.title !== "")).map((definition) => definition.id);
      if (changedPropertyIds.length > 0) await addMongoOutboxEvent(tx, {
        userId, topic: "career.computation", idempotencyKey: `career-record-create:${record._id}:v1`,
        payload: { userId, recordId: record._id, changedPropertyIds, sourceRecordVersion: 1, sourcePropertyVersions: Object.fromEntries(definitions.filter((definition) => changedPropertyIds.includes(definition.id)).map((definition) => [definition.id, definition.version])) },
      });
      return { record: mapMongoRecord(record), created: true };
    });
  }

  async getRecord(userId: string, recordId: string) {
    const record = await mongoCollections(this.context.db).careerRecords.findOne({ _id: recordId, userId, deletedAt: null });
    if (!record) throw new CareerError(404, "career record not found");
    const snapshot = await mongoCollections(this.context.db).careerDocumentSnapshots.findOne({ recordId }, { sort: { documentVersion: -1, schemaVersion: -1 } });
    // BlockNote 문서(schemaVersion 2)는 편집기가 저장 뒤 bodyMd를 직접 투영합니다.
    if (!snapshot || snapshot.schemaVersion === 2) return mapMongoRecord(record);
    try {
      const updates = await mongoCollections(this.context.db).careerDocumentUpdates.find({ recordId, serverSequence: { $gt: snapshot.serverSequence }, compactedAt: null }).sort({ serverSequence: 1 }).limit(10_001).toArray();
      if (updates.length > 10_000) throw new CareerError(503, "document compaction is required before legacy projection");
      const document = reconstructYDocument([readCareerSnapshotUpdate(snapshot), ...updates.map((row) => new Uint8Array(row.update.buffer))]);
      return mapMongoRecord(record, careerDocumentToMarkdown(document));
    }
    catch { return mapMongoRecord(record); }
  }

  async updateRecord(userId: string, recordId: string, expectedVersion: number, inputValue: UpdateCareerRecord) {
    const input = UpdateCareerRecordSchema.parse(inputValue);
    if (input.propertyValues !== undefined) throw new CareerError(503, "canonical business writes require Spring");
    return inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const records = mongoCollections(tx.db).careerRecords;
      const existing = await records.findOne({ _id: recordId, userId, deletedAt: null }, { session: tx.session });
      if (!existing) throw new CareerError(404, "career record not found");
      if (existing.version !== expectedVersion) throw new CareerError(412, "career record version is stale");
      if (input.bodyMd !== undefined && "documentReservation" in existing && existing.documentReservation != null) throw new CareerError(409, "document is reserved by a prepared writer");
      // BlockNote 문서는 bodyMd만 바꿉니다. 편집기 문서는 다음 bootstrap이 documentBodyHash 비교로 이 내용에 맞춥니다.
      const blockNoteBody = existing.documentSchemaVersion === 2;
      if (input.bodyMd !== undefined && !blockNoteBody) {
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
      if (input.properties !== undefined) validateCareerProperties(category.propertySchemaV2, input.properties);
      const computationDefinitions = category.propertySchemaV2.filter((definition) => definition.deletedAt === null);
      const changedPropertyIds = computationDefinitions.filter((definition) => {
        if (definition.type === "title") return input.title !== undefined && input.title !== existing.title;
        return JSON.stringify(existing.properties[definition.key] ?? null) !== JSON.stringify(properties[definition.key] ?? null);
      }).map((definition) => definition.id);
      const updated = await records.findOneAndUpdate({ _id: recordId, userId, deletedAt: null, version: expectedVersion }, { $set: { title: input.title ?? existing.title, status: input.status ?? existing.status, bodyMd: input.bodyMd ?? existing.bodyMd, properties, updatedAt: new Date() }, $inc: { version: 1 } }, { session: tx.session, returnDocument: "after" });
      if (!updated) throw new CareerError(412, "career record version is stale");
      if (input.bodyMd !== undefined && !blockNoteBody) {
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
        const previousSnapshot = await repository.snapshot(recordId, tx.session);
        const priorUpdates = previousSnapshot ? [readCareerSnapshotUpdate(previousSnapshot)] : [encodeDocumentAsYUpdate(markdownToCareerDocument(existing.bodyMd))];
        const snapshotId = randomUUID();
        const stateUpdate = encodeDocumentAsYUpdate(document, priorUpdates, `legacy:${snapshotId}`);
        const update = encodeDocumentAsYUpdate(document);
        await repository.insertSnapshot({ _id: snapshotId, userId, recordId, documentVersion: next, version: next, schemaVersion: 1, content: document as never, stateUpdate: new Binary(Buffer.from(stateUpdate)), stateVector: new Binary(Buffer.from(encodeDocumentUpdatesStateVector([stateUpdate]))), serverSequence: next, checksum: hashUpdate(update), actor: "user", createdAt: new Date() }, tx.session);
        await records.updateOne({ _id: recordId, userId, documentVersion: next }, { $set: { latestSnapshotId: snapshotId } }, { session: tx.session });
        await repository.insertRevision({ _id: randomUUID(), userId, recordId, actor: "user", summary: "레거시 본문 저장", beforeVersion: current, afterVersion: next, snapshotId, createdAt: new Date() }, tx.session);
      }
      if (changedPropertyIds.length > 0) await addMongoOutboxEvent(tx, {
        userId, topic: "career.computation", idempotencyKey: `career-record:${recordId}:v${updated.version}`,
        payload: {
          userId, recordId, changedPropertyIds, sourceRecordVersion: updated.version,
          sourcePropertyVersions: Object.fromEntries(computationDefinitions.filter((definition) => changedPropertyIds.includes(definition.id)).map((definition) => [definition.id, definition.version])),
        },
      });
      return mapMongoRecord(updated);
    });
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
