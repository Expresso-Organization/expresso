import { randomUUID } from "node:crypto";
import { CareerDeleteImpactSchema, CareerTrashedRecordSchema } from "@expresso/contracts";
import { mongoCollections, type RecordLinkDoc } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import { addMongoOutboxEvent } from "../../platform/mongo-outbox.js";
import { inTransaction, type MongoTransaction } from "../../platform/mongo-transaction.js";
import { requireActiveUser } from "../identity/index.js";
import { CareerError } from "./errors.js";
import { requireCareerCategory } from "./mongo-categories.js";
import { assertActiveRecordsForWrite } from "./mongo-record-guard.js";
import { mapMongoRecord, usageLookup } from "./mongo-records.js";

export async function createMongoLink(context: MongoContext, userId: string, recordId: string, toRecordId: string, relation: RecordLinkDoc["relation"]) {
  if (recordId === toRecordId) throw new CareerError(400, "record cannot link itself");
  if (!["related", "parent", "duplicate_of"].includes(relation)) throw new CareerError(400, "invalid record relation");
  return inTransaction(context, async (tx) => {
    await requireActiveUser(tx, userId);
    await assertActiveRecordsForWrite(tx, userId, [recordId, toRecordId]);
    const [fromRecordId, targetRecordId] = relation === "parent" ? [recordId, toRecordId] as const : [recordId, toRecordId].sort() as [string, string];
    const filter = { userId, fromRecordId, toRecordId: targetRecordId, relation };
    const link = await mongoCollections(tx.db).recordLinks.findOneAndUpdate(filter, { $setOnInsert: { _id: randomUUID(), ...filter, createdBy: "user" } }, { session: tx.session, upsert: true, returnDocument: "after" });
    if (!link) throw new Error("career link was not persisted");
    return { id: link._id, from_record_id: link.fromRecordId, to_record_id: link.toRecordId, relation: link.relation };
  });
}

export async function listMongoLinks(context: MongoContext, userId: string, recordId: string) {
  const db = mongoCollections(context.db);
  if (!await db.careerRecords.findOne({ _id: recordId, userId, deletedAt: null })) throw new CareerError(404, "career record not found");
  return (await db.recordLinks.find({ userId, $or: [{ fromRecordId: recordId }, { toRecordId: recordId }] }).sort({ _id: 1 }).limit(1_000).toArray()).map((link) => ({
    id: link._id, recordId, relatedRecordId: link.fromRecordId === recordId ? link.toRecordId : link.fromRecordId, relation: link.relation, direction: link.fromRecordId === recordId ? "outgoing" as const : "incoming" as const,
  }));
}

export async function mongoDeleteImpact(context: MongoContext | MongoTransaction, userId: string, recordId: string, at: Date) {
  const session = "session" in context ? context.session : undefined;
  const [record] = await mongoCollections(context.db).careerRecords.aggregate<{ usage: { portfolioCount: number; blockCount: number }[] }>([
    { $match: { _id: recordId, userId, deletedAt: null } }, ...usageLookup(userId),
  ], session ? { session } : {}).toArray();
  if (!record) throw new CareerError(404, "career record not found");
  return CareerDeleteImpactSchema.parse({ recordId, portfolioCount: record.usage[0]?.portfolioCount ?? 0, blockCount: record.usage[0]?.blockCount ?? 0, deletedAt: at.toISOString(), purgeAfter: new Date(at.getTime() + 30 * 86_400_000).toISOString() });
}

/**
 * 이 기록을 관계로 가리키는 기록의 수식 · 롤업을 다시 계산하게 합니다. 휴지통 기록은 롤업에서 빠지므로
 * 옮기거나 되살릴 때 다시 계산하지 않으면 롤업 값이 다음 변경 때까지 낡은 채 남습니다(2026-11-02 감사).
 */
async function enqueueInboundRecomputation(tx: MongoTransaction, userId: string, recordId: string, reason: string, at: Date) {
  const db = mongoCollections(tx.db); const options = { session: tx.session };
  const edges = await db.careerRecordRelations.find({ userId, targetRecordId: recordId }, options).limit(1_000).toArray();
  const bySource = new Map<string, Set<string>>();
  for (const edge of edges) {
    const set = bySource.get(edge.sourceRecordId) ?? new Set<string>();
    set.add(edge.sourcePropertyId); bySource.set(edge.sourceRecordId, set);
  }
  for (const [sourceId, propertyIds] of bySource) {
    const source = await db.careerRecords.findOne({ _id: sourceId, userId, deletedAt: null }, options);
    if (!source) continue;
    const category = await db.careerCategories.findOne({ _id: source.categoryId, userId }, options);
    const computed = category?.propertySchemaV2.filter((item) => item.deletedAt === null && (item.type === "formula" || item.type === "rollup")).map((item) => item.id) ?? [];
    await addMongoOutboxEvent(tx, {
      userId, topic: "career.computation", idempotencyKey: `career-${reason}:${recordId}:${sourceId}:v${source.version}:${at.getTime()}`,
      payload: { userId, recordId: sourceId, changedPropertyIds: [...new Set([...propertyIds, ...computed])], sourceRecordVersion: source.version },
    });
  }
}

export async function trashMongoRecord(context: MongoContext, userId: string, recordId: string, at: Date) {
  return inTransaction(context, async (tx) => {
    await requireActiveUser(tx, userId);
    await assertActiveRecordsForWrite(tx, userId, [recordId]);
    const impact = await mongoDeleteImpact(tx, userId, recordId, at);
    await mongoCollections(tx.db).careerRecords.updateOne({ _id: recordId, userId, deletedAt: null }, { $set: { deletedAt: at, purgeAfter: new Date(impact.purgeAfter), updatedAt: new Date() }, $inc: { version: 1 } }, { session: tx.session });
    await tx.db.collection("career_evidence_index").deleteMany({ userId, recordId }, { session: tx.session });
    await enqueueInboundRecomputation(tx, userId, recordId, "trash", at);
    return impact;
  });
}

export async function restoreMongoRecord(context: MongoContext, userId: string, recordId: string, at: Date) {
  return inTransaction(context, async (tx) => {
    await requireActiveUser(tx, userId);
    const record = await mongoCollections(tx.db).careerRecords.findOneAndUpdate({ _id: recordId, userId, deletedAt: { $ne: null }, purgeAfter: { $gt: at } }, { $set: { deletedAt: null, purgeAfter: null, updatedAt: new Date() }, $inc: { version: 1, referenceVersion: 1 } }, { session: tx.session, returnDocument: "after" });
    if (!record) throw new CareerError(404, "restorable career record not found");
    await enqueueInboundRecomputation(tx, userId, recordId, "restore", at);
    return mapMongoRecord(record);
  });
}

// 휴지통 목록은 최근에 지운 순서로 보입니다. 보관 기간이 지난 기록은 복원할 수 없어 뺍니다.
export async function listTrashedMongoRecords(context: MongoContext, userId: string, categoryId: string, at: Date) {
  await requireCareerCategory(context, userId, categoryId);
  const rows = await mongoCollections(context.db).careerRecords
    .find({ userId, categoryId, deletedAt: { $ne: null }, purgeAfter: { $gt: at } })
    .sort({ deletedAt: -1, _id: 1 })
    .limit(200)
    .toArray();
  return rows.map((row) => CareerTrashedRecordSchema.parse({ ...mapMongoRecord(row), deletedAt: row.deletedAt!.toISOString(), purgeAfter: row.purgeAfter!.toISOString() }));
}
