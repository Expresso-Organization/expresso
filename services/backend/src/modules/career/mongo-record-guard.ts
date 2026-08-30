import { mongoCollections } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction, type MongoTransaction } from "../../platform/mongo-transaction.js";
import { requireActiveUser } from "../identity/index.js";
import { CareerError } from "./errors.js";

export async function assertActiveRecordsForWrite(tx: MongoTransaction, userId: string, recordIds: readonly string[]): Promise<void> {
  for (const recordId of [...new Set(recordIds)].sort()) {
    const result = await mongoCollections(tx.db).careerRecords.updateOne({ _id: recordId, userId, deletedAt: null }, { $inc: { referenceVersion: 1 } }, { session: tx.session });
    if (result.matchedCount !== 1) throw new CareerError(404, "career record not found");
  }
}

// 휴지통 이동은 인용을 보존하고, 영구 삭제만 기존 RESTRICT 정책을 적용합니다.
export async function purgeTrashedCareerRecord(context: MongoContext, userId: string, recordId: string, at = new Date()) {
  return inTransaction(context, async (tx) => {
    await requireActiveUser(tx, userId);
    const db = mongoCollections(tx.db);
    const options = { session: tx.session };
    const record = await db.careerRecords.findOneAndUpdate({ _id: recordId, userId, deletedAt: { $ne: null }, purgeAfter: { $lte: at } }, { $inc: { referenceVersion: 1 } }, options);
    if (!record) throw new CareerError(404, "purgeable career record not found");
    if (await db.recordUsages.findOne({ userId, recordId }, options)) throw new CareerError(409, "record is still quoted by a portfolio block");
    await db.blocks.updateMany({ userId, sourceRecordId: recordId }, { $set: { sourceRecordId: null, syncState: "detached" } }, options);
    await db.recordLinks.deleteMany({ userId, $or: [{ fromRecordId: recordId }, { toRecordId: recordId }] }, options);
    await db.skillEvidence.deleteMany({ userId, recordId }, options);
    await db.answers.updateMany({ userId, createdRecordId: recordId }, { $set: { createdRecordId: null } }, options);
    await db.answerRecordChanges.deleteMany({ userId, recordId }, options);
    await db.recipeUnusedSources.deleteMany({ userId, recordId }, options);
    await db.portfolioEditProposals.deleteMany({ userId, sourceRecordId: recordId }, options);
    await db.brewSources.deleteMany({ userId, recordId }, options);
    await db.careerRecords.deleteOne({ _id: recordId, userId }, options);
  });
}
