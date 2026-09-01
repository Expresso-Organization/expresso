import { randomUUID } from "node:crypto";

import {
  CareerRelationDefinitionSchema,
  ReplaceCareerRelationTargetsSchema,
  type CareerRecord,
  type CareerRelationDefinition,
  type CareerRelationTarget,
  type ReplaceCareerRelationTargets,
} from "@expresso/contracts";
import { mongoCollections, type CareerCategoryDoc, type CareerRecordDoc } from "@expresso/database";

import { addMongoOutboxEvent } from "../../platform/mongo-outbox.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import type { MongoContext } from "../../platform/mongodb.js";
import { requireActiveUser } from "../identity/index.js";
import { CareerError } from "./errors.js";
import { requireCareerCategory } from "./mongo-categories.js";
import { assertActiveRecordsForWrite } from "./mongo-record-guard.js";
import { mapMongoRecord } from "./mongo-records.js";

export function careerCategoryDefinitions(category: CareerCategoryDoc) {
  return category.propertySchemaV2 ?? Object.entries(category.propertySchema).map(([key, property], order) => ({
    id: property.id ?? key,
    key,
    name: property.label,
    type: property.type === "boolean" ? "checkbox" : property.type === "tags" ? "multi_select" : property.type,
    required: property.required,
    system: property.system,
    config: {},
    order,
    version: 1,
    deletedAt: null,
  }));
}

function relationDefinition(category: CareerCategoryDoc, propertyId: string): CareerRelationDefinition {
  const property = careerCategoryDefinitions(category).find((definition) => definition.id === propertyId && definition.deletedAt === null);
  if (!property || property.type !== "relation") throw new CareerError(400, "relation property not found");
  const parsed = CareerRelationDefinitionSchema.safeParse(property.config);
  if (!parsed.success) throw new CareerError(400, "relation property configuration is invalid");
  return parsed.data;
}

export interface RelationService {
  replaceTargets(userId: string, recordId: string, propertyId: string, targetIds: readonly string[], expectedVersion: number): Promise<CareerRecord>;
  listTargets(userId: string, recordId: string, propertyId: string): Promise<readonly CareerRelationTarget[]>;
  removeForRecord(userId: string, recordId: string): Promise<void>;
}

/** 관계는 값 배열이 아니라 edge 원장에만 저장한다. 역방향 관계도 별도 edge로 동기화한다. */
export class MongoRelationService implements RelationService {
  constructor(readonly context: MongoContext) {}

  async replaceTargets(userId: string, recordId: string, rawPropertyId: string, rawTargetIds: readonly string[], expectedVersion: number): Promise<CareerRecord> {
    const input: ReplaceCareerRelationTargets = ReplaceCareerRelationTargetsSchema.parse({ propertyId: rawPropertyId, targetIds: rawTargetIds });
    const targetIds = [...new Set(input.targetIds)].sort();
    if (targetIds.includes(recordId)) throw new CareerError(400, "record cannot relate to itself");

    return inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const db = mongoCollections(tx.db);
      const source = await db.careerRecords.findOne({ _id: recordId, userId, deletedAt: null }, { session: tx.session });
      if (!source) throw new CareerError(404, "career record not found");
      if (source.version !== expectedVersion) throw new CareerError(412, "career record version is stale");
      const sourceCategory = await requireCareerCategory(tx, userId, source.categoryId, tx.session);
      const definition = relationDefinition(sourceCategory, input.propertyId);
      if (definition.cardinality === "single" && targetIds.length > 1) throw new CareerError(400, "single relation accepts one target");

      const targets = targetIds.length === 0 ? [] : await db.careerRecords.find({ _id: { $in: targetIds }, userId, deletedAt: null }, { session: tx.session }).toArray();
      if (targets.length !== targetIds.length) throw new CareerError(404, "relation target was not found");
      if (targets.some((target) => target.categoryId !== definition.targetCategoryId)) throw new CareerError(400, "relation target category does not match");

      const existing = await db.careerRecordRelations.find({ userId, sourceRecordId: recordId, sourcePropertyId: input.propertyId }, { session: tx.session }).toArray();
      const existingIds = existing.map((edge) => edge.targetRecordId).sort();
      if (existingIds.length === targetIds.length && existingIds.every((id, index) => id === targetIds[index])) return mapMongoRecord(source);

      // snapshot isolation에서 대상의 휴지통 이동과 경쟁하지 않도록 모든 참여 기록을 갱신한다.
      await assertActiveRecordsForWrite(tx, userId, [recordId, ...targetIds]);

      const targetCategories = new Map<string, CareerCategoryDoc>();
      for (const target of targets) {
        if (!targetCategories.has(target.categoryId)) targetCategories.set(target.categoryId, await requireCareerCategory(tx, userId, target.categoryId, tx.session));
      }
      const inverseByTarget = new Map<string, CareerRelationDefinition | null>();
      if (definition.inversePropertyId !== null) {
        for (const target of targets) {
          const targetCategory = targetCategories.get(target.categoryId)!;
          const inverse = relationDefinition(targetCategory, definition.inversePropertyId);
          if (inverse.targetCategoryId !== source.categoryId) throw new CareerError(409, "inverse relation target category has changed");
          inverseByTarget.set(target._id, inverse);
          if (inverse.cardinality === "single") {
            const other = await db.careerRecordRelations.findOne({
              userId,
              sourceRecordId: target._id,
              sourcePropertyId: definition.inversePropertyId,
              targetRecordId: { $ne: recordId },
            }, { session: tx.session });
            if (other) throw new CareerError(409, "inverse single relation already has a target");
          }
        }
      }

      // 기존 source edge와 그에 대응하는 inverse edge를 함께 제거한다.
      if (existing.length) {
        await db.careerRecordRelations.deleteMany({ userId, sourceRecordId: recordId, sourcePropertyId: input.propertyId }, { session: tx.session });
        for (const edge of existing) {
          if (edge.inversePropertyId) await db.careerRecordRelations.deleteMany({
            userId,
            sourceRecordId: edge.targetRecordId,
            sourcePropertyId: edge.inversePropertyId,
            targetRecordId: recordId,
          }, { session: tx.session });
        }
      }

      const now = new Date();
      for (const target of targets) {
        await db.careerRecordRelations.insertOne({
          _id: randomUUID(), userId, sourceRecordId: recordId, sourcePropertyId: input.propertyId,
          targetRecordId: target._id, inversePropertyId: definition.inversePropertyId,
          cardinality: definition.cardinality, deletePolicy: definition.deletePolicy, createdBy: "user", createdAt: now, updatedAt: now,
        }, { session: tx.session });
        const inverse = inverseByTarget.get(target._id);
        if (definition.inversePropertyId && inverse) {
          await db.careerRecordRelations.insertOne({
            _id: randomUUID(), userId, sourceRecordId: target._id, sourcePropertyId: definition.inversePropertyId,
            targetRecordId: recordId, inversePropertyId: input.propertyId,
            cardinality: inverse.cardinality, deletePolicy: inverse.deletePolicy, createdBy: "user", createdAt: now, updatedAt: now,
          }, { session: tx.session });
        }
      }

      const updated = await db.careerRecords.findOneAndUpdate(
        { _id: recordId, userId, deletedAt: null, version: expectedVersion },
        { $set: { updatedAt: now }, $inc: { version: 1 } },
        { session: tx.session, returnDocument: "after" },
      );
      if (!updated) throw new CareerError(412, "career record version is stale");
      await addMongoOutboxEvent(tx, {
        userId, topic: "career.computation", idempotencyKey: `career-relation:${recordId}:${input.propertyId}:${recordId}:v${updated.version}`,
        payload: { userId, recordId, changedPropertyIds: [input.propertyId], sourceRecordVersion: updated.version },
      });
      if (definition.inversePropertyId) for (const target of targets) {
        await addMongoOutboxEvent(tx, {
          userId, topic: "career.computation", idempotencyKey: `career-relation:${recordId}:${input.propertyId}:${target._id}:v${updated.version}`,
          payload: { userId, recordId: target._id, changedPropertyIds: [definition.inversePropertyId], sourceRecordVersion: target.version },
        });
      }
      return mapMongoRecord(updated);
    });
  }

  async removeForRecord(userId: string, recordId: string): Promise<void> {
    await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const db = mongoCollections(tx.db);
      const record = await db.careerRecords.findOne({ _id: recordId, userId }, { session: tx.session });
      if (!record) throw new CareerError(404, "career record not found");
      await db.careerRecordRelations.deleteMany({ userId, $or: [{ sourceRecordId: recordId }, { targetRecordId: recordId }] }, { session: tx.session });
    });
  }

  async listTargets(userId: string, recordId: string, propertyId: string): Promise<readonly CareerRelationTarget[]> {
    const db = mongoCollections(this.context.db);
    const source = await db.careerRecords.findOne({ _id: recordId, userId, deletedAt: null });
    if (!source) throw new CareerError(404, "career record not found");
    const sourceCategory = await requireCareerCategory(this.context, userId, source.categoryId);
    relationDefinition(sourceCategory, propertyId);
    const edges = await db.careerRecordRelations.find({ userId, sourceRecordId: recordId, sourcePropertyId: propertyId }).sort({ targetRecordId: 1 }).toArray();
    if (edges.length === 0) return [];
    const records = await db.careerRecords.find({ _id: { $in: edges.map((edge) => edge.targetRecordId) }, userId, deletedAt: null }).project({ _id: 1, title: 1 }).toArray();
    const titles = new Map(records.map((record) => [record._id, record.title]));
    return edges.flatMap((edge) => {
      const title = titles.get(edge.targetRecordId);
      return title === undefined ? [] : [{ recordId: edge.targetRecordId, title }];
    });
  }
}
