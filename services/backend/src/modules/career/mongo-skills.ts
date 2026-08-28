import { randomUUID } from "node:crypto";
import { Decimal128 } from "mongodb";
import { CareerSkillSchema, RecomputeCareerSkillSchema, type RecomputeCareerSkill } from "@expresso/contracts";
import { mongoCollections, type SkillDoc, type SkillEvidenceDoc, type CareerRecordDoc } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import { requireActiveUser } from "../identity/index.js";
import { CareerError } from "./errors.js";
import { assertActiveRecordsForWrite } from "./mongo-record-guard.js";
import { computeSkillAggregate, normalizeSkillName } from "./skills.js";

function mapSkill(skill: SkillDoc) {
  return CareerSkillSchema.parse({ id: skill._id, name: skill.name, level: skill.level, evidenceCount: skill.evidenceCount, strength: skill.strength, lastUsedAt: skill.lastUsedAt?.toISOString(), computedAt: skill.computedAt.toISOString() });
}

export async function recomputeMongoSkill(context: MongoContext, userId: string, inputValue: RecomputeCareerSkill, computedAt: Date) {
  const input = RecomputeCareerSkillSchema.parse(inputValue);
  const name = normalizeSkillName(input.name);
  if (!name) throw new CareerError(400, "skill name is empty");
  const ids = input.evidence.map((item) => item.recordId);
  if (new Set(ids).size !== ids.length) throw new CareerError(400, "one evidence span is allowed per record");
  return inTransaction(context, async (tx) => {
    await requireActiveUser(tx, userId);
    await assertActiveRecordsForWrite(tx, userId, ids);
    const db = mongoCollections(tx.db);
    const options = { session: tx.session };
    const records = await db.careerRecords.find({ userId, _id: { $in: ids }, deletedAt: null }, options).toArray();
    for (const record of records) {
      if (!await db.careerCategories.findOne({ _id: record.categoryId, isSystem: true }, options)) throw new CareerError(404, "skill evidence record not found");
    }
    const byId = new Map(records.map((record) => [record._id, record]));
    for (const evidence of input.evidence) {
      const record = byId.get(evidence.recordId);
      if (!record) throw new CareerError(404, "skill evidence record not found");
      const source = evidence.span.source === "title" ? record.title : record.bodyMd;
      if (source.slice(evidence.span.start, evidence.span.end) !== evidence.span.quote) throw new CareerError(400, "skill evidence span does not match record source");
    }
    const lastUsedAt = new Date(Math.max(...records.map((record) => record.updatedAt.getTime())));
    const aggregate = computeSkillAggregate(ids.length, lastUsedAt, computedAt);
    const skill = await db.skills.findOneAndUpdate({ userId, name }, { $set: { ...aggregate, computedAt, lastUsedAt, evidenceCount: ids.length }, $setOnInsert: { _id: randomUUID(), userId, name } }, { ...options, upsert: true, returnDocument: "after" });
    if (!skill) throw new Error("career skill was not persisted");
    await db.skillEvidence.deleteMany({ userId, skillId: skill._id }, options);
    await db.skillEvidence.insertMany(input.evidence.map((evidence) => ({ _id: randomUUID(), userId, skillId: skill._id, recordId: evidence.recordId, weight: Decimal128.fromString("1"), extractedSpan: evidence.span })), options);
    return mapSkill(skill);
  });
}

export async function listMongoSkills(context: MongoContext, userId: string) {
  return (await mongoCollections(context.db).skills.find({ userId, evidenceCount: { $gt: 0 } }).sort({ level: -1, evidenceCount: -1, name: 1 }).toArray()).map(mapSkill);
}

export async function listMongoSkillEvidence(context: MongoContext, userId: string, skillId: string) {
  const db = mongoCollections(context.db);
  if (!await db.skills.findOne({ _id: skillId, userId })) throw new CareerError(404, "career skill not found");
  const evidence = await db.skillEvidence.aggregate<SkillEvidenceDoc & { record: CareerRecordDoc }>([
    { $match: { userId, skillId } },
    { $lookup: { from: "career_records", localField: "recordId", foreignField: "_id", pipeline: [{ $match: { userId, deletedAt: null } }], as: "record" } },
    { $unwind: "$record" }, { $sort: { "record.updatedAt": -1, recordId: 1 } },
  ]).toArray();
  return evidence.map((item) => ({ recordId: item.recordId, recordTitle: item.record.title, span: RecomputeCareerSkillSchema.shape.evidence.element.shape.span.parse(item.extractedSpan) }));
}
