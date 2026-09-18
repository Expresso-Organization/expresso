import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { Collection, Document } from "mongodb";

import { legacy0009PropertyDefinitionId, officialPropertyDefinitionId } from "./canonical-mapping.js";

export type CareerPropertyMigrationConflictReason =
  | "duplicate_property_key"
  | "duplicate_property_id"
  | "missing_official_property_id"
  | "official_property_id_mismatch"
  | "unexpected_0009_definition"
  | "unsupported_property_definition_type"
  | "title_definition_requires_root_field_cutover"
  | "property_value_type_mismatch"
  | "canonical_property_value_conflict"
  | "unknown_legacy_property_key"
  | "legacy_text_too_long"
  | "whitespace_only_tag"
  | "nonstandard_legacy_date"
  | "nonstandard_legacy_number"
  | "unsupported_bson_value"
  | "orphan_property_reference"
  | "ambiguous_property_reference";

export interface CareerPropertyMigrationConflict {
  reason: CareerPropertyMigrationConflictReason;
  message: string;
  count: number;
  locations: string[];
}

export interface PropertyIdMapping {
  categoryId: string;
  key: string;
  officialId: string;
  legacy0009Id: string | null;
  source: "propertySchemaV2" | "propertySchema" | "computed_0006";
}

export interface LegacyValueDistribution {
  byType: Record<string, number>;
  textOver5000: number;
  textOver50000: number;
  whitespaceOnlyTags: number;
  exactTagDigests: Record<string, number>;
  legacyMonthDates: number;
  nonstandardDates: number;
  nonstandardNumbers: number;
  unsupportedValues: number;
  unknownLegacyKeys: number;
}

export interface CareerPropertyPreflightReport {
  summary: {
    categories: number;
    systemCategories: number;
    customCategories: number;
    records: number;
    references: number;
  };
  idMappings: PropertyIdMapping[];
  conflicts: CareerPropertyMigrationConflict[];
  distributions: LegacyValueDistribution;
  canMigrate: boolean;
}

export interface CareerPropertyReferenceLocation {
  collection: "career_categories" | "career_records" | "career_views" | "career_record_relations" | "career_ai_proposals" | "outbox_events";
  path: string;
  owner: "category" | "record" | "source_record" | "target_record" | "target_category" | "ambiguous";
}

export interface CareerPropertyInventoryDb {
  collection<T extends Document = Document>(name: string): Pick<Collection<T>, "find">;
}

/** 0011 migration도 이 목록을 사용해 scan/rewrite 범위를 동일하게 유지합니다. */
export const careerPropertyReferenceLocations = [
  { collection: "career_categories", path: "propertySchemaV2[].config", owner: "category" },
  { collection: "career_categories", path: "propertySchemaTombstones[].id", owner: "category" },
  { collection: "career_categories", path: "propertySchemaTombstones[].config", owner: "category" },
  { collection: "career_categories", path: "propertyMutationResults", owner: "category" },
  { collection: "career_records", path: "propertyValues[].propertyDefinitionId", owner: "record" },
  { collection: "career_records", path: "propertyValueTombstones.$keys", owner: "record" },
  { collection: "career_records", path: "unmappedProperties.$keys", owner: "ambiguous" },
  { collection: "career_views", path: "configuration", owner: "category" },
  { collection: "career_record_relations", path: "sourcePropertyId", owner: "source_record" },
  { collection: "career_record_relations", path: "inversePropertyId", owner: "target_record" },
  { collection: "career_ai_proposals", path: "propertyChanges[].propertyId", owner: "record" },
  { collection: "outbox_events", path: "payload.changedPropertyIds[]", owner: "record" },
  { collection: "outbox_events", path: "payload.sourcePropertyVersions.$keys", owner: "record" },
  { collection: "outbox_events", path: "payload.propertyId", owner: "category" },
] as const satisfies readonly CareerPropertyReferenceLocation[];

interface DefinitionState {
  key: string;
  officialId: string;
  legacy0009Id: string | null;
  type: string;
}

interface CategoryState {
  id: string;
  definitionsByKey: Map<string, DefinitionState>;
  knownIds: Set<string>;
}

interface Reference {
  id: string;
  categoryId: string | null;
  location: string;
  ambiguous?: boolean;
}

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const LEGACY_TYPES = new Set(["text", "number", "date", "tags", "boolean"]);
const CONFLICT_MESSAGES: Record<CareerPropertyMigrationConflictReason, string> = {
  duplicate_property_key: "같은 Category에서 Property key가 중복됩니다.",
  duplicate_property_id: "하나의 PropertyDefinition ID가 서로 다른 Property에 사용됩니다.",
  missing_official_property_id: "legacy Property에 migration 0006 공식 ID가 없습니다.",
  official_property_id_mismatch: "propertySchema와 propertySchemaV2의 공식 ID 계보가 일치하지 않습니다.",
  unexpected_0009_definition: "propertyDefinitions가 예상한 0009 ID 또는 shape가 아닙니다.",
  unsupported_property_definition_type: "지원하거나 해석할 수 없는 PropertyDefinition type입니다.",
  title_definition_requires_root_field_cutover: "title Definition 참조를 CareerRecord root field 참조로 전환할 정책이 필요합니다.",
  property_value_type_mismatch: "PropertyValue type이 연결된 Definition type과 일치하지 않습니다.",
  canonical_property_value_conflict: "같은 공식 Definition으로 합쳐질 canonical 값들이 서로 다릅니다.",
  unknown_legacy_property_key: "legacy properties key에 대응하는 Definition을 찾을 수 없습니다.",
  legacy_text_too_long: "legacy text가 canonical 50,000자 제한을 초과합니다.",
  whitespace_only_tag: "공백으로만 이루어진 legacy tag는 canonical option name으로 만들 수 없습니다.",
  nonstandard_legacy_date: "legacy date가 지원하는 YYYY-MM 형식이 아닙니다.",
  nonstandard_legacy_number: "legacy number가 유한한 지원 BSON numeric 값이 아닙니다.",
  unsupported_bson_value: "legacy 또는 canonical 값에 지원하지 않는 BSON shape가 있습니다.",
  orphan_property_reference: "참조한 PropertyDefinition을 소유 Category에서 찾을 수 없습니다.",
  ambiguous_property_reference: "PropertyDefinition 참조가 속한 Category를 하나로 결정할 수 없습니다.",
};

function isObject(value: unknown): value is Document {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function documentId(document: Document): string {
  return typeof document["_id"] === "string" ? document["_id"] : "unknown";
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
}

function valuesAt(value: unknown, key: string, output: string[] = []): string[] {
  if (Array.isArray(value)) for (const item of value) valuesAt(item, key, output);
  else if (isObject(value)) for (const [childKey, child] of Object.entries(value)) {
    if (childKey === key && typeof child === "string" && UUID.test(child)) output.push(child);
    valuesAt(child, key, output);
  }
  return output;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && UUID.test(item)) : [];
}

function keyReferences(value: unknown): string[] {
  return isObject(value) ? Object.keys(value).filter((key) => UUID.test(key)) : [];
}

function unwrapLegacyValue(value: unknown): { declaredType?: string; value: unknown } {
  if (isObject(value) && typeof value["type"] === "string" && Object.hasOwn(value, "value")) {
    return { declaredType: value["type"], value: value["value"] };
  }
  return { value };
}

function isSupportedNumber(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (!isObject(value) || typeof value["_bsontype"] !== "string") return false;
  if (value["_bsontype"] === "Int32" || value["_bsontype"] === "Long") return true;
  if (value["_bsontype"] === "Double") return typeof value["value"] === "number" && Number.isFinite(value["value"]);
  if (value["_bsontype"] === "Decimal128" && typeof value["toString"] === "function") {
    return !["NaN", "Infinity", "-Infinity"].includes(String(value["toString"]()));
  }
  return false;
}

function isSupportedTypedDate(value: unknown): boolean {
  if (!isObject(value) || typeof value["start"] !== "string") return false;
  const start = value["start"];
  const end = value["end"];
  const timezone = value["timezone"];
  if (end !== null && end !== undefined && typeof end !== "string") return false;
  if (timezone !== null && timezone !== undefined && typeof timezone !== "string") return false;
  const day = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
  const datetime = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
  if (day.test(start)) return end === null || end === undefined || day.test(end);
  if (datetime.test(start)) return end === null || end === undefined || datetime.test(end);
  return false;
}

class ConflictCollector {
  readonly entries = new Map<CareerPropertyMigrationConflictReason, { count: number; locations: Set<string> }>();

  add(reason: CareerPropertyMigrationConflictReason, location: string): void {
    const entry = this.entries.get(reason) ?? { count: 0, locations: new Set<string>() };
    entry.count += 1;
    if (entry.locations.size < 20) entry.locations.add(location);
    this.entries.set(reason, entry);
  }

  report(): CareerPropertyMigrationConflict[] {
    return [...this.entries.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([reason, entry]) => ({
      reason,
      message: CONFLICT_MESSAGES[reason],
      count: entry.count,
      locations: [...entry.locations].sort(),
    }));
  }
}

function addLegacyValueDistribution(
  distribution: LegacyValueDistribution,
  conflicts: ConflictCollector,
  definition: DefinitionState,
  rawValue: unknown,
  location: string,
): void {
  const unwrapped = unwrapLegacyValue(rawValue);
  distribution.byType[definition.type] = (distribution.byType[definition.type] ?? 0) + 1;
  const expectedType = definition.type === "tags" ? "multi_select" : definition.type === "boolean" ? "checkbox" : definition.type;
  if (unwrapped.declaredType !== undefined && unwrapped.declaredType !== definition.type && unwrapped.declaredType !== expectedType) {
    conflicts.add("property_value_type_mismatch", location);
  }
  const value = unwrapped.value;
  if (definition.type === "text") {
    if (typeof value !== "string") { distribution.unsupportedValues += 1; conflicts.add("unsupported_bson_value", location); return; }
    const length = [...value].length;
    if (length > 5_000) distribution.textOver5000 += 1;
    if (length > 50_000) { distribution.textOver50000 += 1; conflicts.add("legacy_text_too_long", location); }
    return;
  }
  if (definition.type === "tags" || definition.type === "multi_select") {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) { distribution.unsupportedValues += 1; conflicts.add("unsupported_bson_value", location); return; }
    for (const tag of value as string[]) {
      distribution.exactTagDigests[digest(tag)] = (distribution.exactTagDigests[digest(tag)] ?? 0) + 1;
      if (tag.trim().length === 0) { distribution.whitespaceOnlyTags += 1; conflicts.add("whitespace_only_tag", location); }
    }
    return;
  }
  if (definition.type === "date") {
    if (typeof value === "string" && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(value)) { distribution.legacyMonthDates += 1; return; }
    if (isSupportedTypedDate(value)) return;
    distribution.nonstandardDates += 1; conflicts.add("nonstandard_legacy_date", location); return;
  }
  if (definition.type === "number") {
    if (!isSupportedNumber(value)) { distribution.nonstandardNumbers += 1; conflicts.add("nonstandard_legacy_number", location); }
    return;
  }
  if ((definition.type === "boolean" || definition.type === "checkbox") && typeof value !== "boolean") {
    distribution.unsupportedValues += 1; conflicts.add("unsupported_bson_value", location);
  }
}

function canonicalType(legacyType: string): string {
  return legacyType === "tags" ? "multi_select" : legacyType === "boolean" ? "checkbox" : legacyType;
}

function processCategory(
  category: Document,
  conflicts: ConflictCollector,
  mappings: PropertyIdMapping[],
): CategoryState {
  const categoryId = documentId(category);
  const byKey = new Map<string, DefinitionState>();
  const seenIds = new Map<string, string>();
  const legacySchema = isObject(category["propertySchema"]) ? category["propertySchema"] : {};
  const v2Definitions = [category["propertySchemaV2"], category["propertySchemaTombstones"]]
    .flatMap((value) => Array.isArray(value) ? value as Document[] : []);
  const legacy0009Definitions = Array.isArray(category["propertyDefinitions"]) ? category["propertyDefinitions"] as Document[] : [];

  const v2ByKey = new Map<string, Document>();
  for (const definition of v2Definitions) {
    const key = definition["key"];
    const id = definition["id"];
    if (typeof key !== "string" || typeof id !== "string") { conflicts.add("unsupported_property_definition_type", `career_categories/${categoryId}/propertySchemaV2`); continue; }
    if (definition["type"] === "title") { conflicts.add("title_definition_requires_root_field_cutover", `career_categories/${categoryId}/propertySchemaV2/${key}`); continue; }
    if (v2ByKey.has(key)) conflicts.add("duplicate_property_key", `career_categories/${categoryId}/propertySchemaV2/${key}`);
    v2ByKey.set(key, definition);
  }

  const sourceByKey = new Map<string, string>();
  for (const definition of legacy0009Definitions) {
    const key = definition["key"];
    const id = definition["id"];
    if (typeof key !== "string" || typeof id !== "string") { conflicts.add("unexpected_0009_definition", `career_categories/${categoryId}/propertyDefinitions`); continue; }
    if (sourceByKey.has(key)) conflicts.add("duplicate_property_key", `career_categories/${categoryId}/propertyDefinitions/${key}`);
    const expected = legacy0009PropertyDefinitionId(categoryId, key);
    const storedOfficialId = isObject(legacySchema[key]) ? legacySchema[key]["id"] : undefined;
    if (id !== expected && id !== storedOfficialId && !v2Definitions.some((item) => item["id"] === id && item["key"] === key)) {
      conflicts.add("unexpected_0009_definition", `career_categories/${categoryId}/propertyDefinitions/${key}`);
    }
    sourceByKey.set(key, id);
  }

  const keys = new Set([...Object.keys(legacySchema), ...v2ByKey.keys(), ...sourceByKey.keys()]);
  for (const key of [...keys].sort()) {
    const legacy = isObject(legacySchema[key]) ? legacySchema[key] : undefined;
    const v2 = v2ByKey.get(key);
    const storedLegacyId = typeof legacy?.["id"] === "string" ? legacy["id"] : undefined;
    const v2Id = typeof v2?.["id"] === "string" ? v2["id"] : undefined;
    const computedId = officialPropertyDefinitionId(categoryId, key);
    const officialId = v2Id ?? storedLegacyId ?? computedId;
    const source = v2Id ? "propertySchemaV2" : storedLegacyId ? "propertySchema" : "computed_0006";
    if (legacy && !storedLegacyId) conflicts.add("missing_official_property_id", `career_categories/${categoryId}/propertySchema/${key}`);
    if (storedLegacyId && v2Id && storedLegacyId !== v2Id) conflicts.add("official_property_id_mismatch", `career_categories/${categoryId}/${key}`);
    const previousKey = seenIds.get(officialId);
    if (previousKey && previousKey !== key) conflicts.add("duplicate_property_id", `career_categories/${categoryId}/${officialId}`);
    seenIds.set(officialId, key);
    const type = typeof v2?.["type"] === "string" ? v2["type"] : typeof legacy?.["type"] === "string" ? legacy["type"] : "unknown";
    if (!LEGACY_TYPES.has(type) && !v2) conflicts.add("unsupported_property_definition_type", `career_categories/${categoryId}/${key}`);
    const storedDefinitionId = sourceByKey.get(key);
    const expectedLegacy0009Id = legacy0009PropertyDefinitionId(categoryId, key);
    const legacy0009Id = category["isSystem"] === true || storedDefinitionId === expectedLegacy0009Id
      ? expectedLegacy0009Id
      : null;
    const state = { key, officialId, legacy0009Id, type };
    byKey.set(key, state);
    mappings.push({ categoryId, key, officialId, legacy0009Id: state.legacy0009Id, source });
  }
  return { id: categoryId, definitionsByKey: byKey, knownIds: new Set([...byKey.values()].flatMap((definition) => [definition.officialId, ...(definition.legacy0009Id ? [definition.legacy0009Id] : [])])) };
}

function viewReferences(document: Document, categoryId: string | null): Reference[] {
  const id = documentId(document);
  const configuration = document["configuration"];
  if (!isObject(configuration)) return [];
  const refs = valuesAt(configuration["filter"], "propertyId");
  refs.push(...valuesAt(configuration["sorts"], "propertyId"));
  for (const field of ["groupPropertyId", "startPropertyId", "endPropertyId", "coverPropertyId"] as const) refs.push(...valuesAt(configuration, field));
  for (const field of ["visiblePropertyIds", "propertyOrder", "previewPropertyIds"] as const) refs.push(...valuesAt(configuration, field));
  refs.push(...keyReferences(configuration["columnWidths"]));
  return refs.map((propertyId) => ({ id: propertyId, categoryId, location: `career_views/${id}/configuration` }));
}

function categoryConfigReferences(category: Document): Reference[] {
  const categoryId = documentId(category);
  const references: Reference[] = [];
  const definitions = [category["propertySchemaV2"], category["propertySchemaTombstones"]].flatMap((value) => Array.isArray(value) ? value : []);
  const definitionsById = new Map((definitions as Document[]).flatMap((definition) => typeof definition["id"] === "string" ? [[definition["id"], definition] as const] : []));
  for (const definition of definitions as Document[]) {
    const config = definition["config"];
    if (!isObject(config)) continue;
    for (const propertyId of valuesAt(config["ast"], "propertyId")) references.push({ id: propertyId, categoryId, location: `career_categories/${categoryId}/formulaAst` });
    if (typeof config["relationPropertyId"] === "string") references.push({ id: config["relationPropertyId"], categoryId, location: `career_categories/${categoryId}/rollup/relationPropertyId` });
    const relationDefinition = typeof config["relationPropertyId"] === "string" ? definitionsById.get(config["relationPropertyId"]) : undefined;
    const relationConfig = isObject(relationDefinition?.["config"]) ? relationDefinition["config"] : undefined;
    const targetCategoryId = typeof config["targetCategoryId"] === "string"
      ? config["targetCategoryId"]
      : typeof relationConfig?.["targetCategoryId"] === "string" ? relationConfig["targetCategoryId"] : null;
    if (typeof config["inversePropertyId"] === "string") references.push({ id: config["inversePropertyId"], categoryId: targetCategoryId, location: `career_categories/${categoryId}/relation/inversePropertyId`, ...(targetCategoryId ? {} : { ambiguous: true }) });
    if (typeof config["targetPropertyId"] === "string") references.push({ id: config["targetPropertyId"], categoryId: targetCategoryId, location: `career_categories/${categoryId}/rollup/targetPropertyId`, ...(targetCategoryId ? {} : { ambiguous: true }) });
  }
  for (const propertyId of valuesAt(category["propertyMutationResults"], "propertyId")) references.push({ id: propertyId, categoryId, location: `career_categories/${categoryId}/propertyMutationResults` });
  return references;
}

/** MongoDB에는 find만 수행하며 원문 값은 report에 포함하지 않습니다. */
export async function inspectCareerPropertyMigration(db: CareerPropertyInventoryDb): Promise<CareerPropertyPreflightReport> {
  const conflicts = new ConflictCollector();
  const mappings: PropertyIdMapping[] = [];
  const distribution: LegacyValueDistribution = { byType: {}, textOver5000: 0, textOver50000: 0, whitespaceOnlyTags: 0, exactTagDigests: {}, legacyMonthDates: 0, nonstandardDates: 0, nonstandardNumbers: 0, unsupportedValues: 0, unknownLegacyKeys: 0 };
  const categories: Document[] = [];
  for await (const category of db.collection<Document>("career_categories").find({}).batchSize(100)) categories.push(category);
  const categoryStates = new Map(categories.map((category) => {
    const state = processCategory(category, conflicts, mappings);
    return [state.id, state] as const;
  }));
  const globallySeenIds = new Map<string, string>();
  for (const mapping of mappings) {
    for (const propertyId of [mapping.officialId, ...(mapping.legacy0009Id ? [mapping.legacy0009Id] : [])]) {
      const owner = `${mapping.categoryId}:${mapping.key}`;
      const previous = globallySeenIds.get(propertyId);
      if (previous && previous !== owner) conflicts.add("duplicate_property_id", `career_categories/${owner}/${propertyId}`);
      globallySeenIds.set(propertyId, owner);
    }
  }
  const recordCategories = new Map<string, string | null>();
  let referenceCount = 0;
  const inspectReferences = (references: readonly Reference[]): void => {
    for (const reference of references) {
      referenceCount += 1;
      if (reference.ambiguous || !reference.categoryId) { conflicts.add("ambiguous_property_reference", reference.location); continue; }
      if (!categoryStates.get(reference.categoryId)?.knownIds.has(reference.id)) conflicts.add("orphan_property_reference", reference.location);
    }
  };
  for (const category of categories) inspectReferences(categoryConfigReferences(category));

  let recordCount = 0;
  for await (const record of db.collection<Document>("career_records").find({}).batchSize(100)) {
    recordCount += 1;
    const recordId = documentId(record);
    const categoryId = typeof record["categoryId"] === "string" ? record["categoryId"] : null;
    recordCategories.set(recordId, categoryId);
    const category = categoryId ? categoryStates.get(categoryId) : undefined;
    const properties = isObject(record["properties"]) ? record["properties"] : {};
    for (const [key, value] of Object.entries(properties)) {
      const definition = category?.definitionsByKey.get(key);
      const location = `career_records/${recordId}/properties/${key}`;
      if (!definition) { distribution.unknownLegacyKeys += 1; conflicts.add("unknown_legacy_property_key", location); continue; }
      addLegacyValueDistribution(distribution, conflicts, definition, value, location);
    }
    const canonicalValues = Array.isArray(record["propertyValues"]) ? record["propertyValues"] as Document[] : [];
    const targetValues = new Map<string, Document>();
    for (const [index, value] of canonicalValues.entries()) {
      const propertyDefinitionId = value["propertyDefinitionId"];
      if (typeof propertyDefinitionId !== "string") { conflicts.add("unsupported_bson_value", `career_records/${recordId}/propertyValues/${index}`); continue; }
      inspectReferences([{ id: propertyDefinitionId, categoryId, location: `career_records/${recordId}/propertyValues/${index}` }]);
      const definition = category && [...category.definitionsByKey.values()].find((item) => item.officialId === propertyDefinitionId || item.legacy0009Id === propertyDefinitionId);
      if (definition && typeof value["type"] === "string" && value["type"] !== canonicalType(definition.type)) conflicts.add("property_value_type_mismatch", `career_records/${recordId}/propertyValues/${index}`);
      if (definition) {
        const normalized = { ...value, propertyDefinitionId: definition.officialId };
        const previous = targetValues.get(definition.officialId);
        if (previous !== undefined && !isDeepStrictEqual(previous, normalized)) conflicts.add("canonical_property_value_conflict", `career_records/${recordId}/propertyValues/${definition.officialId}`);
        targetValues.set(definition.officialId, normalized);
      }
    }
    inspectReferences(keyReferences(record["propertyValueTombstones"]).map((propertyId) => ({ id: propertyId, categoryId, location: `career_records/${recordId}/propertyValueTombstones` })));
    inspectReferences(keyReferences(record["unmappedProperties"]).map((propertyId) => ({ id: propertyId, categoryId: null, location: `career_records/${recordId}/unmappedProperties`, ambiguous: true })));
  }

  for await (const view of db.collection<Document>("career_views").find({}).batchSize(100)) inspectReferences(viewReferences(view, typeof view["categoryId"] === "string" ? view["categoryId"] : isObject(view["configuration"]) && typeof view["configuration"]["categoryId"] === "string" ? view["configuration"]["categoryId"] : null));
  for await (const relation of db.collection<Document>("career_record_relations").find({}).batchSize(100)) {
    const id = documentId(relation);
    const sourceCategory = typeof relation["sourceRecordId"] === "string" ? recordCategories.get(relation["sourceRecordId"]) ?? null : null;
    const targetCategory = typeof relation["targetRecordId"] === "string" ? recordCategories.get(relation["targetRecordId"]) ?? null : null;
    if (typeof relation["sourcePropertyId"] === "string") inspectReferences([{ id: relation["sourcePropertyId"], categoryId: sourceCategory, location: `career_record_relations/${id}/sourcePropertyId`, ...(sourceCategory ? {} : { ambiguous: true }) }]);
    if (typeof relation["inversePropertyId"] === "string") inspectReferences([{ id: relation["inversePropertyId"], categoryId: targetCategory, location: `career_record_relations/${id}/inversePropertyId`, ...(targetCategory ? {} : { ambiguous: true }) }]);
  }
  for await (const proposal of db.collection<Document>("career_ai_proposals").find({}).batchSize(100)) {
    const categoryId = typeof proposal["recordId"] === "string" ? recordCategories.get(proposal["recordId"]) ?? null : null;
    inspectReferences(valuesAt(proposal["propertyChanges"], "propertyId").map((propertyId) => ({ id: propertyId, categoryId, location: `career_ai_proposals/${documentId(proposal)}/propertyChanges`, ...(categoryId ? {} : { ambiguous: true }) })));
  }
  for await (const event of db.collection<Document>("outbox_events").find({ topic: /^career\./ }).batchSize(100)) {
    const payload = isObject(event["payload"]) ? event["payload"] : {};
    const categoryId = typeof payload["categoryId"] === "string"
      ? payload["categoryId"]
      : typeof payload["recordId"] === "string" ? recordCategories.get(payload["recordId"]) ?? null : null;
    const propertyIds = [...stringArray(payload["changedPropertyIds"]), ...keyReferences(payload["sourcePropertyVersions"]), ...valuesAt(payload, "propertyId")];
    inspectReferences(propertyIds.map((propertyId) => ({ id: propertyId, categoryId, location: `outbox_events/${documentId(event)}/payload`, ...(categoryId ? {} : { ambiguous: true }) })));
  }
  const conflictReport = conflicts.report();
  return {
    summary: { categories: categories.length, systemCategories: categories.filter((category) => category["isSystem"] === true).length, customCategories: categories.filter((category) => category["isSystem"] !== true).length, records: recordCount, references: referenceCount },
    idMappings: mappings.sort((left, right) => left.categoryId.localeCompare(right.categoryId) || left.key.localeCompare(right.key)),
    conflicts: conflictReport,
    distributions: distribution,
    canMigrate: conflictReport.length === 0,
  };
}
