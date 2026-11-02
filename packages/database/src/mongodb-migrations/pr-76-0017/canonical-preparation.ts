import { createHash } from "node:crypto";
import { Decimal128, Long, type Db, type Document, type ClientSession } from "mongodb";
import { CareerBusinessDateValueSchema, CareerBusinessPropertyValueSchema, CareerPropertyDefinitionV2Schema, CareerPropertySchemaSchema, UuidSchema } from "./career-schemas.js";
import type { CareerBusinessPropertyValue, CareerPropertyDefinitionV2 } from "@expresso/contracts";
import type { CareerCategoryDoc } from "../../documents/career.js";
import type { CareerPropertyOptionDoc } from "../../documents/career-property-option.js";
import { canonicalCareerTagOptionId, overlayCareerPropertyOptions } from "./career-property-options.js";
import { canonicalDecimalString, readCanonicalCareerPropertyValues } from "./career-canonical-values.js";
import { projectCanonicalCareerProductProperties } from "./career-product-values.js";

export interface CanonicalPreparationRecord { _id: string; categoryId: string; properties: unknown; propertyValues?: unknown; [key: string]: unknown }
export interface CanonicalPreparationConflict { code: string; categoryId?: string; recordId?: string; propertyKey?: string; migrationVersion?: string }
export type CanonicalStoredCareerValue = Exclude<CareerBusinessPropertyValue, { type: "number" }> | { propertyDefinitionId: string; type: "number"; value: Decimal128 };
export interface CanonicalRecordPreparation { set: { propertyValues?: CanonicalStoredCareerValue[] }; conflicts: CanonicalPreparationConflict[] }
export interface CareerPropertyOptionRegistration { userId: string; categoryId: string; propertyId: string; optionId: string; rawLabel: string; metadata?: Record<string, unknown> }
export interface CanonicalCategoryPreparation { definitions: CareerPropertyDefinitionV2[]; set: { propertySchemaV2?: CareerPropertyDefinitionV2[]; schemaVersion?: number }; conflicts: CanonicalPreparationConflict[]; optionRegistrations: CareerPropertyOptionRegistration[] }
interface PreparationPatch { id: string; expected: Document; set: Document }
export interface CanonicalPreparationInventory { categoryPatches: PreparationPatch[]; recordPatches: PreparationPatch[]; optionPatches: Array<CareerPropertyOptionRegistration & { _id: string }>; conflicts: CanonicalPreparationConflict[]; categoryCount: number; recordCount: number }
export class CanonicalCareerPreparationConflict extends Error {
  constructor(readonly inventory: CanonicalPreparationInventory) { super(`CANONICAL_PREPARATION_CONFLICT: ${inventory.conflicts.map(({ code }) => code).join(", ")}`); }
}

const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const businessTypes = new Set(["text", "number", "checkbox", "select", "multi_select", "date", "url", "email", "phone", "file", "media"]);
const customTimestamp = (definition: CareerPropertyDefinitionV2) => !definition.system && (definition.type === "created_time" || definition.type === "updated_time");

// 0006과 같은 namespace·이름으로 기존 프로퍼티 ID를 재현합니다.
function stableUuid(name: string): string {
  const digest = createHash("sha1").update(Buffer.from("6ba7b8109dad11d180b400c04fd430c8", "hex")).update(name).digest();
  digest[6] = (digest[6]! & 15) | 80; digest[8] = (digest[8]! & 63) | 128;
  const hex = digest.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function stableDefinitionId(categoryId: string, key: string): string { return stableUuid(`${categoryId}:${key}`); }

function safeVersion(raw: unknown): number {
  if (Long.isLong(raw)) {
    const exact = raw.toBigInt();
    if (exact < 1n || exact > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("invalid version");
    return Number(exact);
  }
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 1) throw new Error("invalid version");
  return raw;
}

function configuredOptionLabel(option: Record<string, unknown>): string {
  if ((option.label !== undefined && typeof option.label !== "string") || (option.name !== undefined && typeof option.name !== "string") || (typeof option.label === "string" && typeof option.name === "string" && option.label !== option.name)) throw new Error("INVALID_OPTION_CONFIGURATION");
  const label = option.label ?? option.name;
  if (typeof label !== "string" || label.length > 200) throw new Error("INVALID_OPTION_CONFIGURATION");
  return label;
}
function explicitTagOptions(category: Pick<CareerCategoryDoc, "propertySchema">, definition: CareerPropertyDefinitionV2): Array<{ id?: string; label: string; metadata?: Record<string, unknown> }> {
  const legacy = category.propertySchema[definition.key] as unknown as { config?: { options?: unknown } } | undefined;
  const result: Array<{ id?: string; label: string; metadata?: Record<string, unknown> }> = [];
  for (const source of [definition.config.options, legacy?.config?.options]) {
    if (source === undefined) continue;
    if (!Array.isArray(source)) throw new Error("INVALID_OPTION_CONFIGURATION");
    for (const option of source) {
      if (!object(option) || (own(option, "id") && !UuidSchema.safeParse(option.id).success)) throw new Error("INVALID_OPTION_CONFIGURATION");
      const { id, label: _label, ...metadata } = option;
      const label = configuredOptionLabel(option);
      const match = result.find(entry => entry.label === label || (id !== undefined && entry.id === id));
      if (match && (match.label !== label || match.id !== id)) throw new Error("AMBIGUOUS_OPTION_LABEL");
      if (!match) result.push({ ...(id === undefined ? {} : { id: id as string }), label, ...(Object.keys(metadata).length ? { metadata } : {}) });
    }
  }
  return result;
}

function prepareTagRegistrations(category: Pick<CareerCategoryDoc, "_id" | "userId" | "propertySchema">, definition: CareerPropertyDefinitionV2, records: readonly CanonicalPreparationRecord[], existingOptions: readonly CareerPropertyOptionDoc[]): CareerPropertyOptionRegistration[] {
  const explicit = explicitTagOptions(category, definition);
  const result: CareerPropertyOptionRegistration[] = [];
  const owners = new Set<string>();
  for (const record of records) {
    if (typeof record.userId !== "string" || !UuidSchema.safeParse(record.userId).success) throw new Error("INVALID_RECORD_OPTION_OWNER");
    owners.add(record.userId);
  }
  if (typeof category.userId === "string") owners.add(category.userId);
  for (const userId of owners) {
    const scoped = existingOptions.filter(option => option.userId === userId && option.categoryId === category._id && option.propertyId === definition.id);
    const known = explicit.map(option => ({ ...option, id: option.id ?? scoped.find(prior => prior.rawLabel === option.label)?.optionId ?? canonicalCareerTagOptionId(userId, category._id, definition.id, option.label) }));
    const add = (rawLabel: string, optionId: string, metadata?: Record<string, unknown>) => {
      const prior = scoped.find(option => option.rawLabel === rawLabel || option.optionId === optionId);
      if (prior && (prior.rawLabel !== rawLabel || prior.optionId !== optionId)) throw new Error("OPTION_ID_COLLISION");
      const mapped = known.find(option => option.id === optionId);
      if (mapped && mapped.label !== rawLabel) throw new Error("OPTION_ID_COLLISION");
      const conflict = result.find(option => option.userId === userId && (option.rawLabel === rawLabel || option.optionId === optionId));
      if (conflict && (conflict.rawLabel !== rawLabel || conflict.optionId !== optionId)) throw new Error("OPTION_ID_COLLISION");
      const selectedMetadata = prior?.metadata ?? metadata;
      if (!conflict) result.push({ userId, categoryId: category._id, propertyId: definition.id, optionId, rawLabel, ...(selectedMetadata ? { metadata: selectedMetadata } : {}) });
    };
    for (const option of known) add(option.label, option.id, option.metadata);
    const byId = (optionId: string) => {
      const prior = scoped.find(option => option.optionId === optionId);
      const mapped = known.find(option => option.id === optionId);
      if (prior && mapped && prior.rawLabel !== mapped.label) throw new Error("OPTION_ID_COLLISION");
      if (!prior && !mapped) throw new Error("CANONICAL_TAG_OPTION_LABEL_MISSING");
      add(prior?.rawLabel ?? mapped!.label, optionId, prior?.metadata ?? mapped?.metadata);
    };
    for (const record of records.filter(record => record.userId === userId)) {
      if (own(record, "propertyValues")) {
        const value = readCanonicalCareerPropertyValues(record).find(value => value.propertyDefinitionId === definition.id);
        if (value) {
          if (value.type !== "multi_select") throw new Error("INVALID_CANONICAL_VALUES");
          for (const optionId of value.value) byId(optionId);
        }
        continue;
      }
      if (!object(record.properties) || !own(record.properties, definition.key)) continue;
      const raw = record.properties[definition.key];
      const typed = object(raw) && own(raw, "type");
      if (typed && (raw.type !== "multi_select" || Object.keys(raw).some(key => !["type", "value"].includes(key)))) throw new Error("UNREPRESENTABLE_LEGACY_VALUE");
      const values = typed ? raw.value : raw;
      if (!Array.isArray(values) || values.length > 100 || values.some(value => typeof value !== "string" || value.length > 200)) throw new Error("UNREPRESENTABLE_LEGACY_VALUE");
      for (const value of values as string[]) {
        if (typed) byId(UuidSchema.parse(value));
        else {
          const prior = scoped.find(option => option.rawLabel === value);
          const mapped = known.find(option => option.label === value);
          if (prior && mapped && prior.optionId !== mapped.id) throw new Error("OPTION_ID_COLLISION");
          add(value, prior?.optionId ?? mapped?.id ?? canonicalCareerTagOptionId(userId, category._id, definition.id, value), prior?.metadata ?? mapped?.metadata);
        }
      }
  }
  }
  return result.sort((left, right) => left.userId < right.userId ? -1 : left.userId > right.userId ? 1 : left.rawLabel < right.rawLabel ? -1 : left.rawLabel > right.rawLabel ? 1 : 0);
}
function optionEntries(definition: CareerPropertyDefinitionV2): Array<{ id: string; label: string }> {
  const options = definition.config.options;
  if (!Array.isArray(options)) throw new Error("INVALID_OPTION_CONFIGURATION");
  const entries = options.map(option => {
    if (!object(option) || !UuidSchema.safeParse(option.id).success) throw new Error("INVALID_OPTION_CONFIGURATION");
    return { id: option.id as string, label: configuredOptionLabel(option) };
  });
  if (new Set(entries.map(option => option.id)).size !== entries.length) throw new Error("INVALID_OPTION_CONFIGURATION");
  return entries;
}
export function prepareCanonicalCareerCategory(category: Pick<CareerCategoryDoc, "_id" | "userId" | "isSystem" | "propertySchema" | "propertySchemaV2" | "schemaVersion" | "version">, records: readonly CanonicalPreparationRecord[] = [], existingOptions: readonly CareerPropertyOptionDoc[] = []): CanonicalCategoryPreparation {
  const conflicts: CanonicalPreparationConflict[] = [];
  const set: CanonicalCategoryPreparation["set"] = {};
  let definitions: CareerPropertyDefinitionV2[] = [];
  const optionRegistrations: CareerPropertyOptionRegistration[] = [];
  if ((category.isSystem && category.userId !== null) || (!category.isSystem && !UuidSchema.safeParse(category.userId).success)) conflicts.push({ code: "INVALID_CATEGORY_OWNER_SCOPE", categoryId: category._id });
  for (const record of records) {
    if (record.categoryId !== category._id || (category.userId !== null && record.userId !== category.userId)) conflicts.push({ code: "CATEGORY_RECORD_OWNER_MISMATCH", categoryId: category._id, recordId: record._id });
  }
  try {
    if (own(category, "propertySchemaV2")) {
      if (!Array.isArray(category.propertySchemaV2)) throw new Error("invalid schema");
      definitions = category.propertySchemaV2.map(definition => ({ ...definition, version: safeVersion(definition.version) }));
      CareerPropertyDefinitionV2Schema.array().parse(definitions);
    } else {
      if (!object(category.propertySchema)) throw new Error("invalid legacy schema");
      const withoutConfig = Object.fromEntries(Object.entries(category.propertySchema as unknown as Record<string, unknown>).map(([key, definition]) => {
        if (!object(definition)) throw new Error("invalid legacy definition");
        const { config: _config, ...base } = definition;
        return [key, base];
      }));
      const legacy = CareerPropertySchemaSchema.parse(withoutConfig);
      definitions = Object.entries(legacy).map(([key, definition], order) => {
        const rawConfig = (category.propertySchema[key] as unknown as Record<string, unknown>).config;
        if (rawConfig !== undefined && !object(rawConfig)) throw new Error("invalid legacy configuration");
        const config = rawConfig as Record<string, unknown> | undefined ?? {};
        return { id: definition.id ?? stableDefinitionId(category._id, key), key, name: definition.label, type: definition.type === "boolean" ? "checkbox" : definition.type === "tags" ? "multi_select" : definition.type, required: definition.required, system: definition.system, config: definition.type === "tags" ? { ...config, legacyFreeformTags: true, options: [] } : config, order, version: 1, deletedAt: null };
      });
      CareerPropertyDefinitionV2Schema.array().parse(definitions);
      set.propertySchemaV2 = definitions;
    }
    const ids = new Set<string>(); const keys = new Set<string>();
    for (const definition of definitions) {
      if (ids.has(definition.id) || keys.has(definition.key)) conflicts.push({ code: "DUPLICATE_CANONICAL_DEFINITION", categoryId: category._id, propertyKey: definition.key });
      ids.add(definition.id); keys.add(definition.key);
      const tags = definition.type === "multi_select" && (definition.config.legacyFreeformTags === true || category.propertySchema[definition.key]?.type === "tags");
      if (tags && !conflicts.length && definition.deletedAt === null) {
        try { optionRegistrations.push(...prepareTagRegistrations(category, definition, records, existingOptions)); }
        catch (error) { conflicts.push({ code: error instanceof Error ? error.message : "INVALID_OPTION_CONFIGURATION", categoryId: category._id, propertyKey: definition.key }); }
      } else if (definition.type === "select" || definition.type === "multi_select") {
        try { optionEntries(definition); } catch { conflicts.push({ code: "INVALID_OPTION_CONFIGURATION", categoryId: category._id, propertyKey: definition.key }); }
      }
    }
    if (own(category, "schemaVersion")) safeVersion(category.schemaVersion);
    else set.schemaVersion = safeVersion(category.version);
  } catch { conflicts.push({ code: "INVALID_CANONICAL_SCHEMA", categoryId: category._id }); }
  return { definitions, set: conflicts.length ? {} : set, conflicts, optionRegistrations: conflicts.length ? [] : optionRegistrations };
}
function dateValue(raw: unknown): Extract<CareerBusinessPropertyValue, { type: "date" }>["value"] {
  if (raw instanceof Date) raw = raw.toISOString();
  if (typeof raw === "string") {
    const precision = /^\d{4}-\d{2}$/.test(raw) ? "month" : /^\d{4}-\d{2}-\d{2}$/.test(raw) ? "day" : "datetime";
    return CareerBusinessDateValueSchema.parse({ precision, start: raw, end: null, ...(precision === "datetime" ? { timezone: null } : {}) });
  }
  if (!object(raw)) throw new Error("UNREPRESENTABLE_LEGACY_VALUE");
  if (own(raw, "precision")) return CareerBusinessDateValueSchema.parse(raw);
  if (!own(raw, "start") || !own(raw, "end") || !own(raw, "timezone") || Object.keys(raw).some(key => !["start", "end", "timezone"].includes(key))) throw new Error("UNREPRESENTABLE_LEGACY_VALUE");
  const start = raw.start;
  if (typeof start !== "string") throw new Error("UNREPRESENTABLE_LEGACY_VALUE");
  const precision = /^\d{4}-\d{2}$/.test(start) ? "month" : /^\d{4}-\d{2}-\d{2}$/.test(start) ? "day" : "datetime";
  if (precision !== "datetime" && raw.timezone !== null) throw new Error("UNREPRESENTABLE_LEGACY_VALUE");
  return CareerBusinessDateValueSchema.parse({ precision, start, end: raw.end, ...(precision === "datetime" ? { timezone: raw.timezone } : {}) });
}

function convertLegacyValue(definition: CareerPropertyDefinitionV2, raw: unknown): CanonicalStoredCareerValue {
  let input = raw;
  const typed = object(raw) && own(raw, "type");
  if (typed) {
    if (raw.type !== definition.type || !own(raw, "value") || Object.keys(raw).some(key => !["type", "value"].includes(key))) throw new Error("UNREPRESENTABLE_LEGACY_VALUE");
    input = raw.value;
  }
  const type = customTimestamp(definition) ? "date" : definition.type;
  let value: unknown = input;
  if (type === "number") {
    if (!(input instanceof Decimal128) && !Long.isLong(input) && !(typeof input === "number" && Number.isFinite(input))) throw new Error("UNREPRESENTABLE_LEGACY_VALUE");
    const exact = canonicalDecimalString(String(input));
    const bson = Decimal128.fromString(exact);
    if (canonicalDecimalString(bson.toString()) !== exact) throw new Error("UNREPRESENTABLE_LEGACY_VALUE");
    CareerBusinessPropertyValueSchema.parse({ propertyDefinitionId: definition.id, type, value: exact });
    return { propertyDefinitionId: definition.id, type: "number", value: bson };
  }
  if (type === "date") {
    value = dateValue(input);
    if (customTimestamp(definition) && ((value as { precision: string }).precision !== "datetime" || (value as { end: unknown }).end !== null)) throw new Error("UNREPRESENTABLE_LEGACY_VALUE");
  }
  if (type === "select" || type === "multi_select") {
    const options = optionEntries(definition);
    const optionId = (item: unknown): string => {
      if (typeof item !== "string") throw new Error("UNREPRESENTABLE_LEGACY_VALUE");
      const idMatch = options.find(option => option.id === item);
      if (typed) { if (!idMatch) throw new Error("UNKNOWN_OPTION_VALUE"); return idMatch.id; }
      const labelMatches = options.filter(option => option.label === item);
      if ((idMatch && labelMatches.some(option => option.id !== idMatch.id)) || labelMatches.length > 1) throw new Error("AMBIGUOUS_OPTION_LABEL");
      if (definition.config.legacyFreeformTags !== true && idMatch) return idMatch.id;
      if (labelMatches.length === 1) return labelMatches[0]!.id;
      throw new Error("UNKNOWN_OPTION_VALUE");
    };
    if (type === "select") value = input === null ? null : optionId(input);
    else { if (!Array.isArray(input)) throw new Error("UNREPRESENTABLE_LEGACY_VALUE"); value = input.map(optionId); }
  }
  return CareerBusinessPropertyValueSchema.parse({ propertyDefinitionId: definition.id, type, value }) as CanonicalStoredCareerValue;
}

export function prepareCanonicalCareerRecord(record: CanonicalPreparationRecord, definitions: readonly CareerPropertyDefinitionV2[]): CanonicalRecordPreparation {
  const conflicts: CanonicalPreparationConflict[] = [];
  const binding = { recordId: record._id, categoryId: record.categoryId };
  try { CareerPropertyDefinitionV2Schema.array().parse(definitions); projectCanonicalCareerProductProperties(definitions, []); }
  catch { return { set: {}, conflicts: [{ code: "INVALID_CANONICAL_SCHEMA", ...binding }] }; }
  if (own(record, "propertyValues")) {
    try { projectCanonicalCareerProductProperties(definitions, readCanonicalCareerPropertyValues(record)); }
    catch { conflicts.push({ code: "INVALID_CANONICAL_VALUES", ...binding }); }
    return { set: {}, conflicts };
  }
  if (!object(record.properties)) return { set: {}, conflicts: [{ code: "INVALID_LEGACY_PROPERTIES", ...binding }] };
  const byKey = new Map(definitions.map(definition => [definition.key, definition]));
  const values: CanonicalStoredCareerValue[] = [];
  for (const [key, raw] of Object.entries(record.properties)) {
    const definition = byKey.get(key);
    if (!definition || definition.deletedAt !== null) { conflicts.push({ code: "UNKNOWN_LEGACY_PROPERTY", ...binding, propertyKey: key }); continue; }
    // 관계·계산·title·시스템 시각은 별도 소유자가 읽고 저장합니다.
    if (!businessTypes.has(definition.type) && !customTimestamp(definition)) continue;
    try { values.push(convertLegacyValue(definition, raw)); }
    catch (error) {
      const reason = error instanceof Error && ["INVALID_OPTION_CONFIGURATION", "AMBIGUOUS_OPTION_LABEL", "UNKNOWN_OPTION_VALUE"].includes(error.message) ? error.message : "UNREPRESENTABLE_LEGACY_VALUE";
      conflicts.push({ code: reason, ...binding, propertyKey: key });
    }
  }
  if (values.length > 50) conflicts.push({ code: "CANONICAL_VALUE_LIMIT_EXCEEDED", ...binding });
  return { set: conflicts.length ? {} : { propertyValues: values }, conflicts };
}

const expectedField = (row: Document, field: string): Document => ({ [field]: own(row, field) ? row[field] : { $exists: false } });
async function loadInventory(db: Db, session?: ClientSession): Promise<CanonicalPreparationInventory> {
  const options = { ...(session ? { session } : {}), promoteLongs: false };
  const categories = await db.collection<Document & { _id: string }>("career_categories").find({}, options).toArray();
  const records = await db.collection<CanonicalPreparationRecord>("career_records").find({}, options).toArray();
  const ledger = await db.collection<CareerPropertyOptionDoc>("career_property_options").find({}, options).toArray();
  const inventory: CanonicalPreparationInventory = { categoryPatches: [], recordPatches: [], optionPatches: [], conflicts: [], categoryCount: categories.length, recordCount: records.length };
  const { loadMongoMigrations } = await import("../../mongo-migrations.js");
  const knownHistory = new Set((await loadMongoMigrations()).map(migration => migration.version));
  for (const history of await db.collection("schema_migrations").find({}, options).toArray()) if (!knownHistory.has(String(history._id))) inventory.conflicts.push({ code: "UNKNOWN_MIGRATION_HISTORY", migrationVersion: String(history._id) });
  const preparedCategories = new Map<string, CanonicalCategoryPreparation>();
  const plannedOptions: CareerPropertyOptionDoc[] = [...ledger];
  const activeUsers = new Set((await db.collection<{ _id: string }>("users").find({ deletionRequestedAt: null }, options).toArray()).map(user => user._id));
  for (const row of categories) {
    const prepared = prepareCanonicalCareerCategory(row as unknown as CareerCategoryDoc, records.filter(record => record.categoryId === row._id), ledger);
    preparedCategories.set(row._id, prepared); inventory.conflicts.push(...prepared.conflicts);
    if (Object.keys(prepared.set).length) inventory.categoryPatches.push({ id: row._id, set: prepared.set, expected: { ...expectedField(row, "version"), ...expectedField(row, "propertySchema"), ...expectedField(row, "propertySchemaV2"), ...expectedField(row, "schemaVersion"), ...expectedField(row, "userId"), ...expectedField(row, "isSystem") } });
    for (const seed of prepared.optionRegistrations) {
      if (!activeUsers.has(seed.userId)) { inventory.conflicts.push({ code: "OPTION_USER_NOT_ACTIVE", categoryId: seed.categoryId }); continue; }
      const byLabel = plannedOptions.find(option => option.userId === seed.userId && option.categoryId === seed.categoryId && option.propertyId === seed.propertyId && option.rawLabel === seed.rawLabel);
      const byId = plannedOptions.find(option => option.userId === seed.userId && option.categoryId === seed.categoryId && option.propertyId === seed.propertyId && option.optionId === seed.optionId);
      if ((byLabel && byLabel.optionId !== seed.optionId) || (byId && byId.rawLabel !== seed.rawLabel)) { inventory.conflicts.push({ code: "OPTION_ID_COLLISION", categoryId: seed.categoryId }); continue; }
      if (byLabel) continue;
      const _id = canonicalCareerTagOptionId(seed.userId, seed.categoryId, seed.propertyId, seed.rawLabel);
      inventory.optionPatches.push({ _id, ...seed });
      plannedOptions.push({ _id, ...seed, version: 1, createdAt: new Date(0) });
    }
  }
  for (const row of records) {
    const category = preparedCategories.get(row.categoryId);
    if (!category) { inventory.conflicts.push({ code: "CATEGORY_NOT_FOUND", categoryId: row.categoryId, recordId: row._id }); continue; }
    if (category.conflicts.length) continue;
    if (typeof row.userId !== "string") { inventory.conflicts.push({ code: "INVALID_RECORD_OPTION_OWNER", categoryId: row.categoryId, recordId: row._id }); continue; }
    let definitions = category.definitions;
    try { definitions = overlayCareerPropertyOptions(definitions, plannedOptions.filter(option => option.userId === row.userId && option.categoryId === row.categoryId), { userId: row.userId, categoryId: row.categoryId }); }
    catch { inventory.conflicts.push({ code: "OPTION_ID_COLLISION", categoryId: row.categoryId, recordId: row._id }); continue; }
    const prepared = prepareCanonicalCareerRecord(row, definitions); inventory.conflicts.push(...prepared.conflicts);
    if (Object.keys(prepared.set).length) inventory.recordPatches.push({ id: row._id, set: prepared.set, expected: { ...expectedField(row, "version"), ...expectedField(row, "categoryId"), ...expectedField(row, "userId"), ...expectedField(row, "properties"), propertyValues: { $exists: false } } });
  }
  return inventory;
}

/** 조회만으로 전체 변환 계획과 모호한 데이터 충돌을 반환합니다. */
export async function inventoryCanonicalCareerPreparation(db: Db): Promise<CanonicalPreparationInventory> { return loadInventory(db); }

/** 모든 충돌을 먼저 확인한 transaction에서 누락된 데이터만 CAS로 추가합니다. */
export async function applyCanonicalCareerPreparation(db: Db): Promise<CanonicalPreparationInventory> {
  const result = await db.client.withSession(async session => session.withTransaction(async () => {
    const inventory = await loadInventory(db, session);
    if (inventory.conflicts.length) throw new CanonicalCareerPreparationConflict(inventory);
    for (const seed of inventory.optionPatches) {
      const inserted = await db.collection<CareerPropertyOptionDoc>("career_property_options").findOneAndUpdate({ userId: seed.userId, categoryId: seed.categoryId, propertyId: seed.propertyId, rawLabel: seed.rawLabel, version: { $exists: false } }, { $setOnInsert: { ...seed, version: 1, createdAt: new Date() } }, { upsert: true, returnDocument: "after", session, collation: { locale: "simple" } });
      if (!inserted || inserted.optionId !== seed.optionId) throw new Error("CANONICAL_PREPARATION_SOURCE_CHANGED");
    }
    for (const [collection, patches] of [["career_categories", inventory.categoryPatches], ["career_records", inventory.recordPatches]] as const) for (const patch of patches) {
      const changed = await db.collection<Document & { _id: string }>(collection).updateOne({ _id: patch.id, ...patch.expected }, { $set: patch.set }, { session });
      if (changed.matchedCount !== 1) throw new Error("CANONICAL_PREPARATION_SOURCE_CHANGED");
    }
    return inventory;
  }));
  if (!result) throw new Error("CANONICAL_PREPARATION_TRANSACTION_ABORTED");
  return result;
}