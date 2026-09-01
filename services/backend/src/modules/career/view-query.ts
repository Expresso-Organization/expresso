import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type {
  CareerCategory,
  CareerPropertyDefinitionV2,
  CareerViewConfiguration,
} from "@expresso/contracts";
import type { Document } from "mongodb";

import { CareerError } from "./errors.js";

const CURSOR_LIFETIME_MS = 15 * 60_000;
const CURSOR_SECRET = process.env.CAREER_VIEW_CURSOR_SECRET ?? "expresso-career-view-cursor-secret";

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
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
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
    return payload;
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

function fieldExpression(definition: CareerPropertyDefinitionV2): Document | string {
  if (definition.type === "title") return "$title";
  if (definition.type === "created_time" && definition.system) return { $ifNull: ["$createdAt", "$updatedAt"] };
  if (definition.type === "updated_time" && definition.system) return "$updatedAt";
  const raw = definition.type === "formula" || definition.type === "rollup"
    ? { $getField: { input: { $ifNull: ["$computedProperties", {}] }, field: definition.key } }
    : { $getField: { input: { $ifNull: ["$properties", {}] }, field: definition.key } };
  const value = unwrapStoredValue(raw);
  if (definition.type === "date") {
    return { $cond: [
      { $and: [{ $eq: [{ $type: value }, "object"] }, { $ne: [{ $type: { $getField: { input: value, field: "start" } } }, "missing"] }] },
      { $getField: { input: value, field: "start" } }, value,
    ] };
  }
  return value;
}

function operandValue(operand: unknown): unknown {
  if (!operand || typeof operand !== "object" || !("value" in operand)) return null;
  const typed = operand as { type?: unknown; value: unknown };
  if (typed.type === "date" && typed.value && typeof typed.value === "object" && "start" in typed.value) {
    return (typed.value as { start: unknown }).start;
  }
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
    if (operandType !== definition.type) throw new CareerError(400, "view operand type does not match property type", { propertyId: definition.id });
  }
}

function filterExpression(
  filter: CareerViewFilterV2,
  definitions: ReadonlyMap<string, CareerPropertyDefinitionV2>,
): Document {
  if ("filters" in filter) {
    const expressions = filter.filters.map((child) => filterExpression(child, definitions));
    return { [`$${filter.operator}`]: expressions };
  }
  const definition = definitions.get(filter.propertyId);
  if (!definition) throw new CareerError(400, "view references a deleted or foreign property", { propertyId: filter.propertyId });
  validateFilterOperator(filter, definition);
  const value = fieldExpression(definition);
  const operand = operandValue(filter.operand);
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
        { $and: [{ $isArray: value }, { $eq: [{ $size: value }, 0] }] },
      ] };
    case "is_not_empty":
      return { $not: [filterExpression({ ...filter, operator: "is_empty" }, definitions)] };
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
    case "not_contains": return { $not: [filterExpression({ ...filter, operator: "contains" }, definitions)] };
  }
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
  compile(category: CareerCategory, view: CareerViewConfiguration): CompiledCareerView {
    if (category.id !== view.categoryId) throw new CareerError(400, "view category does not match query category");
    const filter = view.filter as CareerViewFilterV2 | null;
    if (leafCount(filter) > 20) throw new CareerError(400, "view filter limit exceeded");
    if (view.sorts.length > 10) throw new CareerError(400, "view sort limit exceeded");
    const definitions = new Map(activeDefinitions(category).map((definition) => [definition.id, definition]));
    for (const id of referencedPropertyIds(view)) {
      if (!definitions.has(id)) throw new CareerError(400, "view references a deleted or foreign property", { propertyId: id });
    }
    if (view.timeline) {
      const start = definitions.get(view.timeline.startPropertyId);
      const end = view.timeline.endPropertyId ? definitions.get(view.timeline.endPropertyId) : undefined;
      if (start?.type !== "date" || (end && end.type !== "date")) throw new CareerError(400, "timeline fields must be date properties");
    }

    const pipeline: Document[] = [];
    if (filter) pipeline.push({ $match: { $expr: filterExpression(filter, definitions) } });
    const computed: Document = {};
    const sort: Document = {};
    const sortParts: SortPart[] = [];
    for (const [index, configured] of view.sorts.entries()) {
      const valueField = `__careerViewSort${index}`;
      const nullField = `__careerViewNull${index}`;
      const value = fieldExpression(definitions.get(configured.propertyId)!);
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
