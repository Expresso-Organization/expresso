import { createHash } from "node:crypto";
import { CareerPropertyValueV2Schema, CareerRecordSchema, CareerRecordListResponseSchema, ListCareerRecordsQuerySchema, type CreateCareerRecord, type ListCareerRecordsQuery } from "@expresso/contracts";
import { mongoCollections, type CareerCategoryDoc, type CareerRecordDoc } from "@expresso/database";
import type { Db, Document } from "mongodb";
import type { MongoContext } from "../../platform/mongodb.js";
import { CareerError } from "./errors.js";
import { recordPeriod } from "./record-period.js";

/**
 * 관계 원장의 값을 기록의 관계 속성에 붙입니다. 관계는 원장에만 저장되어, 붙이지 않으면 화면의 관계 편집기가 늘 비어 보입니다.
 * 휴지통에 있는 대상은 뺍니다.
 */
export async function attachRelationValues<T extends { _id: string; categoryId: string; properties: Record<string, unknown> }>(
  db: Db, userId: string, rows: readonly T[], categories: ReadonlyMap<string, Pick<CareerCategoryDoc, "propertySchemaV2">>,
): Promise<T[]> {
  const relationDefinitions = new Map([...categories].map(([id, category]) => [id, category.propertySchemaV2.filter((definition) => definition.type === "relation" && definition.deletedAt === null)]));
  if (![...relationDefinitions.values()].some((list) => list.length)) return [...rows];
  const collections = mongoCollections(db);
  const edges = await collections.careerRecordRelations.find({ userId, sourceRecordId: { $in: rows.map((row) => String(row._id)) } }).sort({ createdAt: 1, _id: 1 }).toArray();
  const targetIds = [...new Set(edges.map((edge) => edge.targetRecordId))];
  const titles = new Map(targetIds.length ? (await collections.careerRecords.find({ _id: { $in: targetIds }, userId, deletedAt: null }, { projection: { title: 1 } }).toArray()).map((target) => [target._id, target.title]) : []);
  return rows.map((row) => {
    const definitions = relationDefinitions.get(row.categoryId) ?? [];
    if (!definitions.length) return row;
    const properties = { ...row.properties };
    for (const definition of definitions) {
      const value = edges.filter((edge) => edge.sourceRecordId === String(row._id) && edge.sourcePropertyId === definition.id && titles.has(edge.targetRecordId))
        .map((edge) => ({ recordId: edge.targetRecordId, title: (titles.get(edge.targetRecordId) ?? "").slice(0, 300) }));
      if (value.length) properties[definition.key] = { type: "relation", value }; else delete properties[definition.key];
    }
    return { ...row, properties };
  });
}

export function mapMongoRecord(record: CareerRecordDoc, bodyMd = record.bodyMd) {
  const computedProperties = Object.fromEntries(Object.entries(record.computedProperties ?? {}).flatMap(([key, value]) => {
    const parsed = CareerPropertyValueV2Schema.safeParse(value);
    return key === "__expressoComputation" || !parsed.success || (parsed.data.type !== "formula" && parsed.data.type !== "rollup") ? [] : [[key, parsed.data]];
  }));
  return CareerRecordSchema.parse({ id: record._id, categoryId: record.categoryId, title: record.title, status: record.status, origin: record.origin, properties: record.properties, ...(Object.keys(computedProperties).length ? { computedProperties } : {}), bodyMd, version: record.version, createdAt: (record.createdAt ?? record.updatedAt).toISOString(), updatedAt: record.updatedAt.toISOString() });
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
    ? { $ifNull: ["$periodStart", "$properties.period.value.start", descending ? "0001-01-01" : "9999-12-31"] }
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
    { $lookup: { from: "career_categories", localField: "categoryId", foreignField: "_id", pipeline: [{ $match: { userId } }], as: "category" } },
    { $unwind: "$category" }, { $set: { sortKey } },
    { $facet: { data: pageStages, summary: [{ $group: {
      _id: null, total: { $sum: 1 },
      ...Object.fromEntries(["draft", "organized", "verified"].map((status) => [status, { $sum: { $cond: [{ $eq: ["$status", status] }, 1, 0] } }])),
      empty: { $sum: { $cond: [{ $and: [{ $eq: ["$bodyMd", ""] }, { $eq: [{ $size: { $objectToArray: "$properties" } }, 0] }] }, 1, 0] } },
    } }, { $project: { _id: 0 } }] } },
  ]).toArray();
  const hasNextPage = (result?.data.length ?? 0) > query.limit;
  const pageRecords = result?.data.slice(0, query.limit) ?? [];
  const records = await attachRelationValues(context.db, userId, pageRecords, new Map(pageRecords.map((record) => [record.categoryId, record.category as unknown as CareerCategoryDoc])));
  const last = records.at(-1);
  return CareerRecordListResponseSchema.parse({
    data: records.map((record) => ({ ...mapMongoRecord(record), categoryKey: record.category.key,
      isEmpty: record.bodyMd === "" && Object.keys(record.properties).length === 0,
      periodFrom: recordPeriod(record)?.start ?? null, periodTo: recordPeriod(record)?.end ?? null,
      linkCount: record.links[0]?.count ?? 0, usedInCount: record.usage[0]?.portfolioCount ?? 0,
    })),
    summary: result?.summary[0] ?? { total: 0, draft: 0, organized: 0, verified: 0, empty: 0 },
    page: { hasNextPage, nextCursor: hasNextPage && last ? Buffer.from(JSON.stringify({ sort: query.sort, key: last.sortKey, id: last._id })).toString("base64url") : null },
  });
}
