import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { BSON, type Db, type Document, type Filter } from "mongodb";

import { exactOptionId } from "./canonical-mapping.js";
import { inspectCareerPropertyMigration, type PropertyIdMapping } from "./inventory.js";
import { reconcilePlannedDocumentJournals } from "./journal-recovery.js";
import type { MongoMigrationStep } from "../../mongo-migrations.js";

const MIGRATION_NAME = "0012_career_property_values_backfill";
const JOURNAL_COLLECTION = "career_property_migration_journal";
const CANARY_GATE_ID = "0012:compatibility-writer-canary";
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const MONTH = /^\d{4}-(?:0[1-9]|1[0-2])$/;
const DAY = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const OFFSET_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

interface PlannedWrite {
  collection: "career_categories" | "career_records";
  documentId: string;
  before: Document;
  after: Document;
}

interface CategoryState {
  document: Document;
  definitionsByKey: Map<string, Document>;
}

function isObject(value: unknown): value is Document {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return BSON.deserialize(BSON.serialize({ value }))["value"] as T;
}

function digest(value: Document): string {
  return createHash("sha256").update(BSON.serialize(value)).digest("hex");
}

function privateStringDiagnostic(source: string, value: string): string {
  const length = [...value].length;
  const valueDigest = createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
  return `${source}(length=${length},digest=${valueDigest})`;
}

function compareExact(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function requireCanaryGate(db: Db): Promise<void> {
  const gate = await db.collection<Document & { _id: string }>(JOURNAL_COLLECTION).findOne({ _id: CANARY_GATE_ID });
  if (!gate
    || gate["migration"] !== MIGRATION_NAME
    || gate["kind"] !== "execution_gate"
    || gate["state"] !== "verified"
    || typeof gate["deploymentVersion"] !== "string"
    || gate["deploymentVersion"].length === 0
    || !(gate["verifiedAt"] instanceof Date)
    || !Number.isInteger(gate["checkedWrites"])
    || Number(gate["checkedWrites"]) < 1
    || gate["mismatches"] !== 0) {
    throw new Error("0012 execution gate: compatibility writer production canary 증거가 없습니다.");
  }
}

function unwrap(raw: unknown): { declaredType: string | null; value: unknown } {
  if (isObject(raw) && typeof raw["type"] === "string" && Object.hasOwn(raw, "value")) {
    return { declaredType: raw["type"], value: raw["value"] };
  }
  return { declaredType: null, value: raw };
}

function supportedNumber(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (!isObject(value) || typeof value["_bsontype"] !== "string") return false;
  if (value["_bsontype"] === "Int32" || value["_bsontype"] === "Long") return true;
  if (value["_bsontype"] === "Double") return typeof value["value"] === "number" && Number.isFinite(value["value"]);
  return value["_bsontype"] === "Decimal128"
    && typeof value["toString"] === "function"
    && !["NaN", "Infinity", "-Infinity"].includes(String(value["toString"]()));
}

function validCalendarDay(value: string): boolean {
  if (!DAY.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year!, month! - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month! - 1
    && parsed.getUTCDate() === day;
}

function validOffsetDateTime(value: string): boolean {
  return OFFSET_DATETIME.test(value) && Number.isFinite(Date.parse(value));
}

function nullableMatchingEnd(value: Document, matches: (candidate: string) => boolean, key: string): string | null {
  const end = value["end"];
  if (end !== null && (typeof end !== "string" || !matches(end))) {
    throw new Error(`0012 변환 conflict: ${key} 날짜 end 값이 precision과 일치하지 않습니다.`);
  }
  return end;
}

function assertDateRange(start: string, end: string | null, key: string): void {
  if (end !== null && end < start) {
    throw new Error(`0012 변환 conflict: ${key} 날짜 end는 start보다 앞설 수 없습니다.`);
  }
}

function canonicalDate(value: unknown, key: string): Document {
  if (typeof value === "string" && MONTH.test(value)) {
    return { precision: "month", start: value, end: null };
  }
  if (!isObject(value) || typeof value["start"] !== "string") {
    throw new Error(`0012 변환 conflict: ${key} 날짜 값이 올바르지 않습니다.`);
  }
  const start = value["start"];
  if (value["precision"] === "month") {
    if (!MONTH.test(start) || Object.hasOwn(value, "timezone")) {
      throw new Error(`0012 변환 conflict: ${key} 날짜 값이 month precision과 일치하지 않습니다.`);
    }
    const end = nullableMatchingEnd(value, (candidate) => MONTH.test(candidate), key);
    assertDateRange(start, end, key);
    return { precision: "month", start, end };
  }
  if (value["precision"] === "day") {
    if (!validCalendarDay(start) || Object.hasOwn(value, "timezone")) {
      throw new Error(`0012 변환 conflict: ${key} 날짜 값이 day precision과 일치하지 않습니다.`);
    }
    const end = nullableMatchingEnd(value, validCalendarDay, key);
    assertDateRange(start, end, key);
    return { precision: "day", start, end };
  }
  if (value["precision"] === "datetime") {
    const timezone = value["timezone"];
    if (!validOffsetDateTime(start)
      || (timezone !== null && (typeof timezone !== "string" || timezone.length < 1 || timezone.length > 64))) {
      throw new Error(`0012 변환 conflict: ${key} 날짜 값이 datetime precision과 일치하지 않습니다.`);
    }
    const end = nullableMatchingEnd(value, validOffsetDateTime, key);
    if (end !== null && Date.parse(end) < Date.parse(start)) {
      throw new Error(`0012 변환 conflict: ${key} 날짜 end는 start보다 앞설 수 없습니다.`);
    }
    return { precision: "datetime", start, end, timezone };
  }
  if (Object.hasOwn(value, "precision")) {
    throw new Error(`0012 변환 conflict: ${key} 날짜 precision이 올바르지 않습니다.`);
  }
  if (start.includes("T")) {
    if (!validOffsetDateTime(start)) throw new Error(`0012 변환 conflict: ${key} 날짜 값이 올바르지 않습니다.`);
    const end = nullableMatchingEnd(value, validOffsetDateTime, key);
    if (end !== null && Date.parse(end) < Date.parse(start)) {
      throw new Error(`0012 변환 conflict: ${key} 날짜 end는 start보다 앞설 수 없습니다.`);
    }
    const timezone = value["timezone"] ?? null;
    if (timezone !== null && (typeof timezone !== "string" || timezone.length < 1 || timezone.length > 64)) {
      throw new Error(`0012 변환 conflict: ${key} 날짜 timezone이 올바르지 않습니다.`);
    }
    return { precision: "datetime", start, end, timezone };
  }
  if (validCalendarDay(start)) {
    const end = nullableMatchingEnd(value, validCalendarDay, key);
    assertDateRange(start, end, key);
    return { precision: "day", start, end };
  }
  throw new Error(`0012 변환 conflict: ${key} 날짜 값이 올바르지 않습니다.`);
}

function canonicalValue(
  definition: Document,
  raw: unknown,
  optionNames: Map<string, Set<string>>,
  source: string,
): Document {
  const propertyDefinitionId = String(definition["id"]);
  const key = String(definition["key"]);
  const type = String(definition["type"]);
  const { declaredType, value } = unwrap(raw);
  const compatibleTypes = type === "checkbox" ? ["boolean", "checkbox"] : type === "multi_select" ? ["tags", "multi_select"] : [type];
  if (declaredType !== null && !compatibleTypes.includes(declaredType)) {
    throw new Error(`0012 변환 conflict: ${key}의 legacy type과 Definition type이 다릅니다.`);
  }

  if (type === "text") {
    if (typeof value !== "string") throw new Error(`0012 변환 conflict: ${key} text 값이 지원되지 않습니다.`);
    if ([...value].length > 50_000) throw new Error(`0012 변환 conflict: ${key} text가 50,000자를 초과합니다.`);
    return validatedCanonicalValue(definition, { propertyDefinitionId, type, value });
  }
  if (type === "number") {
    if (!supportedNumber(value)) throw new Error(`0012 변환 conflict: ${key} number 값이 지원되지 않습니다.`);
    return validatedCanonicalValue(definition, { propertyDefinitionId, type, value: clone(value) });
  }
  if (type === "checkbox") {
    if (typeof value !== "boolean") throw new Error(`0012 변환 conflict: ${key} checkbox 값이 지원되지 않습니다.`);
    return validatedCanonicalValue(definition, { propertyDefinitionId, type, value });
  }
  if (type === "multi_select") {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
      throw new Error(`0012 변환 conflict: ${key} tag 값이 지원되지 않습니다.`);
    }
    if (declaredType === "multi_select") {
      if (value.some((item) => !UUID.test(item as string))) throw new Error(`0012 변환 conflict: ${key} option ID가 올바르지 않습니다.`);
      return validatedCanonicalValue(definition, { propertyDefinitionId, type, value: [...value] });
    }
    const names = optionNames.get(propertyDefinitionId) ?? new Set<string>();
    const ids = (value as string[]).map((name) => {
      if (name.trim().length === 0) throw new Error(`0012 변환 conflict: ${key}에 공백만 있는 tag가 있습니다.`);
      if ([...name].length > 80) {
        throw new Error(`0012 변환 conflict: canonical option name 80자 제한을 초과했습니다: ${privateStringDiagnostic(source, name)}`);
      }
      names.add(name);
      return exactOptionId(propertyDefinitionId, name);
    });
    optionNames.set(propertyDefinitionId, names);
    return validatedCanonicalValue(definition, { propertyDefinitionId, type, value: ids });
  }
  if (type === "date") return validatedCanonicalValue(definition, { propertyDefinitionId, type, value: canonicalDate(value, key) });

  if (["select", "url", "email", "phone", "file", "media"].includes(type) && declaredType === type) {
    return validatedCanonicalValue(definition, { propertyDefinitionId, type, value: clone(value) });
  }
  throw new Error(`0012 변환 conflict: ${key}/${type} legacy 값은 자동 변환할 수 없습니다.`);
}

function validatedCanonicalValue(definition: Document, value: Document): Document {
  const key = String(definition["key"]);
  const type = String(definition["type"]);
  if (!isDeepStrictEqual(Object.keys(value).sort(), ["propertyDefinitionId", "type", "value"])) {
    throw new Error(`0012 canonical conflict: ${key} PropertyValue shape가 올바르지 않습니다.`);
  }
  if (value["propertyDefinitionId"] !== definition["id"] || !UUID.test(String(value["propertyDefinitionId"]))) {
    throw new Error(`0012 canonical conflict: ${key} propertyDefinitionId가 올바르지 않습니다.`);
  }
  if (value["type"] !== type) throw new Error(`0012 canonical conflict: ${key} type이 Definition과 다릅니다.`);
  const raw = value["value"];
  if (type === "text") {
    if (typeof raw !== "string" || [...raw].length > 50_000) throw new Error(`0012 canonical conflict: ${key} text 값이 올바르지 않습니다.`);
  } else if (type === "number") {
    if (!supportedNumber(raw)) throw new Error(`0012 canonical conflict: ${key} number 값이 올바르지 않습니다.`);
  } else if (type === "checkbox") {
    if (typeof raw !== "boolean") throw new Error(`0012 canonical conflict: ${key} checkbox 값이 올바르지 않습니다.`);
  } else if (type === "select") {
    if (raw !== null && (typeof raw !== "string" || !UUID.test(raw))) throw new Error(`0012 canonical conflict: ${key} select option ID가 올바르지 않습니다.`);
  } else if (type === "multi_select" || type === "file" || type === "media") {
    if (!Array.isArray(raw) || raw.length > 100 || raw.some((item) => typeof item !== "string" || !UUID.test(item))) {
      throw new Error(`0012 canonical conflict: ${key} ${type} 배열이 올바르지 않습니다.`);
    }
  } else if (["url", "email", "phone"].includes(type)) {
    if (typeof raw !== "string" || [...raw].length > 2_000) throw new Error(`0012 canonical conflict: ${key} ${type} 값이 올바르지 않습니다.`);
  } else if (type === "date") {
    if (!isDeepStrictEqual(raw, canonicalDate(raw, key))) throw new Error(`0012 canonical conflict: ${key} date shape가 올바르지 않습니다.`);
  } else {
    throw new Error(`0012 canonical conflict: ${key}/${type}은 writable PropertyValue가 아닙니다.`);
  }
  return value;
}

function equalPropertyValues(left: readonly Document[], right: readonly Document[]): boolean {
  if (left.length !== right.length) return false;
  const rightById = new Map<string, Document>();
  for (const value of right) {
    const id = value["propertyDefinitionId"];
    if (typeof id !== "string" || rightById.has(id)) return false;
    rightById.set(id, value);
  }
  return left.every((value) => typeof value["propertyDefinitionId"] === "string"
    && isDeepStrictEqual(value, rightById.get(String(value["propertyDefinitionId"]))));
}

function mergeOptions(category: Document, optionNames: ReadonlyMap<string, Set<string>>): Document {
  const result = clone(category);
  const definitions = Array.isArray(result["propertyDefinitions"]) ? result["propertyDefinitions"] as Document[] : [];
  for (const definition of definitions) {
    const propertyId = definition["id"];
    if (typeof propertyId !== "string" || !optionNames.has(propertyId)) continue;
    const config = isObject(definition["config"]) ? definition["config"] : {};
    const options = Array.isArray(config["options"]) ? config["options"] as Document[] : [];
    const byId = new Map<string, Document>();
    const byName = new Map<string, string>();
    for (const option of options) {
      const id = option["id"];
      const name = option["name"];
      if (typeof id !== "string" || typeof name !== "string" || [...name].length > 80 || byId.has(id) || byName.has(name)) {
        throw new Error(`0012 option conflict: ${String(definition["key"])}의 기존 option이 올바르지 않습니다.`);
      }
      byId.set(id, option);
      byName.set(name, id);
    }
    for (const name of [...optionNames.get(propertyId)!].sort(compareExact)) {
      const id = exactOptionId(propertyId, name);
      const storedById = byId.get(id);
      const storedIdByName = byName.get(name);
      if ((storedById && storedById["name"] !== name) || (storedIdByName && storedIdByName !== id)) {
        throw new Error(`0012 option conflict: ${String(definition["key"])}의 exact option identity가 다릅니다.`);
      }
      if (!storedById) {
        const option = { id, name };
        options.push(option);
        byId.set(id, option);
        byName.set(name, id);
      }
    }
    if (options.length > 100) throw new Error(`0012 option conflict: ${String(definition["key"])} option이 100개를 초과합니다.`);
    definition["config"] = { ...config, options };
  }
  return result;
}

function categoryStates(categories: readonly Document[], mappings: readonly PropertyIdMapping[]): Map<string, CategoryState> {
  const states = new Map<string, CategoryState>();
  for (const category of categories) {
    const categoryId = String(category["_id"]);
    const mappingByKey = new Map(mappings.filter((mapping) => mapping.categoryId === categoryId).map((mapping) => [mapping.key, mapping]));
    const definitions = Array.isArray(category["propertyDefinitions"]) ? category["propertyDefinitions"] as Document[] : [];
    const definitionsByKey = new Map<string, Document>();
    for (const definition of definitions) {
      const key = definition["key"];
      const mapping = typeof key === "string" ? mappingByKey.get(key) : undefined;
      if (!mapping || definition["id"] !== mapping.officialId || definition["deletedAt"] !== null) continue;
      definitionsByKey.set(key, definition);
    }
    states.set(categoryId, { document: category, definitionsByKey });
  }
  return states;
}

async function loadCategories(db: Db, mappings: readonly PropertyIdMapping[]): Promise<{
  categories: Document[];
  states: Map<string, CategoryState>;
}> {
  const categories: Document[] = [];
  for await (const category of db.collection<Document>("career_categories").find({}).sort({ _id: 1 }).batchSize(100)) {
    categories.push(category);
  }
  return { categories, states: categoryStates(categories, mappings) };
}

function recordPlan(
  record: Document,
  states: ReadonlyMap<string, CategoryState>,
  optionNames: Map<string, Set<string>>,
): PlannedWrite | null {
  const categoryId = record["categoryId"];
  const category = typeof categoryId === "string" ? states.get(categoryId) : undefined;
  if (!category) throw new Error(`0012 preflight conflict: Record ${String(record["_id"])}의 Category를 찾을 수 없습니다.`);
  if (!isObject(record["properties"])) throw new Error(`0012 preflight conflict: Record ${String(record["_id"])}의 properties shape가 올바르지 않습니다.`);
  const expected: Document[] = [];
  const orderedDefinitions = [...category.definitionsByKey.values()].sort((left, right) => Number(left["order"]) - Number(right["order"]) || compareExact(String(left["key"]), String(right["key"])));
  const knownKeys = new Set(orderedDefinitions.map((definition) => String(definition["key"])));
  for (const key of Object.keys(record["properties"])) {
    if (!knownKeys.has(key)) throw new Error(`0012 preflight conflict: Record ${String(record["_id"])}의 알 수 없는 property key ${key}`);
  }
  for (const definition of orderedDefinitions) {
    const key = String(definition["key"]);
    if (!Object.hasOwn(record["properties"], key)) continue;
    expected.push(canonicalValue(
      definition,
      record["properties"][key],
      optionNames,
      `career_records/${String(record["_id"])}/properties/${key}:tag`,
    ));
  }
  if (Object.hasOwn(record, "propertyValues")) {
    if (!Array.isArray(record["propertyValues"])) {
      throw new Error(`0012 canonical conflict: Record ${String(record["_id"])}의 propertyValues shape가 올바르지 않습니다.`);
    }
    const definitionsById = new Map([...category.definitionsByKey.values()].map((definition) => [String(definition["id"]), definition]));
    for (const value of record["propertyValues"] as Document[]) {
      if (!isObject(value) || typeof value["propertyDefinitionId"] !== "string") {
        throw new Error(`0012 canonical conflict: Record ${String(record["_id"])}의 PropertyValue shape가 올바르지 않습니다.`);
      }
      const definition = definitionsById.get(value["propertyDefinitionId"]);
      if (!definition) throw new Error(`0012 canonical conflict: Record ${String(record["_id"])}에 알 수 없는 propertyDefinitionId가 있습니다.`);
      validatedCanonicalValue(definition, value);
    }
    if (!equalPropertyValues(expected, record["propertyValues"] as Document[])) {
      throw new Error(`0012 canonical conflict: Record ${String(record["_id"])}의 propertyValues가 legacy properties와 다릅니다.`);
    }
    return null;
  }
  const after = clone(record);
  after["propertyValues"] = expected;
  return { collection: "career_records", documentId: String(record["_id"]), before: record, after };
}

async function scanBackfill(db: Db): Promise<{
  categories: Document[];
  states: Map<string, CategoryState>;
  optionNames: Map<string, Set<string>>;
  changeCount: number;
}> {
  await requireCanaryGate(db);
  const report = await inspectCareerPropertyMigration(db);
  if (!report.canMigrate) {
    throw new Error(`0012 preflight conflict: ${report.conflicts.map(({ reason, count }) => `${reason}(${count})`).join(", ")}`);
  }
  const { categories, states } = await loadCategories(db, report.idMappings);
  const optionNames = new Map<string, Set<string>>();
  let changeCount = 0;
  for await (const record of db.collection<Document>("career_records").find({}).sort({ _id: 1 }).batchSize(100)) {
    if (recordPlan(record, states, optionNames)) changeCount += 1;
  }

  for (const category of categories) {
    const after = mergeOptions(category, optionNames);
    if (!isDeepStrictEqual(category, after)) changeCount += 1;
  }
  return { categories, states, optionNames, changeCount };
}

async function writeJournal(db: Db, plan: PlannedWrite): Promise<void> {
  const journal = db.collection<Document & { _id: string }>(JOURNAL_COLLECTION);
  const _id = `${MIGRATION_NAME}:${plan.collection}:${plan.documentId}`;
  const entry = {
    _id,
    migration: MIGRATION_NAME,
    kind: "document",
    collection: plan.collection,
    documentId: plan.documentId,
    before: plan.before,
    after: plan.after,
    beforeDigest: digest(plan.before),
    afterDigest: digest(plan.after),
    state: "planned",
  };
  const existing = await journal.findOne({ _id });
  if (existing && !isDeepStrictEqual({ ...existing, _id: undefined }, { ...entry, _id: undefined })) {
    throw new Error(`0012 journal conflict: ${_id}`);
  }
  if (!existing) await journal.insertOne(entry);
}

async function applyWrite(db: Db, plan: PlannedWrite): Promise<void> {
  await writeJournal(db, plan);
  const collection = db.collection<Document & { _id: unknown }>(plan.collection);
  const result = await collection.replaceOne(plan.before as Filter<Document & { _id: unknown }>, plan.after);
  if (result.modifiedCount === 0) {
    const current = await collection.findOne({ _id: plan.before["_id"] });
    if (!current || !isDeepStrictEqual(current, plan.after)) {
      throw new Error(`0012 CAS conflict: ${plan.collection}/${plan.documentId}가 preflight 이후 변경되었습니다.`);
    }
  }
  await db.collection<Document & { _id: string }>(JOURNAL_COLLECTION).updateOne(
    { _id: `${MIGRATION_NAME}:${plan.collection}:${plan.documentId}`, state: "planned" },
    { $set: { state: "applied" } },
  );
}

async function applyPlan(db: Db): Promise<void> {
  await reconcilePlannedDocumentJournals(db, JOURNAL_COLLECTION, MIGRATION_NAME);
  const scan = await scanBackfill(db);
  for (const category of scan.categories) {
    const after = mergeOptions(category, scan.optionNames);
    if (!isDeepStrictEqual(category, after)) {
      await applyWrite(db, { collection: "career_categories", documentId: String(category["_id"]), before: category, after });
    }
  }
  for await (const record of db.collection<Document>("career_records").find({}).sort({ _id: 1 }).batchSize(100)) {
    const plan = recordPlan(record, scan.states, scan.optionNames);
    if (plan) await applyWrite(db, plan);
  }
}

async function verifyBackfill(db: Db): Promise<void> {
  const remaining = await scanBackfill(db);
  if (remaining.changeCount > 0) throw new Error(`0012 postflight conflict: ${remaining.changeCount}개 document가 아직 backfill되지 않았습니다.`);
  const unfinished = await db.collection<Document & { _id: string }>(JOURNAL_COLLECTION).countDocuments({ migration: MIGRATION_NAME, kind: "document", state: { $ne: "applied" } });
  if (unfinished > 0) throw new Error(`0012 postflight conflict: ${unfinished}개 journal이 완료되지 않았습니다.`);
}

export async function careerPropertyLegacyBackfillSteps(): Promise<MongoMigrationStep[]> {
  return [
    { id: "career_property_values:canary_and_preflight", async run(db) { await scanBackfill(db); } },
    { id: "career_property_values:journal_and_backfill", run: applyPlan },
    { id: "career_property_values:postflight", run: verifyBackfill },
  ];
}
