import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { BSON, type Db, type Document, type Filter } from "mongodb";

import {
  careerPropertyReferenceLocations,
  inspectCareerPropertyMigration,
  type PropertyIdMapping,
} from "../../career-property-inventory.js";
import type { MongoMigrationStep } from "../../mongo-migrations.js";

const MIGRATION_NAME = "0011_career_property_canonical_identity";
const JOURNAL_COLLECTION = "career_property_migration_journal";
const UUID_PATTERN = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";
const OFFSET_DATE_TIME_PATTERN = "^\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])T(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|[+-](?:[01]\\d|2[0-3]):[0-5]\\d)$";
const REGISTERED_COLLECTIONS: ReadonlySet<string> = new Set(careerPropertyReferenceLocations.map(({ collection }) => collection));
const HANDLED_REFERENCE_LOCATIONS = new Set([
  "career_categories:propertySchemaV2[].config",
  "career_categories:propertySchemaTombstones[].id",
  "career_categories:propertySchemaTombstones[].config",
  "career_categories:propertyMutationResults",
  "career_records:propertyValues[].propertyDefinitionId",
  "career_records:propertyValueTombstones.$keys",
  "career_records:unmappedProperties.$keys",
  "career_views:configuration",
  "career_record_relations:sourcePropertyId",
  "career_record_relations:inversePropertyId",
  "career_ai_proposals:propertyChanges[].propertyId",
  "outbox_events:payload.changedPropertyIds[]",
  "outbox_events:payload.sourcePropertyVersions.$keys",
]);

for (const reference of careerPropertyReferenceLocations) {
  const key = `${reference.collection}:${reference.path}`;
  if (!HANDLED_REFERENCE_LOCATIONS.has(key)) throw new Error(`0011 migration handler가 없는 reference registry 항목입니다: ${key}`);
}
if (HANDLED_REFERENCE_LOCATIONS.size !== careerPropertyReferenceLocations.length) {
  throw new Error("0011 migration reference handler와 inventory registry가 일치하지 않습니다.");
}

interface PlannedWrite {
  collection: string;
  documentId: string;
  before: Document;
  after: Document;
}

function isObject(value: unknown): value is Document {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPlainObject(value: unknown): value is Document {
  if (!isObject(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function cloneDocument<T extends Document>(document: T): T {
  return BSON.deserialize(BSON.serialize(document)) as T;
}

function digest(document: Document): string {
  return createHash("sha256").update(JSON.stringify(document)).digest("hex");
}

function canonicalType(type: unknown): unknown {
  return type === "tags" ? "multi_select" : type === "boolean" ? "checkbox" : type;
}

function mappingIndex(mappings: readonly PropertyIdMapping[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const mapping of mappings) {
    if (!mapping.legacy0009Id || mapping.legacy0009Id === mapping.officialId) continue;
    const previous = result.get(mapping.legacy0009Id);
    if (previous && previous !== mapping.officialId) {
      throw new Error(`preflight conflict: ${mapping.legacy0009Id}의 공식 ID가 둘 이상입니다.`);
    }
    result.set(mapping.legacy0009Id, mapping.officialId);
  }
  return result;
}

function rewriteJson(value: unknown, ids: ReadonlyMap<string, string>): unknown {
  if (typeof value === "string") return ids.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => rewriteJson(item, ids));
  if (!isPlainObject(value)) return value;

  const rewritten: Document = {};
  for (const [key, child] of Object.entries(value)) {
    const rewrittenKey = ids.get(key) ?? key;
    const rewrittenValue = rewriteJson(child, ids);
    if (Object.hasOwn(rewritten, rewrittenKey) && !isDeepStrictEqual(rewritten[rewrittenKey], rewrittenValue)) {
      throw new Error(`preflight conflict: ${key}와 ${rewrittenKey}의 값 의미가 다릅니다.`);
    }
    rewritten[rewrittenKey] = rewrittenValue;
  }
  return rewritten;
}

function containsLegacyId(value: unknown, ids: ReadonlySet<string>): boolean {
  if (typeof value === "string") return ids.has(value);
  if (Array.isArray(value)) return value.some((item) => containsLegacyId(item, ids));
  if (!isObject(value)) return false;
  return Object.entries(value).some(([key, child]) => ids.has(key) || containsLegacyId(child, ids));
}

function definitionMeaning(definition: Document): Document {
  return {
    key: definition["key"],
    name: definition["name"] ?? definition["label"],
    type: canonicalType(definition["type"]),
    required: definition["required"],
    system: definition["system"],
  };
}

function canonicalDefinition(definition: Document, fallbackOrder: number): Document {
  return {
    id: definition["id"],
    key: definition["key"],
    name: definition["name"] ?? definition["label"],
    type: canonicalType(definition["type"]),
    required: definition["required"],
    system: definition["system"],
    config: cloneDocument(isObject(definition["config"]) ? definition["config"] : {}),
    order: typeof definition["order"] === "number" ? definition["order"] : fallbackOrder,
    version: typeof definition["version"] === "number" ? definition["version"] : 1,
    deletedAt: typeof definition["deletedAt"] === "string" ? definition["deletedAt"] : null,
  };
}

function canonicalDefinitions(category: Document, mappings: readonly PropertyIdMapping[], ids: ReadonlyMap<string, string>): Document[] {
  const categoryId = String(category["_id"]);
  const categoryMappings = new Map(mappings.filter((item) => item.categoryId === categoryId).map((item) => [item.key, item]));
  const current = Array.isArray(category["propertyDefinitions"]) ? category["propertyDefinitions"] as Document[] : [];
  const v2 = [category["propertySchemaV2"], category["propertySchemaTombstones"]]
    .flatMap((value) => Array.isArray(value) ? value as Document[] : []);
  const legacySchema = isObject(category["propertySchema"]) ? category["propertySchema"] : {};
  const sources: Document[] = v2.length > 0
    ? v2
    : Object.entries(legacySchema).map(([key, value]) => ({ ...(value as Document), key }));
  const byKey = new Map<string, Document>();

  for (const [order, source] of sources.entries()) {
    const key = source["key"];
    if (typeof key !== "string") throw new Error(`preflight conflict: ${categoryId}에 key 없는 PropertyDefinition이 있습니다.`);
    if (source["type"] === "title") throw new Error(`preflight conflict: ${categoryId}/${key} title은 일반 PropertyDefinition이 될 수 없습니다.`);
    const mapping = categoryMappings.get(key);
    if (!mapping) throw new Error(`preflight conflict: ${categoryId}/${key}의 공식 ID mapping이 없습니다.`);
    const normalized = canonicalDefinition({ ...source, id: mapping.officialId }, order);
    const previous = byKey.get(key);
    if (previous && !isDeepStrictEqual(previous, normalized)) {
      throw new Error(`preflight conflict: ${categoryId}/${key} Definition 의미가 서로 다릅니다.`);
    }
    byKey.set(key, normalized);
  }

  for (const existing of current) {
    const key = existing["key"];
    if (typeof key !== "string") throw new Error(`preflight conflict: ${categoryId}의 propertyDefinitions shape가 잘못되었습니다.`);
    const expected = byKey.get(key);
    const isCanonicalShape = ["name", "config", "order", "version", "deletedAt"].some((field) => Object.hasOwn(existing, field));
    const sameMeaning = expected && (isCanonicalShape
      ? isDeepStrictEqual(
        rewriteJson(canonicalDefinition({ ...existing, id: expected["id"] }, Number(expected["order"])), ids),
        rewriteJson(expected, ids),
      )
      : isDeepStrictEqual(definitionMeaning(existing), definitionMeaning(expected)));
    if (!sameMeaning) {
      throw new Error(`preflight conflict: ${categoryId}/${key} old/official Definition 의미가 다릅니다.`);
    }
  }

  return [...byKey.values()]
    .map((definition) => rewriteJson(definition, ids) as Document)
    .sort((left, right) => Number(left["order"]) - Number(right["order"]) || String(left["key"]).localeCompare(String(right["key"])));
}

function rewritePropertyValues(values: unknown, ids: ReadonlyMap<string, string>): unknown {
  if (!Array.isArray(values)) return values;
  const byOfficialId = new Map<string, Document>();
  for (const raw of values) {
    if (!isObject(raw) || typeof raw["propertyDefinitionId"] !== "string") return values;
    const rewritten = { ...raw, propertyDefinitionId: ids.get(raw["propertyDefinitionId"]) ?? raw["propertyDefinitionId"] };
    const propertyId = String(rewritten.propertyDefinitionId);
    const previous = byOfficialId.get(propertyId);
    if (previous && !isDeepStrictEqual(previous, rewritten)) {
      throw new Error(`preflight conflict: ${propertyId}로 합쳐질 PropertyValue 의미가 다릅니다.`);
    }
    byOfficialId.set(propertyId, rewritten);
  }
  return [...byOfficialId.values()];
}

function rewriteCategory(document: Document, mappings: readonly PropertyIdMapping[], ids: ReadonlyMap<string, string>): Document {
  const result = cloneDocument(document);
  result["propertyDefinitions"] = canonicalDefinitions(document, mappings, ids);
  for (const field of ["propertySchemaV2", "propertySchemaTombstones"] as const) {
    if (!Array.isArray(result[field])) continue;
    result[field] = (result[field] as Document[]).map((definition) => ({
      ...definition,
      ...(field === "propertySchemaTombstones" && typeof definition["id"] === "string"
        ? { id: ids.get(definition["id"]) ?? definition["id"] }
        : {}),
      ...(isObject(definition["config"]) ? { config: rewriteJson(definition["config"], ids) } : {}),
    }));
  }
  if (Object.hasOwn(result, "propertyMutationResults")) result["propertyMutationResults"] = rewriteJson(result["propertyMutationResults"], ids);
  return result;
}

function rewriteRegisteredDocument(collection: string, document: Document, mappings: readonly PropertyIdMapping[], ids: ReadonlyMap<string, string>): Document {
  const result = cloneDocument(document);
  if (collection === "career_categories") return rewriteCategory(result, mappings, ids);
  if (collection === "career_records") {
    if (Object.hasOwn(result, "propertyValues")) result["propertyValues"] = rewritePropertyValues(result["propertyValues"], ids);
    if (Object.hasOwn(result, "propertyValueTombstones")) result["propertyValueTombstones"] = rewriteJson(result["propertyValueTombstones"], ids);
    return result;
  }
  if (collection === "career_views" && Object.hasOwn(result, "configuration")) result["configuration"] = rewriteJson(result["configuration"], ids);
  if (collection === "career_record_relations") {
    for (const field of ["sourcePropertyId", "inversePropertyId"] as const) if (typeof result[field] === "string") result[field] = ids.get(result[field]) ?? result[field];
  }
  if (collection === "career_ai_proposals" && Array.isArray(result["propertyChanges"])) {
    result["propertyChanges"] = (result["propertyChanges"] as Document[]).map((change) => ({
      ...change,
      ...(typeof change["propertyId"] === "string" ? { propertyId: ids.get(change["propertyId"]) ?? change["propertyId"] } : {}),
    }));
  }
  if (collection === "outbox_events" && isObject(result["payload"])) {
    const payload = { ...result["payload"] };
    if (Array.isArray(payload["changedPropertyIds"])) payload["changedPropertyIds"] = rewriteJson(payload["changedPropertyIds"], ids);
    if (isObject(payload["sourcePropertyVersions"])) payload["sourcePropertyVersions"] = rewriteJson(payload["sourcePropertyVersions"], ids);
    result["payload"] = payload;
  }
  return result;
}

async function buildPlan(db: Db): Promise<PlannedWrite[]> {
  const report = await inspectCareerPropertyMigration(db);
  if (!report.canMigrate) {
    const reasons = report.conflicts.map(({ reason, count }) => `${reason}(${count})`).join(", ");
    throw new Error(`0011 preflight conflict: ${reasons}`);
  }
  const ids = mappingIndex(report.idMappings);
  const oldIds = new Set(ids.keys());
  const plans: PlannedWrite[] = [];

  const collectionNames = (await db.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name);
  for (const collection of collectionNames) {
    if ([JOURNAL_COLLECTION, "schema_migrations", "migration_locks"].includes(collection)) continue;
    for (const before of await db.collection<Document>(collection).find({}).toArray()) {
      const after = REGISTERED_COLLECTIONS.has(collection)
        ? rewriteRegisteredDocument(collection, before, report.idMappings, ids)
        : cloneDocument(before);
      if (containsLegacyId(after, oldIds)) {
        throw new Error(`0011 preflight conflict: 등록되지 않은 0009 ID 참조가 ${collection}/${String(before["_id"])}에 남습니다.`);
      }
      if (!isDeepStrictEqual(before, after)) plans.push({ collection, documentId: String(before["_id"]), before, after });
    }
  }
  return plans;
}

async function writeJournal(db: Db, plans: readonly PlannedWrite[]): Promise<void> {
  if (plans.length === 0) return;
  const journal = db.collection<Document & { _id: string }>(JOURNAL_COLLECTION);
  for (const plan of plans) {
    const _id = `${MIGRATION_NAME}:${plan.collection}:${plan.documentId}`;
    const entry = {
      _id,
      migration: MIGRATION_NAME,
      collection: plan.collection,
      documentId: plan.documentId,
      before: plan.before,
      after: plan.after,
      beforeDigest: digest(plan.before),
      afterDigest: digest(plan.after),
      state: "planned",
    };
    const existing = await journal.findOne({ _id });
    if (existing && !isDeepStrictEqual(
      { ...existing, _id: undefined },
      { ...entry, _id: undefined },
    )) throw new Error(`0011 journal conflict: ${_id}`);
    if (!existing) await journal.insertOne(entry);
  }
}

async function applyPlan(db: Db): Promise<void> {
  const plans = await buildPlan(db);
  await writeJournal(db, plans);
  const journal = db.collection<Document & { _id: string }>(JOURNAL_COLLECTION);
  for (const plan of plans) {
    const collection = db.collection<Document & { _id: unknown }>(plan.collection);
    const result = await collection.replaceOne(
      plan.before as Filter<Document & { _id: unknown }>,
      plan.after,
      { bypassDocumentValidation: true },
    );
    if (result.modifiedCount === 0) {
      const current = await collection.findOne({ _id: plan.before["_id"] });
      if (!current || !isDeepStrictEqual(current, plan.after)) {
        throw new Error(`0011 CAS conflict: ${plan.collection}/${plan.documentId}가 preflight 이후 변경되었습니다.`);
      }
    }
    await journal.updateOne(
      { _id: `${MIGRATION_NAME}:${plan.collection}:${plan.documentId}` },
      { $set: { state: "applied" } },
    );
  }
}

async function collectionValidator(db: Db, name: string): Promise<Document> {
  const info = await db.listCollections({ name }, { nameOnly: false }).next() as Document | null;
  if (!info) throw new Error(`${name} collection이 없습니다.`);
  return structuredClone((info.options.validator ?? {}) as Document);
}

function canonicalDefinitionSchema(): Document {
  return {
    bsonType: "array",
    maxItems: 50,
    items: {
      bsonType: "object",
      required: ["id", "key", "name", "type", "required", "system", "config", "order", "version", "deletedAt"],
      properties: {
        id: { bsonType: "string", pattern: UUID_PATTERN, maxLength: 36 },
        key: { bsonType: "string", pattern: "^[A-Za-z][A-Za-z0-9_]{0,63}$" },
        name: { bsonType: "string", minLength: 1, maxLength: 80 },
        type: { bsonType: "string", enum: ["text", "number", "checkbox", "select", "multi_select", "date", "url", "email", "phone", "file", "media", "relation", "formula", "rollup", "created_time", "updated_time"] },
        required: { bsonType: "bool" },
        system: { bsonType: "bool" },
        config: { bsonType: "object" },
        order: { bsonType: ["int", "long", "double"], minimum: 0, multipleOf: 1 },
        version: { bsonType: ["int", "long", "double"], minimum: 1, multipleOf: 1 },
        deletedAt: { bsonType: ["string", "null"], pattern: OFFSET_DATE_TIME_PATTERN },
      },
      additionalProperties: false,
    },
  };
}

function uuidSchema(): Document {
  return { bsonType: "string", pattern: UUID_PATTERN, maxLength: 36 };
}

function dateValueSchema(): Document {
  return {
    bsonType: "object",
    oneOf: [
      {
        required: ["precision", "start", "end"],
        properties: {
          precision: { enum: ["month"] }, start: { bsonType: "string", pattern: "^\\d{4}-(?:0[1-9]|1[0-2])$" },
          end: { bsonType: ["string", "null"], pattern: "^\\d{4}-(?:0[1-9]|1[0-2])$" },
        },
        additionalProperties: false,
      },
      {
        required: ["precision", "start", "end"],
        properties: {
          precision: { enum: ["day"] }, start: { bsonType: "string", pattern: "^\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])$" },
          end: { bsonType: ["string", "null"], pattern: "^\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])$" },
        },
        additionalProperties: false,
      },
      {
        required: ["precision", "start", "end", "timezone"],
        properties: {
          precision: { enum: ["datetime"] },
          start: { bsonType: "string", pattern: OFFSET_DATE_TIME_PATTERN },
          end: { bsonType: ["string", "null"], pattern: OFFSET_DATE_TIME_PATTERN },
          timezone: { bsonType: ["string", "null"], maxLength: 64 },
        },
        additionalProperties: false,
      },
    ],
  };
}

function propertyValueBranch(type: string | string[], value: Document): Document {
  return {
    bsonType: "object",
    required: ["propertyDefinitionId", "type", "value"],
    properties: {
      propertyDefinitionId: uuidSchema(),
      type: { enum: Array.isArray(type) ? type : [type] },
      value,
    },
    additionalProperties: false,
  };
}

function writablePropertyValuesSchema(): Document {
  const uuidArray = { bsonType: "array", maxItems: 100, items: uuidSchema() };
  return {
    bsonType: "array",
    maxItems: 50,
    uniqueItems: true,
    items: {
      oneOf: [
        propertyValueBranch("text", { bsonType: "string", maxLength: 50_000 }),
        propertyValueBranch("number", { bsonType: ["double", "decimal", "int", "long"] }),
        propertyValueBranch("checkbox", { bsonType: "bool" }),
        propertyValueBranch("select", { bsonType: ["string", "null"], pattern: UUID_PATTERN, maxLength: 36 }),
        propertyValueBranch("multi_select", uuidArray),
        propertyValueBranch("date", dateValueSchema()),
        propertyValueBranch(["url", "email", "phone"], { bsonType: "string", maxLength: 2_000 }),
        propertyValueBranch(["file", "media"], uuidArray),
      ],
    },
  };
}

async function installCanonicalValidators(db: Db): Promise<void> {
  const categoryValidator = await collectionValidator(db, "career_categories");
  const categoryProperties = (categoryValidator["$jsonSchema"] as Document)["properties"] as Document;
  categoryProperties["propertyDefinitions"] = canonicalDefinitionSchema();
  await db.command({ collMod: "career_categories", validator: categoryValidator, validationLevel: "strict", validationAction: "error" });

  const recordValidator = await collectionValidator(db, "career_records");
  const recordProperties = (recordValidator["$jsonSchema"] as Document)["properties"] as Document;
  recordProperties["propertyValues"] = writablePropertyValuesSchema();
  await db.command({ collMod: "career_records", validator: recordValidator, validationLevel: "strict", validationAction: "error" });
}

async function verifyMigration(db: Db): Promise<void> {
  const report = await inspectCareerPropertyMigration(db);
  if (!report.canMigrate) throw new Error(`0011 postflight conflict: ${report.conflicts.map(({ reason }) => reason).join(", ")}`);
  const oldIds = new Set(mappingIndex(report.idMappings).keys());
  for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
    if ([JOURNAL_COLLECTION, "schema_migrations", "migration_locks"].includes(name)) continue;
    for (const document of await db.collection(name).find({}).toArray()) {
      if (containsLegacyId(document, oldIds)) throw new Error(`0011 postflight conflict: ${name}/${String(document["_id"])}에 0009 ID가 남았습니다.`);
    }
  }
}

export async function careerPropertyCanonicalIdentitySteps(): Promise<MongoMigrationStep[]> {
  return [
    { id: "career_property:preflight", async run(db) { await buildPlan(db); } },
    { id: "career_property:journal_and_remap", run: applyPlan },
    { id: "career_property:canonical_validators", run: installCanonicalValidators },
    { id: "career_property:postflight", run: verifyMigration },
  ];
}
