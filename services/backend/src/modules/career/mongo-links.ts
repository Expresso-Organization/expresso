import { randomUUID } from "node:crypto";
import { CareerDeleteImpactSchema } from "@expresso/contracts";
import { mongoCollections, type RecordLinkDoc } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction, type MongoTransaction } from "../../platform/mongo-transaction.js";
import { requireActiveUser } from "../identity/index.js";
import { CareerError } from "./errors.js";
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
  return (await db.recordLinks.find({ userId, $or: [{ fromRecordId: recordId }, { toRecordId: recordId }] }).sort({ _id: 1 }).toArray()).map((link) => ({
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

export async function trashMongoRecord(context: MongoContext, userId: string, recordId: string, at: Date) {
  return inTransaction(context, async (tx) => {
    await requireActiveUser(tx, userId);
    await assertActiveRecordsForWrite(tx, userId, [recordId]);
    const impact = await mongoDeleteImpact(tx, userId, recordId, at);
    await mongoCollections(tx.db).careerRecords.updateOne({ _id: recordId, userId, deletedAt: null }, { $set: { deletedAt: at, purgeAfter: new Date(impact.purgeAfter), updatedAt: new Date() }, $inc: { version: 1 } }, { session: tx.session });
    return impact;
  });
}

export async function restoreMongoRecord(context: MongoContext, userId: string, recordId: string, at: Date) {
  return inTransaction(context, async (tx) => {
    await requireActiveUser(tx, userId);
    const record = await mongoCollections(tx.db).careerRecords.findOneAndUpdate({ _id: recordId, userId, deletedAt: { $ne: null }, purgeAfter: { $gt: at } }, { $set: { deletedAt: null, purgeAfter: null, updatedAt: new Date() }, $inc: { version: 1, referenceVersion: 1 } }, { session: tx.session, returnDocument: "after" });
    if (!record) throw new CareerError(404, "restorable career record not found");
    return mapMongoRecord(record);
  });
}
