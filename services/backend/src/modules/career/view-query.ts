import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type {
  CareerCategory,
  CareerPropertyDefinitionV2,
  CareerViewConfiguration,
} from "@expresso/contracts";
import { BSON, Decimal128, type Document } from "mongodb";

import { CareerError } from "./errors.js";

const CURSOR_SECRET = process.env.CAREER_VIEW_CURSOR_SECRET ?? "expresso-career-view-cursor-secret";

export interface CareerViewQueryOptions { source: "canonical" | "legacy" }
export interface CanonicalViewReadPolicy { source: CareerPropertyDefinitionV2 | null; target: CareerPropertyDefinitionV2 | null; blockedRelationIds: readonly string[] }

type SortPart = { field: string; direction: 1 | -1 };
type CareerViewFilterV2 =
  | { operator: "and" | "or"; filters: CareerViewFilterV2[] }
  | { propertyId: string; operator: "eq" | "neq" | "contains" | "not_contains" | "gt" | "gte" | "lt" | "lte" | "is_empty" | "is_not_empty"; operand: unknown };

export interface CompiledCareerView {
  pipeline: Document[];
  sortParts: SortPart[];
  projectionKeys: readonly string[];
}

interface CursorPayload {
  userId: string;
  viewId: string;
  viewVersion: number;
  expiresAt: number;
  values: unknown[];
  id: string;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function activeDefinitions(category: CareerCategory): CareerPropertyDefinitionV2[] {
  if (category.propertySchemaV2) return category.propertySchemaV2.filter((definition) => definition.deletedAt === null);
  return Object.entries(category.propertySchema).map(([key, property], order) => ({
    id: property.id ?? stablePropertyId(category.id, key), key, name: property.label,
    type: property.type === "boolean" ? "checkbox" : property.type === "tags" ? "multi_select" : property.type,
    required: property.required, system: property.system, config: {}, order, version: 1, deletedAt: null,
  }));
}

function stablePropertyId(categoryId: string, key: string): string {
  const bytes = createHash("sha1").update(Buffer.from("6ba7b8109dad11d180b400c04fd430c8", "hex")).update(`${categoryId}:${key}`).digest();
  bytes[6] = (bytes[6]! & 15) | 80;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = bytes.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function leafCount(filter: CareerViewFilterV2 | null): number {
  if (!filter) return 0;
  return "filters" in filter
    ? filter.filters.reduce((count, child) => count + leafCount(child), 0)
    : 1;
}

function cursorSignature(body: string): string {
  return createHmac("sha256", CURSOR_SECRET).update(body).digest("base64url");
}

function encodeCursor(payload: CursorPayload): string {
  const body = Buffer.from(JSON.stringify({ ...payload, values: BSON.EJSON.serialize(payload.values, { relaxed: false }) })).toString("base64url");
  return `${body}.${cursorSignature(body)}`;
}

function decodeCursor(cursor: string, expected: Pick<CursorPayload, "userId" | "viewId" | "viewVersion">): CursorPayload {
  const separator = cursor.lastIndexOf(".");
  if (separator < 1) throw new CareerError(400, "invalid career view cursor");
  const body = cursor.slice(0, separator);
  const supplied = cursor.slice(separator + 1);
  const signature = cursorSignature(body);
  if (supplied.length !== signature.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(signature))) {
    throw new CareerError(400, "invalid career view cursor");
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as CursorPayload;
    if (!Array.isArray(payload.values) || typeof payload.id !== "string" || payload.expiresAt < Date.now()
      || payload.userId !== expected.userId || payload.viewId !== expected.viewId || payload.viewVersion !== expected.viewVersion) {
      throw new Error("cursor binding mismatch");
    }
    return { ...payload, values: BSON.EJSON.deserialize(payload.values, { relaxed: false }) as unknown[] };
  } catch {
    throw new CareerError(400, "invalid career view cursor");
  }
}

/** UUID를 Mongo 필드명으로 직접 쓰지 않고, 스키마가 소유한 허용 키로만 변환합니다. */
function unwrapStoredValue(value: Document | string): Document {
  return {
    $let: {
      vars: { stored: value },
      in: {
        $cond: [
          { $and: [
            { $eq: [{ $type: "$$stored" }, "object"] },
            { $ne: [{ $type: { $getField: { input: "$$stored", field: "value" } } }, "missing"] },
          ] },
          { $getField: { input: "$$stored", field: "value" } },
          "$$stored",
        ],
      },
    },
  };
}

function dateStart(value: Document | string): Document {
  return { $cond: [
    { $eq: [{ $type: value }, "object"] },
    { $getField: { input: value, field: "start" } }, value,
  ] };
}

/** Mongo Date의 밀리초에 원문 소수 9자리를 더하여 offset과 나노초를 함께 비교합니다. */
function dateComparison(value: Document | string): Document {
  const million = Decimal128.fromString("1000000");
  return { $let: { vars: { value }, in: { $cond: [
    { $eq: [{ $type: "$$value" }, "date"] },
    { $multiply: [{ $convert: { input: { $convert: { input: "$$value", to: "long" } }, to: "decimal" } }, million] },
    { $let: { vars: { text: { $convert: { input: "$$value", to: "string", onError: "", onNull: "" } } }, in:
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
        }, in: { $cond: [{ $eq: ["$$parsed", null] }, null, { $add: [{ $multiply: [{ $convert: { input: { $convert: { input: "$$parsed", to: "long" } }, to: "decimal" } }, million] }, "$$fraction"] }] } } },
      } },
    } },
  ] } } };
}

function storedMatchesDefinition(definition:CareerPropertyDefinitionV2):Document {
 const expectedType=["created_time","updated_time"].includes(definition.type)?"date":definition.type;
 const match:Document[]=[{$eq:["$$stored.type",expectedType]}];
 if(definition.type==="select"||definition.type==="multi_select"){
  const ids=Array.isArray(definition.config.options)?definition.config.options.map(option=>(option as {id:string}).id):[];
  match.push(definition.type==="select"?{$or:[{$eq:["$$stored.value",null]},{$in:["$$stored.value",ids]}]}:{$setIsSubset:[{$cond:[{$isArray:"$$stored.value"},"$$stored.value",[]]},ids]});
 }
 if(!definition.system&&["created_time","updated_time"].includes(definition.type))match.push({$eq:["$$stored.value.precision","datetime"]},{$eq:["$$stored.value.end",null]});
 return {$let:{vars:{stored:{$arrayElemAt:[{$filter:{input:{$cond:[{$isArray:"$propertyValues"},"$propertyValues",[]]},as:"property",cond:{$eq:["$$property.propertyDefinitionId",definition.id]}}},0]}},in:{$and:match}}};
}
function sourceReadSelected(policy:CanonicalViewReadPolicy):Document {
 return {$and:[storedMatchesDefinition(policy.source!),policy.target?.deletedAt!==null?{$eq:[1,1]}:{$not:[storedMatchesDefinition(policy.target!)]}]};
}
function fieldExpression(definition: CareerPropertyDefinitionV2, source: CareerViewQueryOptions["source"], policy?:CanonicalViewReadPolicy): Document | string {
  // 진행 중인 Relation 복원은 부분 edge를 정렬 값으로 노출하지 않습니다.
  if(source==="canonical"&&definition.type==="relation"&&policy?.blockedRelationIds.includes(definition.id))return { $literal: [] };
  if(source==="canonical"&&policy?.source?.id===definition.id&&policy.target)return {$cond:[sourceReadSelected(policy),fieldExpression(policy.source,source),policy.target.deletedAt===null?fieldExpression(policy.target,source):null]};
  if (definition.type === "title") return "$title";
  if (definition.system && (definition.type === "created_time" || definition.type === "updated_time")) {
    const value = definition.type === "created_time" ? { $ifNull: ["$createdAt", "$updatedAt"] } : "$updatedAt";
    return source === "canonical" ? dateComparison(value) : value;
  }
  // 허용 키의 정적 경로로 lookup 의존성을 드러내어 필터가 먼저 실행되지 않게 합니다.
  if (source === "canonical" && definition.type === "relation") {
    if(policy?.blockedRelationIds.includes(definition.id))return { $literal: [] };
    return { $map: { input: { $ifNull: ["$__careerCanonicalRelations." + definition.key, []] }, as: "target", in: "$$target.recordId" } };
  }
  const derived = definition.type === "formula" || definition.type === "rollup";
  let value: Document;
  if (source === "canonical" && !derived && definition.type !== "relation") {
    const expectedType = definition.type === "created_time" || definition.type === "updated_time" ? "date" : definition.type;
    value = { $let: { vars: { stored: { $arrayElemAt: [{ $filter: {
      input: { $cond: [{ $isArray: "$propertyValues" }, "$propertyValues", []] }, as: "property",
      cond: { $eq: ["$$property.propertyDefinitionId", definition.id] },
    } }, 0] } }, in: { $cond: [{ $eq: ["$$stored.type", expectedType] }, { $ifNull: ["$$stored.value", null] }, null] } } };
  } else {
    value = unwrapStoredValue({ $getField: { input: { $ifNull: [derived ? "$computedProperties" : "$properties", {}] }, field: definition.key } });
  }
  if (definition.type === "date" || (source === "canonical" && ["created_time", "updated_time"].includes(definition.type))) {
    const start = dateStart(value);
    return source === "canonical" ? dateComparison(start) : start;
  }
  return value;
}

function dateOperand(value: string): Decimal128 {
  const normalized = /^[0-9]{4}-[0-9]{2}$/.test(value) ? value + "-01T00:00:00Z" : /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) ? value + "T00:00:00Z" : value;
  const fraction = /\.([0-9]+)(?=Z|[+-])/.exec(normalized)?.[1] ?? "";
  const seconds = Date.parse(normalized.replace(/\.[0-9]+(?=Z|[+-])/, "")) / 1_000;
  if (!Number.isFinite(seconds)) throw new CareerError(400, "invalid career view date operand");
  const digits = Math.max(9, fraction.length);
  const scale = 10n ** BigInt(digits);
  const ticks = BigInt(seconds) * scale + BigInt(fraction.padEnd(digits, "0") || "0");
  const negative = ticks < 0n;
  const absolute = negative ? -ticks : ticks;
  const divisor = 10n ** BigInt(digits - 9);
  const whole = absolute / divisor;
  const remainder = absolute % divisor;
  const decimal = (negative ? "-" : "") + String(whole) + (remainder ? "." + String(remainder).padStart(digits - 9, "0") : "");
  try { return Decimal128.fromString(decimal); }
  catch { throw new CareerError(400, "invalid career view date operand precision"); }
}
function operandValue(operand: unknown, definition: CareerPropertyDefinitionV2, source: CareerViewQueryOptions["source"]): unknown {
  if (!operand || typeof operand !== "object" || !("value" in operand)) return null;
  const typed = operand as { type?: unknown; value: unknown };
  if (typed.type === "date" && typed.value && typeof typed.value === "object" && "start" in typed.value) {
    const start = (typed.value as { start: unknown }).start;
    return source === "canonical" && typeof start === "string" ? dateOperand(start) : start;
  }
  if (source === "canonical" && definition.type === "relation" && Array.isArray(typed.value)) return typed.value.map((target) => target && typeof target === "object" && "recordId" in target ? target.recordId : target);
  if (source === "canonical" && definition.type === "number" && typed.value !== null) {
    try { return Decimal128.fromString(String(typed.value)); }
    catch { throw new CareerError(400, "invalid career view decimal operand"); }
  }
  if (source === "canonical" && ["created_time", "updated_time"].includes(definition.type) && typeof typed.value === "string") return dateOperand(typed.value);
  return typed.value;
}

function validateFilterOperator(filter: Exclude<CareerViewFilterV2, { filters: CareerViewFilterV2[] }>, definition: CareerPropertyDefinitionV2): void {
  const emptyOperators = ["is_empty", "is_not_empty"];
  const comparisonOperators = ["eq", "neq", "gt", "gte", "lt", "lte", ...emptyOperators];
  const textOperators = ["eq", "neq", "contains", "not_contains", ...emptyOperators];
  const collectionOperators = ["eq", "neq", "contains", "not_contains", ...emptyOperators];
  const allowed = ["number", "date", "created_time", "updated_time"].includes(definition.type) ? comparisonOperators
    : ["text", "title", "url", "email", "phone"].includes(definition.type) ? textOperators
      : ["multi_select", "file", "media", "relation"].includes(definition.type) ? collectionOperators
        : ["select", "checkbox"].includes(definition.type) ? ["eq", "neq", ...emptyOperators]
          : [...new Set([...comparisonOperators, ...textOperators])];
  if (!allowed.includes(filter.operator)) throw new CareerError(400, "view operator is not valid for property type", { propertyId: definition.id, propertyType: definition.type, operator: filter.operator });
  if (!emptyOperators.includes(filter.operator) && filter.operand && typeof filter.operand === "object" && "type" in filter.operand) {
    const operandType = (filter.operand as { type: unknown }).type;
    if (operandType !== definition.type && !(["created_time", "updated_time"].includes(definition.type) && !definition.system && operandType === "date")) throw new CareerError(400, "view operand type does not match property type", { propertyId: definition.id });
  }
}

function filterExpression(
  filter: CareerViewFilterV2,
  definitions: ReadonlyMap<string, CareerPropertyDefinitionV2>,
  source: CareerViewQueryOptions["source"],
  policy?:CanonicalViewReadPolicy,
): Document {
  if ("filters" in filter) {
    const expressions = filter.filters.map((child) => filterExpression(child, definitions, source, policy));
    return { [`$${filter.operator}`]: expressions };
  }
  const definition = definitions.get(filter.propertyId);
  if (!definition) throw new CareerError(400, "view references a deleted or foreign property", { propertyId: filter.propertyId });
  if(source==="canonical"&&policy?.blockedRelationIds.includes(definition.id)&&definition.type==="relation")return {$eq:[1,0]};
  if(source==="canonical"&&policy?.source?.id===definition.id&&policy.target){
    const branches:Document[]=[];
    for(const [selected,candidate] of [[sourceReadSelected(policy),policy.source],[{$not:[sourceReadSelected(policy)]},policy.target]] as const){
      try{validateFilterOperator(filter,candidate);}catch{continue;}
      const values=new Map(definitions);values.set(candidate.id,candidate);
      branches.push({$and:[selected,candidate.deletedAt===null?filterExpression(filter,values,source):{$eq:[1,0]}]});
    }
    if(!branches.length)validateFilterOperator(filter,definition);
    return {$or:branches};
  }
  validateFilterOperator(filter, definition);
  const value = fieldExpression(definition, source);
  const operand = operandValue(filter.operand, definition, source);
  switch (filter.operator) {
    case "eq": return { $eq: [value, operand] };
    case "neq": return { $ne: [value, operand] };
    case "gt": return { $gt: [value, operand] };
    case "gte": return { $gte: [value, operand] };
    case "lt": return { $lt: [value, operand] };
    case "lte": return { $lte: [value, operand] };
    case "is_empty":
      return { $or: [
        { $eq: [{ $ifNull: [value, null] }, null] }, { $eq: [value, ""] },
        { $eq: [{ $cond: [{ $isArray: value }, { $size: value }, -1] }, 0] },
      ] };
    case "is_not_empty":
      return { $not: [filterExpression({ ...filter, operator: "is_empty" }, definitions, source, policy)] };
    case "contains": {
      const literal = typeof operand === "string" ? escapeRegex(operand.normalize("NFC")) : "";
      if (Array.isArray(operand)) {
        return { $gt: [{ $size: { $setIntersection: [operand, { $cond: [{ $isArray: value }, value, []] }] } }, 0] };
      }
      if (!literal) return { $eq: [1, 0] };
      return { $or: [
        { $regexMatch: { input: { $convert: { input: value, to: "string", onError: "", onNull: "" } }, regex: `^.*${literal}.*$`, options: "i" } },
        { $in: [operand, { $cond: [{ $isArray: value }, value, []] }] },
      ] };
    }
    case "not_contains": return { $not: [filterExpression({ ...filter, operator: "contains" }, definitions, source, policy)] };
  }
}

/** 관계 projection과 같이 현재 endpoint의 카테고리와 살아 있는 정방향/역방향 정의를 확인합니다. */
function canonicalRelationStages(definitions: readonly CareerPropertyDefinitionV2[]): Document[] {
  const stages: Document[] = [];
  const fields: Document = {};
  const endpoint = (alias: string, id: string): Document[] => [{ $lookup: {
    from: "career_records",
    let: { endpointId: id, ownerId: "$$ownerId" },
    pipeline: [
      { $match: { deletedAt: null, $expr: { $and: [{ $eq: ["$_id", "$$endpointId"] }, { $eq: ["$userId", "$$ownerId"] }] } } },
      { $project: { _id: 1, categoryId: 1, title: 1 } },
    ],
    as: alias,
  } }, { $unwind: "$" + alias }];
  const binding = (alias: string, categoryId: string, propertyId: string): Document => ({ $lookup: {
    from: "career_categories",
    let: { categoryId, propertyId, ownerId: "$$ownerId" },
    pipeline: [
      { $match: { $expr: { $and: [
        { $eq: ["$_id", "$$categoryId"] },
        { $or: [{ $eq: ["$userId", "$$ownerId"] }, { $eq: ["$userId", null] }] },
        { $gt: [{ $size: { $filter: {
          input: { $ifNull: ["$propertySchemaV2", []] }, as: "definition",
          cond: { $and: [{ $eq: ["$$definition.id", "$$propertyId"] }, { $eq: ["$$definition.type", "relation"] }, { $eq: ["$$definition.deletedAt", null] }] },
        } } }, 0] },
      ] } } },
      { $project: { _id: 1 } },
    ],
    as: alias,
  } });
  for (const [index, definition] of definitions.entries()) {
    const alias = "__careerCanonicalRelation" + index;
    const forward = { $and: [{ $eq: ["$sourceRecordId", "$$recordId"] }, { $eq: ["$sourcePropertyId", definition.id] }] };
    stages.push({ $lookup: {
      from: "career_record_relations",
      let: { recordId: "$_id", ownerId: "$userId" },
      pipeline: [
        { $match: { $expr: { $and: [
          { $eq: ["$userId", "$$ownerId"] },
          { $or: [forward, { $and: [{ $eq: ["$targetRecordId", "$$recordId"] }, { $eq: ["$inversePropertyId", definition.id] }] }] },
        ] } } },
        ...endpoint("__source", "$sourceRecordId"),
        ...endpoint("__target", "$targetRecordId"),
        binding("__forwardBinding", "$__source.categoryId", "$sourcePropertyId"),
        binding("__inverseBinding", "$__target.categoryId", "$inversePropertyId"),
        { $set: { __opposite: { $cond: [forward, "$__target", "$__source"] } } },
        { $match: { $expr: { $and: [
          { $eq: ["$__opposite.categoryId", String(definition.config.targetCategoryId)] },
          { $gt: [{ $size: "$__forwardBinding" }, 0] },
          { $or: [{ $ne: [{ $type: "$inversePropertyId" }, "string"] }, { $gt: [{ $size: "$__inverseBinding" }, 0] }] },
        ] } } },
        { $group: { _id: "$__opposite._id", title: { $first: "$__opposite.title" } } },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, recordId: "$_id", title: 1 } },
      ],
      as: alias,
    } });
    fields[definition.key] = "$" + alias;
  }
  if (definitions.length) stages.push({ $set: { __careerCanonicalRelations: fields } });
  return stages;
}
function referencedPropertyIds(view: CareerViewConfiguration): string[] {
  const ids = [
    ...view.visiblePropertyIds, ...view.propertyOrder,
    ...(view.groupPropertyId ? [view.groupPropertyId] : []),
    ...(view.gallery ? [view.gallery.coverPropertyId, ...view.gallery.previewPropertyIds].filter((id): id is string => id !== null) : []),
    ...(view.timeline ? [view.timeline.startPropertyId, ...[view.timeline.endPropertyId].filter((id): id is string => id !== null)] : []),
    ...view.sorts.map((sort) => sort.propertyId),
  ];
  const collectFilter = (filter: CareerViewFilterV2 | null): void => {
    if (!filter) return;
    if ("filters" in filter) filter.filters.forEach(collectFilter);
    else ids.push(filter.propertyId);
  };
  collectFilter(view.filter as CareerViewFilterV2 | null);
  return [...new Set(ids)];
}

export class CareerViewQuery {
  constructor(readonly options: CareerViewQueryOptions = { source: "canonical" }) {}

  compile(category: CareerCategory, view: CareerViewConfiguration, policy?:CanonicalViewReadPolicy): CompiledCareerView {
    if (category.id !== view.categoryId) throw new CareerError(400, "view category does not match query category");
    const filter = view.filter as CareerViewFilterV2 | null;
    if (leafCount(filter) > 20) throw new CareerError(400, "view filter limit exceeded");
    if (view.sorts.length > 10) throw new CareerError(400, "view sort limit exceeded");
    const definitions = new Map(activeDefinitions(category).map((definition) => [definition.id, definition]));
    if(policy?.source&&policy.target?.deletedAt!==null)definitions.set(policy.source.id,{...policy.source,deletedAt:null});
    for (const id of referencedPropertyIds(view)) {
      if (!definitions.has(id)) throw new CareerError(400, "view references a deleted or foreign property", { propertyId: id });
    }
    if (view.timeline) {
      const start = definitions.get(view.timeline.startPropertyId);
      const end = view.timeline.endPropertyId ? definitions.get(view.timeline.endPropertyId) : undefined;
      if (start?.type !== "date" || (end && end.type !== "date")) throw new CareerError(400, "timeline fields must be date properties");
    }

    const relations = referencedPropertyIds(view).map((id) => definitions.get(id)!).filter((definition) => definition.type === "relation");
    const pipeline: Document[] = this.options.source === "canonical" ? canonicalRelationStages(relations) : [];
    if (filter) pipeline.push({ $match: { $expr: filterExpression(filter, definitions, this.options.source, policy) } });
    const computed: Document = {};
    const sort: Document = {};
    const sortParts: SortPart[] = [];
    if (!view.sorts.length && view.recordOrder.length) {
      const valueField = "__careerViewManualOrder";
      const index = { $indexOfArray: [view.recordOrder, "$_id"] };
      computed[valueField] = { $cond: [{ $gte: [index, 0] }, index, view.recordOrder.length] };
      sort[valueField] = 1;
      sortParts.push({ field: valueField, direction: 1 });
    }
    for (const [index, configured] of view.sorts.entries()) {
      const valueField = `__careerViewSort${index}`;
      const nullField = `__careerViewNull${index}`;
      const definition = definitions.get(configured.propertyId)!;
      const rawValue = fieldExpression(definition, this.options.source, policy);
      // 관계 ID는 조회 단계에서 정렬하므로 방향에 맞는 한 값을 커서에도 그대로 보존합니다.
      const value = this.options.source === "canonical" && definition.type === "relation"
        ? { $ifNull: [{ $arrayElemAt: [rawValue, configured.direction === "asc" ? 0 : -1] }, null] }
        : rawValue;
      computed[valueField] = value;
      computed[nullField] = { $cond: [{ $eq: [{ $ifNull: [value, null] }, null] }, configured.nulls === "first" ? 0 : 1, configured.nulls === "first" ? 1 : 0] };
      sort[nullField] = 1;
      sort[valueField] = configured.direction === "asc" ? 1 : -1;
      sortParts.push({ field: nullField, direction: 1 }, { field: valueField, direction: configured.direction === "asc" ? 1 : -1 });
    }
    if (Object.keys(computed).length) pipeline.push({ $set: computed });
    sort._id = 1;
    sortParts.push({ field: "_id", direction: 1 });

    const projectionKeys = [...new Set(referencedPropertyIds(view)
      .map((id) => definitions.get(id)!)
      .filter((definition) => !["title", "formula", "rollup"].includes(definition.type)
        && !(["created_time", "updated_time"].includes(definition.type) && definition.system))
      .map((definition) => definition.key))];
    const projection: Document = {
      ...(this.options.source === "canonical" ? { userId: 1, propertyValues: 1 } : {}),
      _id: 1, title: 1, status: 1, origin: 1, categoryId: 1, bodyMd: 1, version: 1, updatedAt: 1,
      createdAt: 1, computedProperties: 1, periodStart: 1, periodEnd: 1,
      ...Object.fromEntries(projectionKeys.map((key) => [`properties.${key}`, 1])),
      ...Object.fromEntries(sortParts.map((part) => [part.field, 1])),
    };
    pipeline.push({ $sort: sort }, { $project: projection });
    return { pipeline, sortParts, projectionKeys };
  }

  decodeCursor(cursor: string, expected: Pick<CursorPayload, "userId" | "viewId" | "viewVersion">): CursorPayload {
    return decodeCursor(cursor, expected);
  }

  encodeCursor(payload: CursorPayload): string {
    return encodeCursor(payload);
  }

  cursorMatch(cursor: CursorPayload, sortParts: readonly SortPart[]): Document {
    if (cursor.values.length !== sortParts.length) throw new CareerError(400, "invalid career view cursor");
    const branches: Document[] = [];
    for (let index = 0; index < sortParts.length; index += 1) {
      const current = sortParts[index]!;
      const prior = Object.fromEntries(sortParts.slice(0, index).map((part, priorIndex) => [part.field, cursor.values[priorIndex]]));
      branches.push({ ...prior, [current.field]: { [current.direction === 1 ? "$gt" : "$lt"]: cursor.values[index] } });
    }
    return { $or: branches };
  }
}
