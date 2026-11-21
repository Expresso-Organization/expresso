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
    // 조건 검사와 쓰기 잠금을 한 번에 겁니다. 그 사이 복원이 끼어들면 트랜잭션이 충돌로 다시 돕니다.
    const record = await mongoCollections(tx.db).careerRecords.findOneAndUpdate({ _id: recordId, userId, deletedAt: { $ne: null }, purgeAfter: { $lte: at } }, { $inc: { referenceVersion: 1 } }, { session: tx.session });
    if (!record) throw new CareerError(404, "purgeable career record not found");
    await purgeCareerRecordInTransaction(tx, userId, recordId);
  });
}

/**
 * 기록 하나와 그 기록에 딸린 것을 모두 지웁니다. 휴지통 · 보관 기간 조건은 부르는 쪽이 확인합니다.
 * `coDeleted`는 같은 트랜잭션에서 함께 지우는 기록입니다. 「삭제 제한」 관계의 원천이 그 안에 있으면 막지 않습니다.
 */
export async function purgeCareerRecordInTransaction(tx: MongoTransaction, userId: string, recordId: string, coDeleted: ReadonlySet<string> = new Set()) {
  const db = mongoCollections(tx.db);
  const options = { session: tx.session };
  const record = await db.careerRecords.findOneAndUpdate({ _id: recordId, userId }, { $inc: { referenceVersion: 1 } }, options);
  if (!record) throw new CareerError(404, "career record not found");
  if (await db.recordUsages.findOne({ userId, recordId }, options)) throw new CareerError(409, "record is still quoted by a portfolio block");
  // 「삭제 제한」 관계가 가리키는 기록은 영구 삭제하지 않습니다. 휴지통 이동은 되돌릴 수 있으므로 막지 않습니다.
  const restricting = (await db.careerRecordRelations.find({ userId, targetRecordId: recordId, deletePolicy: "restrict" }, options).toArray())
    .filter((edge) => !coDeleted.has(edge.sourceRecordId));
  if (restricting.length && await db.careerRecords.findOne({ _id: { $in: restricting.map((edge) => edge.sourceRecordId) }, userId, deletedAt: null }, options)) {
    throw new CareerError(409, "record is referenced by a restricted relation");
  }
  await db.blocks.updateMany({ userId, sourceRecordId: recordId }, { $set: { sourceRecordId: null, syncState: "detached" } }, options);
  await db.recordLinks.deleteMany({ userId, $or: [{ fromRecordId: recordId }, { toRecordId: recordId }] }, options);
  await db.skillEvidence.deleteMany({ userId, recordId }, options);
  await db.answers.updateMany({ userId, createdRecordId: recordId }, { $set: { createdRecordId: null } }, options);
  await db.answerRecordChanges.deleteMany({ userId, recordId }, options);
  await db.recipeUnusedSources.deleteMany({ userId, recordId }, options);
  await db.portfolioEditProposals.deleteMany({ userId, sourceRecordId: recordId }, options);
  await db.brewSources.deleteMany({ userId, recordId }, options);
  // 편집기 문서 · 이력 · 관계 · AI 제안도 지웁니다. 남기면 지운 기록의 본문이 DB에 그대로 남습니다.
  await db.careerDocumentSnapshots.deleteMany({ recordId }, options);
  await db.careerDocumentUpdates.deleteMany({ recordId }, options);
  await db.careerRecordRevisions.deleteMany({ userId, recordId }, options);
  await db.careerAiProposals.deleteMany({ userId, recordId }, options);
  await db.careerRecordRelations.deleteMany({ userId, $or: [{ sourceRecordId: recordId }, { targetRecordId: recordId }] }, options);
  await db.careerRecords.deleteOne({ _id: recordId, userId }, options);
}
