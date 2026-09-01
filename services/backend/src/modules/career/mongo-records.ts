import { createHash } from "node:crypto";
import { CareerPropertyValueV2Schema, CareerRecordSchema, CareerRecordListResponseSchema, ListCareerRecordsQuerySchema, type CreateCareerRecord, type ListCareerRecordsQuery } from "@expresso/contracts";
import { mongoCollections, type CareerRecordDoc } from "@expresso/database";
import type { Document } from "mongodb";
import type { MongoContext } from "../../platform/mongodb.js";
import { CareerError } from "./errors.js";

export function mapMongoRecord(record: CareerRecordDoc, bodyMd = record.bodyMd) {
  const computedProperties = Object.fromEntries(Object.entries(record.computedProperties ?? {}).flatMap(([key, value]) => {
    const parsed = CareerPropertyValueV2Schema.safeParse(value);
    return key === "__expressoComputation" || !parsed.success || (parsed.data.type !== "formula" && parsed.data.type !== "rollup") ? [] : [[key, parsed.data]];
  }));
  return CareerRecordSchema.parse({ id: record._id, categoryId: record.categoryId, title: record.title, status: record.status, origin: record.origin, properties: record.properties, ...(Object.keys(computedProperties).length ? { computedProperties } : {}), bodyMd, version: record.version, updatedAt: record.updatedAt.toISOString() });
}

export function careerRequestHash(input: CreateCareerRecord) {
  const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable)
    : value !== null && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)])) : value;
  return createHash("sha256").update(JSON.stringify(stable(input))).digest("hex");
}

// 인용 수와 포트폴리오 수는 소유자 조건을 연결 단계마다 적용합니다.
export function usageLookup(userId: string): Document[] {
  return [{ $lookup: { from: "record_usages", let: { recordId: "$_id" }, pipeline: [
    { $match: { userId, $expr: { $eq: ["$recordId", "$$recordId"] } } },
    { $lookup: { from: "blocks", localField: "blockId", foreignField: "_id", pipeline: [{ $match: { userId } }], as: "block" } },
    { $unwind: { path: "$block", preserveNullAndEmptyArrays: true } },
    { $lookup: { from: "portfolio_sections", localField: "block.portfolioSectionId", foreignField: "_id", pipeline: [{ $match: { userId } }], as: "section" } },
    { $unwind: { path: "$section", preserveNullAndEmptyArrays: true } },
    { $group: { _id: null, blocks: { $addToSet: "$blockId" }, portfolios: { $addToSet: { $ifNull: ["$section.portfolioId", null] } } } },
    { $project: { _id: 0, blockCount: { $size: "$blocks" }, portfolioCount: { $size: { $setDifference: ["$portfolios", [null]] } } } },
  ], as: "usage" } }];
}

export async function listMongoRecords(context: MongoContext, userId: string, queryInput: ListCareerRecordsQuery) {
  const query = ListCareerRecordsQuerySchema.parse(queryInput);
  const match: Document = { userId, deletedAt: null };
  if (query.categoryId) match.categoryId = query.categoryId;
  if (query.status) match.status = query.status;
  if (query.origin) match.origin = query.origin;
  if (query.q) match.title = { $regex: query.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  const descending = query.sort === "updated_desc" || query.sort === "period_desc";
  const direction = descending ? -1 : 1;
  const sortKey = query.sort === "title_asc" ? "$title" : query.sort.startsWith("period_")
    ? { $ifNull: ["$periodStart", descending ? "0001-01-01" : "9999-12-31"] }
    : { $dateToString: { date: "$updatedAt", format: "%Y-%m-%dT%H:%M:%S.%LZ", timezone: "UTC" } };
  const pageStages: Document[] = [];
  if (query.cursor) {
    let cursor: { sort: string; key: string; id: string };
    try {
      cursor = JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8"));
      if (!cursor || cursor.sort !== query.sort || typeof cursor.key !== "string" || typeof cursor.id !== "string") throw new Error();
    } catch { throw new CareerError(400, "invalid career record cursor"); }
    const operator = descending ? "$lt" : "$gt";
    pageStages.push({ $match: { $or: [{ sortKey: { [operator]: cursor.key } }, { sortKey: cursor.key, _id: { [operator]: cursor.id } }] } });
  }
  pageStages.push({ $sort: { sortKey: direction, _id: direction } }, { $limit: query.limit + 1 },
    { $lookup: { from: "record_links", let: { recordId: "$_id" }, pipeline: [
      { $match: { userId, $expr: { $or: [{ $eq: ["$fromRecordId", "$$recordId"] }, { $eq: ["$toRecordId", "$$recordId"] }] } } }, { $count: "count" },
    ], as: "links" } }, ...usageLookup(userId));
  const [result] = await mongoCollections(context.db).careerRecords.aggregate<{
    data: (CareerRecordDoc & { sortKey: string; category: { key: string }; links: { count: number }[]; usage: { portfolioCount: number }[] })[];
    summary: { total: number; draft: number; organized: number; verified: number; empty: number }[];
  }>([
    { $match: match },
    { $lookup: { from: "career_categories", localField: "categoryId", foreignField: "_id", pipeline: [{ $match: { $or: [{ userId: null }, { userId }] } }], as: "category" } },
    { $unwind: "$category" }, { $set: { sortKey } },
    { $facet: { data: pageStages, summary: [{ $group: {
      _id: null, total: { $sum: 1 },
      ...Object.fromEntries(["draft", "organized", "verified"].map((status) => [status, { $sum: { $cond: [{ $eq: ["$status", status] }, 1, 0] } }])),
      empty: { $sum: { $cond: [{ $and: [{ $eq: ["$bodyMd", ""] }, { $eq: [{ $size: { $objectToArray: "$properties" } }, 0] }] }, 1, 0] } },
    } }, { $project: { _id: 0 } }] } },
  ]).toArray();
  const hasNextPage = (result?.data.length ?? 0) > query.limit;
  const records = result?.data.slice(0, query.limit) ?? [];
  const last = records.at(-1);
  return CareerRecordListResponseSchema.parse({
    data: records.map((record) => ({ ...mapMongoRecord(record), categoryKey: record.category.key,
      isEmpty: record.bodyMd === "" && Object.keys(record.properties).length === 0,
      periodFrom: record.periodStart ?? null, periodTo: record.periodEnd ?? null,
      linkCount: record.links[0]?.count ?? 0, usedInCount: record.usage[0]?.portfolioCount ?? 0,
    })),
    summary: result?.summary[0] ?? { total: 0, draft: 0, organized: 0, verified: 0, empty: 0 },
    page: { hasNextPage, nextCursor: hasNextPage && last ? Buffer.from(JSON.stringify({ sort: query.sort, key: last.sortKey, id: last._id })).toString("base64url") : null },
  });
}
