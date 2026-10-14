import { createHash } from "node:crypto";
import { type ClientSession, type Db } from "mongodb";
import { UuidSchema, type CareerPropertyDefinitionV2 } from "@expresso/contracts";
import type { CareerCategoryDoc } from "./documents/career.js";
import type { CareerPropertyOptionDoc } from "./documents/career-property-option.js";

export interface CareerPropertyOptionScope { userId: string; categoryId: string; propertyId: string }
export interface CareerCategoryPropertyOptionScope { userId: string; categoryId: string }
export interface RegisterCareerPropertyOptionInput { optionId?: string; expectedVersion?: number }
const binary = { locale: "simple" } as const;

/** 원본 label을 정규화하지 않고 사용자·카테고리·프로퍼티 범위에 묶습니다. */
export function canonicalCareerTagOptionId(userId: string, categoryId: string, propertyId: string, rawLabel: string): string {
  UuidSchema.parse(userId); UuidSchema.parse(categoryId); UuidSchema.parse(propertyId);
  assertLabel(rawLabel);
  const hash = createHash("sha1").update(Buffer.from("6ba7b8109dad11d180b400c04fd430c8", "hex")).update(`${userId}:${categoryId}:${propertyId}:tag:${rawLabel}`).digest();
  hash[6] = (hash[6]! & 15) | 80; hash[8] = (hash[8]! & 63) | 128;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function assertLabel(label: string): void {
  if (typeof label !== "string" || label.length > 200) throw new Error("CAREER_OPTION_INVALID_LABEL");
}
function optionRawLabel(option: Record<string, unknown>): string {
  if ((option.label !== undefined && typeof option.label !== "string") || (option.name !== undefined && typeof option.name !== "string") || (typeof option.label === "string" && typeof option.name === "string" && option.label !== option.name)) throw new Error("CAREER_OPTION_MAPPING_CONFLICT");
  const label = option.label ?? option.name;
  if (typeof label !== "string" || label.length > 200) throw new Error("CAREER_OPTION_MAPPING_CONFLICT");
  return label;
}function assertScope(scope: CareerCategoryPropertyOptionScope): void {
  UuidSchema.parse(scope.userId); UuidSchema.parse(scope.categoryId);
}
async function requireCategory(db: Db, scope: CareerCategoryPropertyOptionScope, session?: ClientSession, write = false): Promise<CareerCategoryDoc> {
  assertScope(scope);
  const options = session ? { session } : {};
  if (write) {
    const user = await db.collection<{ _id: string }>("users").updateOne({ _id: scope.userId, deletionRequestedAt: null }, { $inc: { lifecycleVersion: 1 } }, options);
    if (user.matchedCount !== 1) throw new Error("CAREER_OPTION_USER_NOT_ACTIVE");
  } else if (!await db.collection<{ _id: string }>("users").findOne({ _id: scope.userId, deletionRequestedAt: null }, options)) throw new Error("CAREER_OPTION_USER_NOT_ACTIVE");
  const category = await db.collection<CareerCategoryDoc>("career_categories").findOne({ _id: scope.categoryId }, options);
  if (!category) throw new Error("CAREER_OPTION_CATEGORY_NOT_FOUND");
  if (category.userId !== null && category.userId !== scope.userId) throw new Error("CAREER_OPTION_CATEGORY_OWNER_MISMATCH");
  return category;
}
function requireDefinition(category: CareerCategoryDoc, propertyId: string): CareerPropertyDefinitionV2 {
  UuidSchema.parse(propertyId);
  const definition = category.propertySchemaV2?.find(definition => definition.id === propertyId && definition.deletedAt === null);
  if (!definition || definition.type !== "multi_select" || !(definition.config.legacyFreeformTags === true || category.propertySchema[definition.key]?.type === "tags")) throw new Error("CAREER_OPTION_DEFINITION_NOT_FOUND");
  return definition;
}

// 스키마 생성은 migration의 책임이므로 여기서는 존재·유일성·정렬 규칙만 읽습니다.
async function requirePreparedLedger(db: Db): Promise<void> {
  const collection = await db.listCollections({ name: "career_property_options" }).next();
  if (!collection || !("options" in collection) || (collection.options.collation?.locale ?? "simple") !== "simple") throw new Error("CAREER_OPTIONS_NOT_PREPARED");
  const indexes = await db.collection("career_property_options").listIndexes().toArray();
  const specifications = [
    { name: "career_option_scope_label", key: { userId: 1, categoryId: 1, propertyId: 1, rawLabel: 1 } },
    { name: "career_option_scope_canonical_id", key: { userId: 1, categoryId: 1, propertyId: 1, optionId: 1 } },
  ];
  for (const specification of specifications) {
    const index = indexes.find(index => index.name === specification.name);
    if (!index || JSON.stringify(index.key) !== JSON.stringify(specification.key) || index.unique !== true || index.sparse === true || index.partialFilterExpression !== undefined || (index.collation?.locale ?? "simple") !== "simple") throw new Error("CAREER_OPTIONS_NOT_PREPARED");
  }
}
function hasFreeformDefinition(category: CareerCategoryDoc): boolean {
  return category.propertySchemaV2?.some(definition => definition.deletedAt === null && definition.type === "multi_select" && (definition.config.legacyFreeformTags === true || category.propertySchema[definition.key]?.type === "tags")) ?? false;
}
export async function readCareerCategoryPropertyOptions(db: Db, scope: CareerCategoryPropertyOptionScope): Promise<CareerPropertyOptionDoc[]> {
  const category = await requireCategory(db, scope);
  if (hasFreeformDefinition(category)) await requirePreparedLedger(db);
  return db.collection<CareerPropertyOptionDoc>("career_property_options").find(scope, { collation: binary }).sort({ propertyId: 1, rawLabel: 1 }).toArray();
}
export async function readCareerPropertyOptions(db: Db, scope: CareerPropertyOptionScope): Promise<CareerPropertyOptionDoc[]> {
  const category = await requireCategory(db, scope);
  requireDefinition(category, scope.propertyId);
  await requirePreparedLedger(db);
  return db.collection<CareerPropertyOptionDoc>("career_property_options").find(scope, { collation: binary }).sort({ rawLabel: 1 }).toArray();
}
function trustedCommonOptionId(category: CareerCategoryDoc, definition: CareerPropertyDefinitionV2, rawLabel: string): string | undefined {
  const legacy = category.propertySchema[definition.key] as unknown as { config?: { options?: unknown } } | undefined;
  const labels = new Map<string, string>(), ids = new Map<string, string>();
  for (const [sourceIndex, source] of [definition.config.options, legacy?.config?.options].entries()) {
    if (source === undefined) continue;
    if (!Array.isArray(source)) throw new Error("CAREER_OPTION_MAPPING_CONFLICT");
    const sourceLabels = new Set<string>(), sourceIds = new Set<string>();
    for (const entry of source) {
      if (!entry || typeof entry !== "object") throw new Error("CAREER_OPTION_MAPPING_CONFLICT");
      const label = optionRawLabel(entry as Record<string, unknown>);
      if (sourceLabels.has(label)) throw new Error("CAREER_OPTION_MAPPING_CONFLICT");
      sourceLabels.add(label);
      // 과거 자유 태그 config는 ID 없이 label만 가질 수 있습니다.
      if (sourceIndex === 1 && entry.id === undefined) continue;
      if (typeof entry.id !== "string" || !UuidSchema.safeParse(entry.id).success || sourceIds.has(entry.id)) throw new Error("CAREER_OPTION_MAPPING_CONFLICT");
      sourceIds.add(entry.id);
      if ((labels.has(label) && labels.get(label) !== entry.id) || (ids.has(entry.id) && ids.get(entry.id) !== label)) throw new Error("CAREER_OPTION_MAPPING_CONFLICT");
      labels.set(label, entry.id); ids.set(entry.id, label);
    }
  }
  return labels.get(rawLabel);
}
/** 같은 label의 재시도는 기존 receipt와 같은 ID·version을 반환합니다. */
export async function registerCareerPropertyOption(db: Db, scope: CareerPropertyOptionScope, rawLabel: string, input: RegisterCareerPropertyOptionInput = {}): Promise<CareerPropertyOptionDoc> {
  assertLabel(rawLabel);
  const stableId = canonicalCareerTagOptionId(scope.userId, scope.categoryId, scope.propertyId, rawLabel);
  if (input.expectedVersion !== undefined && (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0 || input.expectedVersion > 1)) throw new Error("CAREER_OPTION_VERSION_CONFLICT");
  await requirePreparedLedger(db);
  const result = await db.client.withSession(async session => session.withTransaction(async () => {
    const category = await requireCategory(db, scope, session, true);
    const definition = requireDefinition(category, scope.propertyId);
    const ledger = db.collection<CareerPropertyOptionDoc>("career_property_options");
    const existing = await ledger.findOne({ ...scope, rawLabel }, { session, collation: binary });
    const commonId = trustedCommonOptionId(category, definition, rawLabel);
    const optionId = input.optionId ?? existing?.optionId ?? commonId ?? stableId;
    if (commonId !== undefined && optionId !== commonId) throw new Error("CAREER_OPTION_MAPPING_CONFLICT");
    UuidSchema.parse(optionId);
    if (input.optionId !== undefined && optionId !== stableId && existing?.optionId !== optionId && commonId !== optionId) throw new Error("CAREER_OPTION_UNVERIFIED_CANONICAL_ID");
    if (existing) {
      if (existing.optionId !== optionId || existing.version !== 1) throw new Error("CAREER_OPTION_MAPPING_CONFLICT");
      return existing;
    }
    if (input.expectedVersion === 1) throw new Error("CAREER_OPTION_VERSION_CONFLICT");
    const byId = await ledger.findOne({ ...scope, optionId }, { session, collation: binary });
    if (byId) throw new Error("CAREER_OPTION_MAPPING_CONFLICT");
    const row: CareerPropertyOptionDoc = { _id: stableId, ...scope, optionId, rawLabel, version: 1, createdAt: new Date() };
    const inserted = await ledger.findOneAndUpdate({ ...scope, rawLabel, version: { $exists: false } }, { $setOnInsert: row }, { upsert: true, returnDocument: "after", session, collation: binary });
    if (!inserted || inserted.optionId !== optionId) throw new Error("CAREER_OPTION_MAPPING_CONFLICT");
    return inserted;
  }));
  if (!result) throw new Error("CAREER_OPTION_TRANSACTION_ABORTED");
  return result;
}

/** 공유 정의의 원본을 유지하며 현재 사용자 옵션만 표시용 복사본에 덧붙입니다. */
export function overlayCareerPropertyOptions(definitions: readonly CareerPropertyDefinitionV2[], options: readonly CareerPropertyOptionDoc[], scope: CareerCategoryPropertyOptionScope): CareerPropertyDefinitionV2[] {
  assertScope(scope);
  for (const option of options) if (option.userId !== scope.userId || option.categoryId !== scope.categoryId) throw new Error("CAREER_OPTION_SCOPE_MISMATCH");
  return definitions.map(definition => {
    const privateOptions = options.filter(option => option.propertyId === definition.id);
    if (!privateOptions.length) return { ...definition, config: { ...definition.config } };
    if (definition.type !== "multi_select" && definition.type !== "select") return { ...definition, config: { ...definition.config } };
    const source = definition.config.options;
    if (source !== undefined && !Array.isArray(source)) throw new Error("CAREER_OPTION_MAPPING_CONFLICT");
    const merged: Array<Record<string, unknown> & { id: string }> = [];
    const ids = new Map<string, string>(), labels = new Map<string, string>();
    const add = (option: Record<string, unknown>) => {
      const { id } = option;
      const label = optionRawLabel(option);
      if (typeof id !== "string" || !UuidSchema.safeParse(id).success || typeof label !== "string") throw new Error("CAREER_OPTION_MAPPING_CONFLICT");
      assertLabel(label);
      if ((ids.has(id) && ids.get(id) !== label) || (labels.has(label) && labels.get(label) !== id)) throw new Error("CAREER_OPTION_MAPPING_CONFLICT");
      if (!ids.has(id)) { merged.push({ ...option, id }); ids.set(id, label); labels.set(label, id); }
    };
    for (const option of source ?? []) add(option as Record<string, unknown>);
    for (const option of privateOptions) add({ ...option.metadata, id: option.optionId, label: option.rawLabel, name: option.rawLabel });
    return { ...definition, config: { ...definition.config, legacyFreeformTags: true, options: merged } };
  });
}