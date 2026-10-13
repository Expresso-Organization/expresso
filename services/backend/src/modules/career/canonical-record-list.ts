import { createHash } from "node:crypto";
import { BSON, Decimal128, type Document } from "mongodb";
import { CareerRecordListResponseSchema, ListCareerRecordsQuerySchema, UuidSchema, type CareerRecord, type CareerRecordListResponse, type ListCareerRecordsQuery } from "@expresso/contracts";
import { mongoCollections, type CareerCategoryDoc, type CareerRecordDoc } from "@expresso/database";
import type { CanonicalCareerReadService } from "./canonical-reads.js";
import { CareerError } from "./errors.js";
import { requireCareerCategory } from "./mongo-categories.js";

type ListRow = CareerRecordDoc & { category: CareerCategoryDoc; __listKey: Date | Decimal128 | string | null; __listNull: 0 | 1; links?: { count: number }[]; usage?: { count: number }[] };
type Cursor = { f: string; i: string; n?: 0 | 1; k?: unknown; a?: { v: number; u: string } };
function fingerprint(userId: string, query: ListCareerRecordsQuery): string {
  return createHash("sha256").update(JSON.stringify([userId, query.categoryId ?? null, query.status ?? null, query.origin ?? null, query.q ?? null, query.sort])).digest("hex");
}
function invalidCursor(reset = false): never {
  throw new CareerError(400, reset ? "career record cursor reset is required" : "invalid career record cursor");
}
function decodeCursor(value: string, expected: string, sort: ListCareerRecordsQuery["sort"]): Cursor {
  try {
    const cursor: Cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!cursor || cursor.f !== expected || !UuidSchema.safeParse(cursor.i).success) invalidCursor();
    if (cursor.a) {
      if (sort !== "title_asc" || Object.keys(cursor).some(key => !["f", "i", "a"].includes(key)) ||
        !Number.isSafeInteger(cursor.a.v) || cursor.a.v < 1 || !Number.isFinite(Date.parse(cursor.a.u))) invalidCursor();
    } else {
      if (Object.keys(cursor).some(key => !["f", "i", "n", "k"].includes(key)) || (cursor.n !== 0 && cursor.n !== 1) || !Object.hasOwn(cursor, "k")) invalidCursor();
      const key = BSON.EJSON.deserialize(cursor.k as Document, { relaxed: false });
      if (sort === "title_asc" ? cursor.n !== 0 || typeof key !== "string" :
        sort.startsWith("updated_") ? cursor.n !== 0 || !(key instanceof Date) || !Number.isFinite(key.getTime()) :
          cursor.n === 1 ? key !== null : !(key instanceof Decimal128) || !/^-?[0-9]+(?:\.[0-9]+)?$/.test(key.toString())) invalidCursor();
      cursor.k = key;
    }
    return cursor;
  } catch { return invalidCursor(); }
}
function encodeCursor(row: ListRow, f: string): string {
  let encoded = Buffer.from(JSON.stringify({ f, i: row._id, n: row.__listNull, k: BSON.EJSON.serialize(row.__listKey, { relaxed: false }) })).toString("base64url");
  // 긴 제목은 소유자 anchor와 업무 버전을 묶어 기존 512자 계약 안에 둡니다.
  if (encoded.length > 512 && typeof row.__listKey === "string") encoded = Buffer.from(JSON.stringify({ f, i: row._id, a: { v: row.version, u: row.updatedAt.toISOString() } })).toString("base64url");
  if (encoded.length > 512) throw new CareerError(503, "career record cursor is unavailable");
  return encoded;
}
function categoryLookup(userId: string): Document[] {
  return [
    { $lookup: { from: "career_categories", localField: "categoryId", foreignField: "_id", pipeline: [{ $match: { $or: [{ userId: null }, { userId }] } }], as: "category" } },
    { $unwind: "$category" },
  ];
}
/** offset과 소수 9자리를 원문에서 보존하여 월·일·datetime을 정렬합니다. */
function dateKey(text: string): Document {
  return { $let: { vars: { text: { $ifNull: [text, ""] } }, in:
    { $let: { vars: { found: { $regexFind: { input: "$$text", regex: /^([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2})(?:\.([0-9]{1,9}))?(Z|[+-][0-9]{2}:[0-9]{2})$/ } } }, in:
      { $let: { vars: {
        parsed: { $dateFromString: { dateString: { $cond: [
          { $ne: ["$$found", null] },
          { $concat: [{ $arrayElemAt: ["$$found.captures", 0] }, { $arrayElemAt: ["$$found.captures", 2] }] },
          { $switch: { branches: [
            { case: { $regexMatch: { input: "$$text", regex: /^[0-9]{4}-[0-9]{2}$/ } }, then: { $concat: ["$$text", "-01T00:00:00Z"] } },
            { case: { $regexMatch: { input: "$$text", regex: /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/ } }, then: { $concat: ["$$text", "T00:00:00Z"] } },
          ], default: "" } },
        ] }, onError: null, onNull: null } },
        fraction: { $convert: { input: { $substrBytes: [{ $concat: [{ $ifNull: [{ $arrayElemAt: ["$$found.captures", 1] }, ""] }, "000000000"] }, 0, 9] }, to: "decimal" } },
      }, in: { $cond: [{ $eq: ["$$parsed", null] }, null, { $add: [{ $multiply: [{ $convert: { input: { $convert: { input: "$$parsed", to: "long" } }, to: "decimal" } }, Decimal128.fromString("1000000")] }, "$$fraction"] }] } } },
    } },
  } };
}
function sortStages(userId: string, sort: ListCareerRecordsQuery["sort"]): Document[] {
  if (!sort.startsWith("period_")) return [{ $set: { __listNull: 0, __listKey: sort === "title_asc" ? "$title" : "$updatedAt" } }];
  return [
    { $lookup: { from: "career_property_mutations", let: { categoryId: "$categoryId" }, pipeline: [
      { $match: { userId, active: true, $expr: { $eq: ["$categoryId", "$$categoryId"] } } }, { $project: { propertyId: 1 } },
    ], as: "__listJobs" } },
    { $set: { __listPeriod: { $arrayElemAt: [{ $filter: { input: "$category.propertySchemaV2", as: "definition", cond: { $and: [
      { $eq: ["$$definition.key", "period"] },
      { $or: [{ $and: [{ $eq: ["$$definition.type", "date"] }, { $eq: ["$$definition.deletedAt", null] }] }, { $in: ["$$definition.id", "$__listJobs.propertyId"] }] },
    ] } } }, 0] } } },
    { $set: { __listValue: { $arrayElemAt: [{ $filter: { input: "$propertyValues", as: "value", cond: { $and: [{ $eq: ["$$value.propertyDefinitionId", "$__listPeriod.id"] }, { $eq: ["$$value.type", "date"] }] } } }, 0] } } },
    { $set: { __listKey: dateKey("$__listValue.value.start") } },
    { $set: { __listNull: { $cond: [{ $eq: ["$__listKey", null] }, 1, 0] } } },
    { $unset: ["__listJobs", "__listPeriod", "__listValue"] },
  ];
}
function countsLookup(userId: string): Document[] {
  return [
    { $lookup: { from: "record_links", let: { recordId: "$_id" }, pipeline: [
      { $match: { userId, $expr: { $or: [{ $eq: ["$fromRecordId", "$$recordId"] }, { $eq: ["$toRecordId", "$$recordId"] }] } } },
      { $set: { otherId: { $cond: [{ $eq: ["$fromRecordId", "$$recordId"] }, "$toRecordId", "$fromRecordId"] } } },
      { $lookup: { from: "career_records", localField: "otherId", foreignField: "_id", pipeline: [{ $match: { userId, deletedAt: null } }, ...categoryLookup(userId), { $project: { _id: 1 } }], as: "target" } },
      { $match: { "target.0": { $exists: true } } }, { $count: "count" },
    ], as: "links" } },
    { $lookup: { from: "record_usages", let: { recordId: "$_id" }, pipeline: [
      { $match: { userId, $expr: { $eq: ["$recordId", "$$recordId"] } } },
      { $lookup: { from: "blocks", localField: "blockId", foreignField: "_id", pipeline: [{ $match: { userId } }], as: "block" } }, { $unwind: "$block" },
      { $lookup: { from: "portfolio_sections", localField: "block.portfolioSectionId", foreignField: "_id", pipeline: [{ $match: { userId } }], as: "section" } }, { $unwind: "$section" },
      { $lookup: { from: "portfolios", localField: "section.portfolioId", foreignField: "_id", pipeline: [{ $match: { userId } }], as: "portfolio" } }, { $unwind: "$portfolio" },
      { $group: { _id: "$portfolio._id" } }, { $count: "count" },
    ], as: "usage" } },
  ];
}
function isEmpty(record: CareerRecord): boolean {
  return record.bodyMd === "" && record.propertyValues?.length === 0 &&
    !Object.values(record.properties).some(value => value !== null && typeof value === "object" && "type" in value && value.type === "relation" && Array.isArray(value.value) && value.value.length > 0);
}
function periodBounds(record: CareerRecord, category: CareerCategoryDoc): { periodFrom: string | null; periodTo: string | null } {
  const pending = record.pendingPropertyMutation?.sourceProperty;
  const candidates = [...(category.propertySchemaV2 ?? []).filter(definition => definition.key === "period" && definition.type === "date" && definition.deletedAt === null),
    ...(pending?.key === "period" && pending.type === "date" ? [pending] : [])];
  const value = record.propertyValues?.find(item => item.type === "date" && candidates.some(definition => definition.id === item.propertyDefinitionId));
  if (value?.type !== "date") return { periodFrom: null, periodTo: null };
  const date = (text: string | null) => text === null ? null : value.value.precision === "month" ? text + "-01" : text.slice(0, 10);
  return { periodFrom: date(value.value.start), periodTo: date(value.value.end) };
}

/** 정본 목록 조회이며 문서·업무 값·파생 속성을 저장하지 않습니다. */
export async function listCanonicalCareerRecords(reader: CanonicalCareerReadService, userId: string, queryInput: ListCareerRecordsQuery): Promise<CareerRecordListResponse> {
  const query = ListCareerRecordsQuerySchema.parse(queryInput);
  const f = fingerprint(userId, query);
  const cursor = query.cursor ? decodeCursor(query.cursor, f, query.sort) : null;
  if (query.categoryId) await requireCareerCategory(reader.context, userId, query.categoryId);
  const records = mongoCollections(reader.context.db).careerRecords;
  const base: Document[] = [{ $match: { userId, deletedAt: null, ...(query.categoryId ? { categoryId: query.categoryId } : {}) } }, ...categoryLookup(userId)];
  // 필터가 미준비 행을 숨기기 전에 정본 배열과 범주 준비 상태를 확인합니다.
  const invalid = await records.aggregate([...base, { $match: { $expr: { $or: [
    { $not: [{ $isArray: "$propertyValues" }] }, { $not: [{ $isArray: "$category.propertySchemaV2" }] }, { $lte: [{ $ifNull: ["$category.schemaVersion", 0] }, 0] },
  ] } } }, { $limit: 1 }, { $project: { _id: 1 } }]).next();
  if (invalid) throw new CareerError(409, "CANONICAL_RECORDS_NOT_PREPARED");
  const filter: Document = {};
  if (query.status) filter.status = query.status;
  if (query.origin) filter.origin = query.origin;
  if (query.q) filter.title = { $regex: query.q.replace(/[.*+?^$()|[\]{}\\]/g, "\\$&"), $options: "i" };
  const filtered = [...base, ...(Object.keys(filter).length ? [{ $match: filter }] : [])];
  if (cursor?.a) {
    const anchor = await records.findOne({ _id: cursor.i, userId, ...(query.categoryId ? { categoryId: query.categoryId } : {}) }, { projection: { title: 1, version: 1, updatedAt: 1, categoryId: 1 } });
    if (!anchor || anchor.version !== cursor.a.v || anchor.updatedAt.toISOString() !== cursor.a.u) invalidCursor(true);
    await requireCareerCategory(reader.context, userId, anchor.categoryId);
    cursor.k = anchor.title;
    cursor.n = 0;
  }
  const direction = query.sort === "updated_desc" || query.sort === "period_desc" ? -1 : 1;
  const operator = direction === -1 ? "$lt" : "$gt";
  const pageMatch: Document[] = cursor ? [{ $match: { $or: [
    { __listNull: { $gt: cursor.n } }, { __listNull: cursor.n, __listKey: { [operator]: cursor.k } },
    { __listNull: cursor.n, __listKey: cursor.k, _id: { [operator]: cursor.i } },
  ] } }] : [];
  const pageRows = await records.aggregate<ListRow>([...filtered, ...sortStages(userId, query.sort), ...pageMatch,
    { $sort: { __listNull: 1, __listKey: direction, _id: direction } }, { $limit: query.limit + 1 }, ...countsLookup(userId),
  ], { allowDiskUse: true }).toArray();
  const [summaryRow] = await records.aggregate<{ total: number; draft: number; organized: number; verified: number }>([...filtered, { $group: {
    _id: null, total: { $sum: 1 }, ...Object.fromEntries(["draft", "organized", "verified"].map(status => [status, { $sum: { $cond: [{ $eq: ["$status", status] }, 1, 0] } }])),
  } }, { $project: { _id: 0 } }]).toArray();
  const summary = { ...(summaryRow ?? { total: 0, draft: 0, organized: 0, verified: 0 }), empty: 0 };
  const page = pageRows.slice(0, query.limit);
  const mapped = new Map<string, CareerRecord>();
  for (let offset = 0; offset < page.length; offset += 8) await Promise.all(page.slice(offset, offset + 8).map(async row => mapped.set(row._id, await reader.mapRecord(row, row.category))));
  // 빈 후보 전체를 작은 batch로 읽어 최신 문서와 실제 edge까지 확인합니다.
  const candidates = records.aggregate<ListRow>([...filtered, { $match: { $expr: { $eq: [{ $size: "$propertyValues" }, 0] } } }], { batchSize: 100 });
  let batch: ListRow[] = [];
  const countBatch = async () => {
    const values = await Promise.all(batch.map(async row => mapped.get(row._id) ?? await reader.mapRecord(row, row.category)));
    summary.empty += values.filter(isEmpty).length;
    batch = [];
  };
  try {
    for await (const candidate of candidates) {
      batch.push(candidate);
      if (batch.length === 8) await countBatch();
    }
    if (batch.length) await countBatch();
  } finally { await candidates.close(); }
  const hasNextPage = pageRows.length > query.limit;
  const last = page.at(-1);
  return CareerRecordListResponseSchema.parse({
    data: page.map(row => {
      const record = mapped.get(row._id)!;
      return { ...record, categoryKey: row.category.key, isEmpty: isEmpty(record), ...periodBounds(record, row.category), linkCount: row.links?.[0]?.count ?? 0, usedInCount: row.usage?.[0]?.count ?? 0 };
    }),
    summary, page: { hasNextPage, nextCursor: hasNextPage && last ? encodeCursor(last, f) : null },
  });
}