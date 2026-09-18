import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import type { Db, Document } from "mongodb";

import { exactOptionId } from "./career-property-canonical-mapping.js";
import { inspectCareerPropertyMigration } from "./career-property-inventory.js";

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const MONTH = /^\d{4}-(?:0[1-9]|1[0-2])$/;
const DAY = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const OFFSET_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const WRITABLE_TYPES = new Set(["text", "number", "checkbox", "select", "multi_select", "date", "url", "email", "phone", "file", "media"]);
const CANONICAL_DEFINITION_TYPES = new Set([...WRITABLE_TYPES, "relation", "formula", "rollup", "created_time", "updated_time"]);
const PROPERTY_KEY = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

export type CareerPropertyReconciliationMismatchReason =
  | "definition_identity_mismatch"
  | "missing_canonical_property_values"
  | "missing_canonical_value"
  | "unexpected_canonical_value"
  | "semantic_value_mismatch"
  | "unknown_legacy_property_key"
  | "orphan_canonical_property_id"
  | "stale_property_definition_id"
  | "invalid_legacy_value"
  | "invalid_canonical_value"
  | "tag_option_mismatch"
  | "migration_not_applied"
  | "unfinished_migration_journal"
  | `inventory:${string}`;

export interface CareerPropertyReconciliationMismatch {
  reason: CareerPropertyReconciliationMismatchReason;
  count: number;
  locations: string[];
}

export interface CareerPropertyReconciliationReport {
  summary: {
    categories: number;
    records: number;
    comparedValues: number;
    requiredMissing: number;
  };
  semanticDigests: { legacy: string; canonical: string };
  mismatches: CareerPropertyReconciliationMismatch[];
  canCutover: boolean;
}

interface CanonicalDefinition {
  id: string;
  key: string;
  type: string;
  required: boolean;
  deletedAt: unknown;
  config: Document;
}

interface CategoryState {
  definitionsByKey: Map<string, CanonicalDefinition>;
  definitionsById: Map<string, CanonicalDefinition>;
}

interface SemanticValue {
  propertyDefinitionId: string;
  type: string;
  value: unknown;
}

type StringIdDocument = Document & { _id: string };

class SemanticValueError extends Error {
  constructor(readonly reason: "invalid_legacy_value" | "invalid_canonical_value" | "tag_option_mismatch") {
    super(reason);
  }
}

class MismatchCollector {
  private readonly entries = new Map<CareerPropertyReconciliationMismatchReason, { count: number; locations: Set<string> }>();

  add(reason: CareerPropertyReconciliationMismatchReason, location: string, count = 1): void {
    const entry = this.entries.get(reason) ?? { count: 0, locations: new Set<string>() };
    entry.count += count;
    if (entry.locations.size < 20) entry.locations.add(location);
    this.entries.set(reason, entry);
  }

  report(): CareerPropertyReconciliationMismatch[] {
    return [...this.entries.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([reason, entry]) => ({ reason, count: entry.count, locations: [...entry.locations].sort() }));
  }
}

function isObject(value: unknown): value is Document {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalType(type: unknown): string {
  return type === "tags" ? "multi_select" : type === "boolean" ? "checkbox" : String(type);
}

function normalizeDecimal(raw: string): string | null {
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(raw);
  if (!match) return null;
  let digits = `${match[2]}${match[3] ?? ""}`.replace(/^0+/, "");
  if (digits.length === 0) return "0";
  let exponent = Number(match[4] ?? 0) - (match[3]?.length ?? 0);
  if (!Number.isSafeInteger(exponent)) return null;
  while (digits.endsWith("0")) {
    digits = digits.slice(0, -1);
    exponent += 1;
  }
  return `${match[1] === "-" ? "-" : ""}${digits}e${exponent}`;
}

function semanticNumber(value: unknown): string | null {
  if (typeof value === "number") return Number.isFinite(value) ? normalizeDecimal(String(value)) : null;
  if (!isObject(value) || typeof value["_bsontype"] !== "string") return null;
  if (!["Int32", "Long", "Double", "Decimal128"].includes(value["_bsontype"])) return null;
  const raw = value["_bsontype"] === "Double" && typeof value["value"] === "number"
    ? String(value["value"])
    : typeof value["toString"] === "function" ? String(value["toString"]()) : null;
  return raw ? normalizeDecimal(raw) : null;
}

function validCalendarDay(value: string): boolean {
  if (!DAY.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year!, month! - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month! - 1 && parsed.getUTCDate() === day;
}

function normalizeDate(value: unknown): Document | null {
  if (typeof value === "string" && MONTH.test(value)) return { precision: "month", start: value, end: null };
  if (!isObject(value) || typeof value["start"] !== "string") return null;
  const start = value["start"];
  const end = value["end"] ?? null;
  const inferredPrecision = typeof value["precision"] === "string"
    ? value["precision"]
    : start.includes("T") ? "datetime" : validCalendarDay(start) ? "day" : null;
  if (inferredPrecision === "month") {
    if (!MONTH.test(start) || (end !== null && (typeof end !== "string" || !MONTH.test(end))) || Object.hasOwn(value, "timezone")) return null;
    if (end !== null && end < start) return null;
    return { precision: "month", start, end };
  }
  if (inferredPrecision === "day") {
    if (!validCalendarDay(start) || (end !== null && (typeof end !== "string" || !validCalendarDay(end))) || Object.hasOwn(value, "timezone")) return null;
    if (end !== null && end < start) return null;
    return { precision: "day", start, end };
  }
  if (inferredPrecision === "datetime") {
    const timezone = value["timezone"] ?? null;
    if (!OFFSET_DATETIME.test(start) || !Number.isFinite(Date.parse(start))
      || (end !== null && (typeof end !== "string" || !OFFSET_DATETIME.test(end) || !Number.isFinite(Date.parse(end))))
      || (end !== null && Date.parse(end) < Date.parse(start))
      || (timezone !== null && (typeof timezone !== "string" || timezone.length < 1 || timezone.length > 64))) return null;
    return { precision: "datetime", start, end, timezone };
  }
  return null;
}

function unwrapLegacy(raw: unknown): { declaredType: string | null; value: unknown } {
  if (isObject(raw) && typeof raw["type"] === "string" && Object.hasOwn(raw, "value")) {
    return { declaredType: raw["type"], value: raw["value"] };
  }
  return { declaredType: null, value: raw };
}

function uuidArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.length <= 100 && value.every((item) => typeof item === "string" && UUID.test(item))
    ? [...value] as string[]
    : null;
}

function decodeLegacy(definition: CanonicalDefinition, raw: unknown): SemanticValue {
  const { declaredType, value } = unwrapLegacy(raw);
  const compatible = definition.type === "checkbox" ? ["boolean", "checkbox"]
    : definition.type === "multi_select" ? ["tags", "multi_select"] : [definition.type];
  if (declaredType !== null && !compatible.includes(declaredType)) throw new SemanticValueError("invalid_legacy_value");
  let semantic: unknown;
  if (definition.type === "text") {
    if (typeof value !== "string" || [...value].length > 50_000) throw new SemanticValueError("invalid_legacy_value");
    semantic = value;
  } else if (definition.type === "number") {
    semantic = semanticNumber(value);
    if (semantic === null) throw new SemanticValueError("invalid_legacy_value");
  } else if (definition.type === "checkbox") {
    if (typeof value !== "boolean") throw new SemanticValueError("invalid_legacy_value");
    semantic = value;
  } else if (definition.type === "multi_select" && declaredType !== "multi_select") {
    if (!Array.isArray(value) || value.length > 100 || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
      throw new SemanticValueError("invalid_legacy_value");
    }
    const options = isObject(definition.config) && Array.isArray(definition.config["options"])
      ? definition.config["options"] as Document[] : [];
    const optionById = new Map(options.flatMap((option) => typeof option["id"] === "string" && typeof option["name"] === "string" ? [[option["id"], option["name"]] as const] : []));
    semantic = (value as string[]).map((name) => {
      const id = exactOptionId(definition.id, name);
      if (optionById.get(id) !== name) throw new SemanticValueError("tag_option_mismatch");
      return id;
    });
  } else if (definition.type === "date") {
    semantic = normalizeDate(value);
    if (semantic === null) throw new SemanticValueError("invalid_legacy_value");
  } else if (definition.type === "select") {
    if (value !== null && (typeof value !== "string" || !UUID.test(value))) throw new SemanticValueError("invalid_legacy_value");
    semantic = value;
  } else if (["url", "email", "phone"].includes(definition.type)) {
    if (typeof value !== "string" || [...value].length > 2_000) throw new SemanticValueError("invalid_legacy_value");
    semantic = value;
  } else if (["multi_select", "file", "media"].includes(definition.type)) {
    semantic = uuidArray(value);
    if (semantic === null) throw new SemanticValueError("invalid_legacy_value");
  } else {
    throw new SemanticValueError("invalid_legacy_value");
  }
  return { propertyDefinitionId: definition.id, type: definition.type, value: semantic };
}

function decodeCanonical(definition: CanonicalDefinition, raw: Document): SemanticValue {
  if (!isDeepStrictEqual(Object.keys(raw).sort(), ["propertyDefinitionId", "type", "value"])
    || raw["propertyDefinitionId"] !== definition.id || raw["type"] !== definition.type) {
    throw new SemanticValueError("invalid_canonical_value");
  }
  const decoded = decodeLegacy(definition, { type: definition.type, value: raw["value"] });
  if (definition.type === "date" && !isDeepStrictEqual(raw["value"], decoded.value)) throw new SemanticValueError("invalid_canonical_value");
  return decoded;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function digestParts(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("\n")).digest("hex");
}

export async function reconcileCareerProperties(db: Db): Promise<CareerPropertyReconciliationReport> {
  const mismatches = new MismatchCollector();
  const inventory = await inspectCareerPropertyMigration(db);
  for (const conflict of inventory.conflicts) {
    mismatches.add(`inventory:${conflict.reason}`, conflict.locations[0] ?? "inventory", conflict.count);
  }

  const officialByCategoryAndKey = new Map(inventory.idMappings.map((mapping) => [`${mapping.categoryId}:${mapping.key}`, mapping.officialId]));
  const officialByOldId = new Map(inventory.idMappings.flatMap((mapping) => mapping.legacy0009Id && mapping.legacy0009Id !== mapping.officialId
    ? [[mapping.legacy0009Id, mapping.officialId] as const] : []));
  const categories = new Map<string, CategoryState>();
  let categoryCount = 0;
  for await (const category of db.collection<Document>("career_categories").find({}).batchSize(100)) {
    categoryCount += 1;
    const categoryId = String(category["_id"]);
    const definitionsByKey = new Map<string, CanonicalDefinition>();
    const definitionsById = new Map<string, CanonicalDefinition>();
    const seenDefinitionKeys = new Set<string>();
    const definitions = Array.isArray(category["propertyDefinitions"]) ? category["propertyDefinitions"] as Document[] : [];
    for (const raw of definitions) {
      const key = raw["key"];
      const id = raw["id"];
      const type = raw["type"];
      const complete = typeof key === "string" && PROPERTY_KEY.test(key)
        && typeof id === "string" && UUID.test(id)
        && typeof raw["name"] === "string" && raw["name"].length >= 1 && raw["name"].length <= 80
        && typeof type === "string" && CANONICAL_DEFINITION_TYPES.has(type)
        && typeof raw["required"] === "boolean" && typeof raw["system"] === "boolean"
        && isObject(raw["config"])
        && typeof raw["order"] === "number" && Number.isInteger(raw["order"]) && raw["order"] >= 0
        && typeof raw["version"] === "number" && Number.isInteger(raw["version"]) && raw["version"] >= 1
        && (raw["deletedAt"] === null || typeof raw["deletedAt"] === "string");
      if (typeof key === "string") seenDefinitionKeys.add(key);
      if (!complete) {
        mismatches.add("definition_identity_mismatch", `career_categories/${categoryId}/propertyDefinitions/${String(key)}`);
        continue;
      }
      const definition = { id, key, type, required: raw["required"], deletedAt: raw["deletedAt"], config: raw["config"] };
      const officialId = officialByCategoryAndKey.get(`${categoryId}:${key}`);
      if (officialId !== id) mismatches.add("definition_identity_mismatch", `career_categories/${categoryId}/propertyDefinitions/${key}`);
      definitionsByKey.set(key, definition);
      definitionsById.set(id, definition);
    }
    for (const mapping of inventory.idMappings.filter((item) => item.categoryId === categoryId)) {
      if (!seenDefinitionKeys.has(mapping.key)) mismatches.add("definition_identity_mismatch", `career_categories/${categoryId}/propertyDefinitions/${mapping.key}`);
    }
    categories.set(categoryId, { definitionsByKey, definitionsById });
  }

  const legacyDigestParts: string[] = [];
  const canonicalDigestParts: string[] = [];
  let recordCount = 0;
  let comparedValues = 0;
  let requiredMissing = 0;
  for await (const record of db.collection<Document>("career_records").find({}).sort({ _id: 1 }).batchSize(100)) {
    recordCount += 1;
    const recordId = String(record["_id"]);
    const categoryId = typeof record["categoryId"] === "string" ? record["categoryId"] : "";
    const category = categories.get(categoryId);
    if (!category) {
      mismatches.add("orphan_canonical_property_id", `career_records/${recordId}/categoryId`);
      continue;
    }
    const legacyValues = new Map<string, SemanticValue>();
    const properties = isObject(record["properties"]) ? record["properties"] : {};
    if (!isObject(record["properties"])) mismatches.add("invalid_legacy_value", `career_records/${recordId}/properties`);
    for (const [key, raw] of Object.entries(properties)) {
      const definition = category.definitionsByKey.get(key);
      if (!definition || definition.deletedAt !== null) {
        mismatches.add("unknown_legacy_property_key", `career_records/${recordId}/properties/${key}`);
        continue;
      }
      try {
        legacyValues.set(definition.id, decodeLegacy(definition, raw));
      } catch (error) {
        const reason = error instanceof SemanticValueError ? error.reason : "invalid_legacy_value";
        mismatches.add(reason, `career_records/${recordId}/properties/${key}`);
      }
    }

    const canonicalValues = new Map<string, SemanticValue>();
    if (!Object.hasOwn(record, "propertyValues")) {
      mismatches.add("missing_canonical_property_values", `career_records/${recordId}/propertyValues`);
    } else if (!Array.isArray(record["propertyValues"])) {
      mismatches.add("invalid_canonical_value", `career_records/${recordId}/propertyValues`);
    } else {
      for (const [index, raw] of (record["propertyValues"] as unknown[]).entries()) {
        const location = `career_records/${recordId}/propertyValues/${index}`;
        if (!isObject(raw) || typeof raw["propertyDefinitionId"] !== "string") {
          mismatches.add("invalid_canonical_value", location);
          continue;
        }
        const storedId = raw["propertyDefinitionId"];
        const officialId = officialByOldId.get(storedId) ?? storedId;
        if (officialId !== storedId) mismatches.add("stale_property_definition_id", location);
        const definition = category.definitionsById.get(officialId);
        if (!definition || definition.deletedAt !== null) {
          mismatches.add("orphan_canonical_property_id", location);
          continue;
        }
        try {
          const normalizedRaw = officialId === storedId ? raw : { ...raw, propertyDefinitionId: officialId };
          const decoded = decodeCanonical(definition, normalizedRaw);
          if (canonicalValues.has(officialId)) mismatches.add("invalid_canonical_value", location);
          else canonicalValues.set(officialId, decoded);
        } catch (error) {
          const reason = error instanceof SemanticValueError ? error.reason : "invalid_canonical_value";
          mismatches.add(reason === "invalid_legacy_value" ? "invalid_canonical_value" : reason, location);
        }
      }
    }

    for (const definition of category.definitionsByKey.values()) {
      if (definition.deletedAt === null && WRITABLE_TYPES.has(definition.type) && definition.required && !legacyValues.has(definition.id) && !canonicalValues.has(definition.id)) requiredMissing += 1;
    }
    const ids = new Set([...legacyValues.keys(), ...canonicalValues.keys()]);
    for (const id of [...ids].sort()) {
      const legacy = legacyValues.get(id);
      const canonical = canonicalValues.get(id);
      if (!legacy) mismatches.add("unexpected_canonical_value", `career_records/${recordId}/propertyValues/${id}`);
      else if (!canonical) mismatches.add("missing_canonical_value", `career_records/${recordId}/propertyValues/${id}`);
      else {
        comparedValues += 1;
        if (!isDeepStrictEqual(legacy, canonical)) mismatches.add("semantic_value_mismatch", `career_records/${recordId}/propertyValues/${id}`);
      }
      if (legacy) legacyDigestParts.push(`${recordId}:${id}:${stableJson(legacy)}`);
      if (canonical) canonicalDigestParts.push(`${recordId}:${id}:${stableJson(canonical)}`);
    }
  }

  const appliedVersions = new Set<string>();
  for await (const migration of db.collection<StringIdDocument>("schema_migrations").find({ _id: { $in: ["0011", "0012"] } }).batchSize(100)) {
    if (migration["state"] === "applied") appliedVersions.add(String(migration["_id"]));
  }
  for (const version of ["0011", "0012"]) {
    if (!appliedVersions.has(version)) mismatches.add("migration_not_applied", `schema_migrations/${version}`);
  }
  for await (const journal of db.collection<StringIdDocument>("career_property_migration_journal").find({
    migration: { $in: ["0011_career_property_canonical_identity", "0012_career_property_values_backfill"] },
    state: { $ne: "applied" },
    $or: [{ kind: "document" }, { kind: { $exists: false } }],
  }).batchSize(100)) {
    mismatches.add("unfinished_migration_journal", `career_property_migration_journal/${String(journal["_id"])}`);
  }

  const mismatchReport = mismatches.report();
  return {
    summary: { categories: categoryCount, records: recordCount, comparedValues, requiredMissing },
    semanticDigests: { legacy: digestParts(legacyDigestParts), canonical: digestParts(canonicalDigestParts) },
    mismatches: mismatchReport,
    canCutover: mismatchReport.length === 0,
  };
}
