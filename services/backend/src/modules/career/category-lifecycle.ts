import { CareerCategoryDeleteImpactSchema, type CareerCategoryDeleteImpact } from "@expresso/contracts";
import { mongoCollections, type CareerCategoryDoc } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction, type MongoTransaction } from "../../platform/mongo-transaction.js";
import { requireActiveUser } from "../identity/index.js";
import { CareerError } from "./errors.js";
import { isBuiltInCareerCategory, mapMongoCategory } from "./mongo-categories.js";
import { purgeCareerRecordInTransaction } from "./mongo-record-guard.js";

type Reader = MongoContext | MongoTransaction;
const sessionOf = (reader: Reader) => ("session" in reader ? { session: reader.session } : {});

async function findCategory(reader: Reader, userId: string, categoryId: string): Promise<CareerCategoryDoc> {
  const category = await mongoCollections(reader.db).careerCategories.findOne({ _id: categoryId, userId }, sessionOf(reader));
  if (!category) throw new CareerError(404, "career category not found");
  return category;
}

/**
 * 보관은 사이드바 목록 정리일 뿐이라 `version`을 올리지 않습니다. `version`은 속성 스키마 변경의 If-Match가
 * 보는 값이어서, 올리면 열려 있는 화면의 다음 속성 변경이 412로 막힙니다.
 */
export async function archiveCareerCategory(context: MongoContext, userId: string, categoryId: string, archived: boolean, at = new Date()) {
  return inTransaction(context, async (tx) => {
    await requireActiveUser(tx, userId);
    const db = mongoCollections(tx.db);
    const updated = await db.careerCategories.findOneAndUpdate(
      { _id: categoryId, userId },
      { $set: { archivedAt: archived ? at : null } },
      { session: tx.session, returnDocument: "after" },
    );
    if (!updated) throw new CareerError(404, "career category not found");
    const recordCount = await db.careerRecords.countDocuments({ userId, categoryId, deletedAt: null }, { session: tx.session });
    return mapMongoCategory(updated, recordCount);
  });
}

/** 삭제 확인 창이 보여 줄 수와 삭제를 막는 이유. 삭제 자체도 같은 셈으로 다시 검사합니다. */
export async function careerCategoryDeleteImpact(reader: Reader, userId: string, categoryId: string): Promise<CareerCategoryDeleteImpact> {
  const db = mongoCollections(reader.db);
  const options = sessionOf(reader);
  const category = await findCategory(reader, userId, categoryId);
  const records = await db.careerRecords.find({ userId, categoryId }, { ...options, projection: { _id: 1, deletedAt: 1 } }).toArray();
  const recordIds = records.map((record) => record._id);
  const quoted = recordIds.length ? await db.recordUsages.distinct("recordId", { userId, recordId: { $in: recordIds } }, options) : [];
  // 같은 카테고리 안의 관계(자기 참조)는 함께 지워지므로 막지 않습니다. 지운 속성은 대상이 사라져도 문제가 없습니다.
  const referencing = await db.careerCategories.find({
    userId, _id: { $ne: categoryId },
    propertySchemaV2: { $elemMatch: { type: "relation", deletedAt: null, "config.targetCategoryId": categoryId } },
  }, options).toArray();
  const blockingProperties = referencing.flatMap((source) => source.propertySchemaV2
    .filter((property) => property.type === "relation" && property.deletedAt === null && (property.config as { targetCategoryId?: unknown }).targetCategoryId === categoryId)
    .map((property) => ({ categoryId: source._id, categoryName: source.name, propertyId: property.id, propertyName: property.name })));
  return CareerCategoryDeleteImpactSchema.parse({
    categoryId,
    builtIn: isBuiltInCareerCategory(category),
    recordCount: records.filter((record) => record.deletedAt == null).length,
    trashedRecordCount: records.filter((record) => record.deletedAt != null).length,
    quotedRecordCount: quoted.length,
    blockingProperties,
  });
}

/**
 * 직접 만든 카테고리를 영구 삭제합니다. 기록(휴지통 포함)이 있으면 `deleteRecords`가 참일 때만 함께 지웁니다.
 * 휴지통은 카테고리별이라 카테고리가 사라지면 복원할 화면이 없으므로, 기록도 휴지통을 거치지 않고 지웁니다.
 */
export async function deleteCareerCategory(context: MongoContext, userId: string, categoryId: string, deleteRecords: boolean) {
  await inTransaction(context, async (tx) => {
    await requireActiveUser(tx, userId);
    const db = mongoCollections(tx.db);
    const options = { session: tx.session };
    const impact = await careerCategoryDeleteImpact(tx, userId, categoryId);
    if (impact.builtIn) throw new CareerError(409, "built-in career category cannot be deleted");
    if (impact.blockingProperties.length) throw new CareerError(409, "career category is referenced by a relation property");
    if (impact.quotedRecordCount) throw new CareerError(409, "career category has records quoted by a portfolio");
    if (impact.recordCount + impact.trashedRecordCount > 0 && !deleteRecords) throw new CareerError(409, "career category has records");
    const recordIds = (await db.careerRecords.find({ userId, categoryId }, { ...options, projection: { _id: 1 } }).toArray()).map((record) => record._id);
    const coDeleted = new Set(recordIds);
    for (const recordId of recordIds) await purgeCareerRecordInTransaction(tx, userId, recordId, coDeleted);
    await db.careerViews.deleteMany({ userId, categoryId }, options);
    const removed = await db.careerCategories.deleteOne({ _id: categoryId, userId }, options);
    if (!removed.deletedCount) throw new CareerError(404, "career category not found");
  });
}
