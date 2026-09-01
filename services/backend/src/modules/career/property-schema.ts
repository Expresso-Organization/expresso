import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { mongoCollections, type CareerCategoryDoc, type CareerRecordDoc } from "@expresso/database";
import {
  ApplyCareerPropertyChangeSchema,
  CareerPropertyChangePreviewSchema,
  CareerPropertySchemaChangeSchema,
  CareerPropertyValueV2Schema,
  type ApplyCareerPropertyChange,
  type CareerPropertyChangePreview,
  type CareerPropertyDefinitionV2,
  type CareerPropertySchemaChange,
} from "@expresso/contracts";
import type { ClientSession, Filter } from "mongodb";

import { addMongoOutboxEvent } from "../../platform/mongo-outbox.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import type { MongoContext } from "../../platform/mongodb.js";
import { requireActiveUser } from "../identity/index.js";
import { CareerError } from "./errors.js";
import { mapMongoCategory } from "./mongo-categories.js";

const PREVIEW_LIFETIME_MS = 15 * 60_000;
const INLINE_MUTATION_LIMIT = 100;
const PREVIEW_EXAMPLE_LIMIT = 20;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const READ_ONLY_TYPES = new Set(["formula", "rollup", "created_time", "updated_time"]);

type ConversionKind = "exact" | "safe" | "lossy" | "unmapped";
interface ConversionResult { value?: unknown; kind: ConversionKind }
interface SignedPreview {
  expiresAt: number;
  userId: string;
  categoryId: string;
  categoryVersion: number;
  change: CareerPropertySchemaChange;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function stablePropertyId(categoryId: string, key: string): string {
  const bytes = createHash("sha1").update(Buffer.from("6ba7b8109dad11d180b400c04fd430c8", "hex")).update(`${categoryId}:${key}`).digest();
  bytes[6] = (bytes[6]! & 15) | 80;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = bytes.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function definitions(category: CareerCategoryDoc): CareerPropertyDefinitionV2[] {
  return category.propertySchemaV2 ?? Object.entries(category.propertySchema).map(([key, property], order) => ({
    id: property.id ?? stablePropertyId(category._id, key), key, name: property.label,
    type: property.type === "boolean" ? "checkbox" : property.type === "tags" ? "multi_select" : property.type,
    required: property.required, system: property.system, config: {}, order, version: 1, deletedAt: null,
  }));
}

function signPreview(payload: SignedPreview, signingSecret: string): string {
  const body = Buffer.from(canonical(payload)).toString("base64url");
  const signature = createHmac("sha256", signingSecret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifyPreview(value: string, expected: Omit<SignedPreview, "expiresAt">, signingSecret: string): boolean {
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return false;
  const body = value.slice(0, separator);
  const supplied = value.slice(separator + 1);
  const signature = createHmac("sha256", signingSecret).update(body).digest("base64url");
  if (supplied.length !== signature.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(signature))) return false;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SignedPreview;
    return payload.expiresAt >= Date.now() && payload.userId === expected.userId
      && payload.categoryId === expected.categoryId && payload.categoryVersion === expected.categoryVersion
      && canonical(payload.change) === canonical(expected.change);
  } catch { return false; }
}

function isDateValue(value: unknown): value is { start: string; end: string | null; timezone: string | null } {
  return Boolean(value && typeof value === "object" && typeof (value as { start?: unknown }).start === "string");
}

/** 저장값을 바꾸는 규칙은 모두 여기에서 명시합니다. 실패한 값은 호출자가 그대로 보존합니다. */
export function convertCareerPropertyValue(value: unknown, from: string, to: string): ConversionResult {
  if (from === to) return { value, kind: "exact" };
  const typed = CareerPropertyValueV2Schema.safeParse(value);
  if (typed.success) {
    if (typed.data.type !== from || READ_ONLY_TYPES.has(to) || to === "relation") return { kind: "unmapped" };
    const converted = convertCareerPropertyValue(typed.data.value, from, to);
    if (converted.kind === "unmapped") return converted;
    return { kind: converted.kind, value: { type: to, value: converted.value } };
  }
  if (value === null || value === undefined || value === "") return { value: null, kind: "safe" };
  if (READ_ONLY_TYPES.has(from) || READ_ONLY_TYPES.has(to) || from === "relation" || to === "relation") return { kind: "unmapped" };
  if ((from === "file" && to === "media") || (from === "media" && to === "file")) return { value, kind: "safe" };
  if (from === "select" && to === "multi_select" && typeof value === "string") return { value: [value], kind: "safe" };
  if (from === "multi_select" && to === "select" && Array.isArray(value)) return { value: value[0] ?? null, kind: value.length <= 1 ? "safe" : "lossy" };
  if ((to === "select" || to === "multi_select") && typeof value === "string" && UUID_PATTERN.test(value)) return { value: to === "select" ? value : [value], kind: "lossy" };
  if (to === "number") {
    if (typeof value === "boolean") return { value: value ? 1 : 0, kind: "safe" };
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return { value: Number(value), kind: "safe" };
    return { kind: "unmapped" };
  }
  if (to === "checkbox") {
    if (typeof value === "number") return { value: value !== 0, kind: "lossy" };
    if (typeof value === "string" && /^(true|false)$/i.test(value.trim())) return { value: value.trim().toLowerCase() === "true", kind: "safe" };
    return { kind: "unmapped" };
  }
  if (to === "date") {
    if (isDateValue(value)) return { value, kind: "exact" };
    if (typeof value === "string" && /^\d{4}-(?:0[1-9]|1[0-2])(?:-\d{2})?$/.test(value)) {
      const start = value.length === 7 ? `${value}-01` : value;
      return { value: { start, end: null, timezone: null }, kind: value.length === 10 ? "safe" : "lossy" };
    }
    return { kind: "unmapped" };
  }
  if (["text", "title", "url", "email", "phone"].includes(to)) {
    if (typeof value === "string") return { value, kind: "safe" };
    if (typeof value === "number" || typeof value === "boolean") return { value: String(value), kind: "safe" };
    if (isDateValue(value)) return { value: value.start, kind: value.end === null ? "safe" : "lossy" };
    if (Array.isArray(value)) return { value: value.join(", "), kind: "lossy" };
  }
  return { kind: "unmapped" };
}

function containsReference(value: unknown, propertyId: string): boolean {
  if (value === propertyId) return true;
  if (Array.isArray(value)) return value.some((item) => containsReference(item, propertyId));
  return Boolean(value && typeof value === "object" && Object.values(value).some((item) => containsReference(item, propertyId)));
}

function affectedFilter(userId: string, categoryId: string, key: string): Filter<CareerRecordDoc> {
  return { userId, categoryId, deletedAt: null, [`properties.${key}`]: { $exists: true } } as Filter<CareerRecordDoc>;
}

function validateConfiguration(type: CareerPropertyDefinitionV2["type"], config: Record<string, unknown>): void {
  if (type !== "select" && type !== "multi_select") return;
  const options = config.options;
  if (!Array.isArray(options)) throw new CareerError(400, "select properties require options");
  const ids = new Set<string>();
  for (const option of options) {
    if (!option || typeof option !== "object" || typeof (option as { id?: unknown }).id !== "string" || !UUID_PATTERN.test((option as { id: string }).id) || typeof (option as { name?: unknown }).name !== "string" || !(option as { name: string }).name.trim()) throw new CareerError(400, "property option is invalid");
    const id = (option as { id: string }).id;
    if (ids.has(id)) throw new CareerError(400, "property option IDs must be unique");
    ids.add(id);
  }
}

export interface CareerPropertySchemaService {
  previewChange(userId: string, categoryId: string, change: CareerPropertySchemaChange): Promise<CareerPropertyChangePreview>;
  applyChange(userId: string, categoryId: string, expectedVersion: number, idempotencyKey: string, input: ApplyCareerPropertyChange): Promise<ReturnType<typeof mapMongoCategory>>;
  restoreProperty(userId: string, categoryId: string, propertyId: string, expectedVersion: number): Promise<ReturnType<typeof mapMongoCategory>>;
}

export class MongoCareerPropertySchemaService implements CareerPropertySchemaService {
  readonly signingSecret: string;
  constructor(readonly context: MongoContext, signingSecret = process.env.CAREER_SCHEMA_PREVIEW_SECRET ?? "expresso-career-schema-preview") { this.signingSecret = signingSecret; }

  async previewChange(userId: string, categoryId: string, raw: CareerPropertySchemaChange): Promise<CareerPropertyChangePreview> {
    const change = CareerPropertySchemaChangeSchema.parse(raw);
    const db = mongoCollections(this.context.db);
    const category = await db.careerCategories.findOne({ _id: categoryId, userId, isSystem: false });
    if (!category) throw new CareerError(404, "career category not found");
    const current = definitions(category);
    const propertyId = "propertyId" in change ? change.propertyId : undefined;
    const source = propertyId ? current.find((definition) => definition.id === propertyId) : undefined;
    if (propertyId && !source) throw new CareerError(404, "property not found");
    const filter = source ? affectedFilter(userId, categoryId, source.key) : undefined;
    const createHasDefault = change.kind === "create" && Object.hasOwn(change.property.config, "defaultValue");
    const affectedRecordCount = filter ? await db.careerRecords.countDocuments(filter) : createHasDefault ? await db.careerRecords.countDocuments({ userId, categoryId, deletedAt: null }) : 0;
    const sampleRows = filter ? await db.careerRecords.find(filter).limit(PREVIEW_EXAMPLE_LIMIT).toArray() : [];
    let convertibleCount = affectedRecordCount;
    const lossyExamples: CareerPropertyChangePreview["impact"]["lossyExamples"] = [];
    if (source && change.kind === "type-change") {
      const rows = await db.careerRecords.find(filter!).project({ _id: 1, properties: 1 }).toArray();
      convertibleCount = 0;
      for (const row of rows) {
        const before = row.properties[source.key];
        const converted = convertCareerPropertyValue(before, source.type, change.type);
        if (converted.kind !== "unmapped") convertibleCount += 1;
        if ((converted.kind === "lossy" || converted.kind === "unmapped") && lossyExamples.length < PREVIEW_EXAMPLE_LIMIT) lossyExamples.push({ recordId: row._id, before, ...(converted.value === undefined ? {} : { after: converted.value }) });
      }
    } else if (source && change.kind === "delete") {
      for (const row of sampleRows) lossyExamples.push({ recordId: row._id, before: row.properties[source.key] });
    }
    const views = propertyId ? await db.careerViews.find({ userId, categoryId }).toArray() : [];
    const dependentViews = views.filter((view) => containsReference(view, propertyId!)).map((view) => view._id).slice(0, 100);
    const dependentFormulas = propertyId ? current.filter((definition) => definition.type === "formula" && containsReference(definition.config, propertyId)).map((definition) => definition.id).slice(0, 100) : [];
    const dependentRollups = propertyId ? current.filter((definition) => definition.type === "rollup" && containsReference(definition.config, propertyId)).map((definition) => definition.id).slice(0, 100) : [];
    return CareerPropertyChangePreviewSchema.parse({
      categoryId, categoryVersion: category.version, change,
      impact: { affectedRecordCount, convertibleCount, lossyExamples, dependentViews, dependentFormulas, dependentRollups },
      previewToken: signPreview({ expiresAt: Date.now() + PREVIEW_LIFETIME_MS, userId, categoryId, categoryVersion: category.version, change }, this.signingSecret),
    });
  }

  async applyChange(userId: string, categoryId: string, expectedVersion: number, idempotencyKey: string, raw: ApplyCareerPropertyChange) {
    const input = ApplyCareerPropertyChangeSchema.parse(raw);
    const requestHash = digest(input); const idempotencyField = digest(idempotencyKey);
    return inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const db = mongoCollections(tx.db);
      const category = await db.careerCategories.findOne({ _id: categoryId, userId, isSystem: false }, { session: tx.session });
      if (!category) throw new CareerError(404, "career category not found");
      const prior = category.propertyMutationResults?.[idempotencyField] as { category: unknown; requestHash: string } | undefined;
      if (prior) {
        if (prior.requestHash !== requestHash) throw new CareerError(409, "idempotency key was reused with another request");
        return prior.category as ReturnType<typeof mapMongoCategory>;
      }
      if (category.version !== expectedVersion) throw new CareerError(409, "category version is stale");
      if (!verifyPreview(input.previewToken, { userId, categoryId, categoryVersion: expectedVersion, change: input.change }, this.signingSecret)) throw new CareerError(409, "preview token is invalid or expired");
      const now = new Date();
      const next = definitions(category).map((definition) => ({ ...definition, config: { ...definition.config } }));
      const change = input.change;
      if (change.kind === "create") {
        if (change.property.system) throw new CareerError(403, "system properties cannot be created by users");
        validateConfiguration(change.property.type, change.property.config);
        if (next.some((definition) => definition.key === change.property.key && definition.deletedAt === null)) throw new CareerError(409, "property key already exists");
        const created = { ...change.property, id: change.property.id ?? randomUUID(), order: change.property.order ?? next.length, version: 1, deletedAt: null };
        await this.seedCreatedValues(tx.session, userId, categoryId, created, now);
        next.push(created);
      } else {
        const source = next.find((definition) => definition.id === change.propertyId);
        if (!source) throw new CareerError(404, "property not found");
        if (source.system && change.kind !== "restore") throw new CareerError(403, "system property cannot be changed");
        if (change.kind === "rename") { source.name = change.name; source.version += 1; }
        if (change.kind === "reorder") { source.order = change.order; source.version += 1; }
        if (change.kind === "delete") { if (source.deletedAt !== null) throw new CareerError(409, "property is already deleted"); await this.deleteValues(tx.session, userId, categoryId, source, input.confirmLossy, now); source.deletedAt = now.toISOString(); source.version += 1; }
        if (change.kind === "restore") { if (source.deletedAt === null) throw new CareerError(409, "property is not deleted"); await this.restoreValues(tx.session, userId, categoryId, source, now); source.deletedAt = null; source.version += 1; }
        if (change.kind === "type-change") { if (READ_ONLY_TYPES.has(source.type) || READ_ONLY_TYPES.has(change.type)) throw new CareerError(403, "property type is protected"); const config = change.config ?? source.config; validateConfiguration(change.type, config); await this.convertValues(tx.session, userId, categoryId, source, change.type, input.confirmLossy, now); source.type = change.type; source.config = config; source.version += 1; }
      }
      const schemaVersion = (category.schemaVersion ?? category.version) + 1;
      const mapped = mapMongoCategory({ ...category, propertySchemaV2: next, schemaVersion, version: category.version + 1, updatedAt: now }, 0);
      const update = await db.careerCategories.updateOne(
        { _id: categoryId, userId, isSystem: false, version: expectedVersion },
        { $set: { propertySchemaV2: next, schemaVersion, updatedAt: now, [`propertyMutationResults.${idempotencyField}`]: { category: mapped, requestHash } }, $inc: { version: 1 } }, { session: tx.session },
      );
      if (update.modifiedCount !== 1) throw new CareerError(409, "category version is stale");
      return mapped;
    });
  }

  private async convertValues(session: ClientSession, userId: string, categoryId: string, source: CareerPropertyDefinitionV2, targetType: string, confirmLossy: boolean, now: Date): Promise<void> {
    const db = mongoCollections(this.context.db); const filter = affectedFilter(userId, categoryId, source.key);
    const count = await db.careerRecords.countDocuments(filter, { session });
    if (count > INLINE_MUTATION_LIMIT) { await addMongoOutboxEvent({ ...this.context, session }, { userId, topic: "career.property-conversion", idempotencyKey: `career-property:${categoryId}:${source.id}:${source.version + 1}`, payload: { categoryId, propertyId: source.id, sourceType: source.type, targetType } }); return; }
    const rows = await db.careerRecords.find(filter, { session }).toArray();
    const conversions = rows.map((row) => ({ row, result: convertCareerPropertyValue(row.properties[source.key], source.type, targetType) }));
    if (conversions.some(({ result }) => result.kind === "unmapped")) throw new CareerError(409, "some property values cannot be converted");
    if (!confirmLossy && conversions.some(({ result }) => result.kind === "lossy")) throw new CareerError(409, "lossy conversion requires confirmation");
    if (conversions.length > 0) await db.careerRecords.bulkWrite(conversions.map(({ row, result }) => {
      const stored = CareerPropertyValueV2Schema.safeParse(row.properties[source.key]).success ? result.value : { type: targetType, value: result.value };
      return { updateOne: { filter: { _id: row._id, userId, version: row.version }, update: { $set: { [`properties.${source.key}`]: stored, updatedAt: now }, $inc: { version: 1 } } } };
    }), { session });
  }

  private async seedCreatedValues(session: ClientSession, userId: string, categoryId: string, definition: CareerPropertyDefinitionV2, now: Date): Promise<void> {
    const db = mongoCollections(this.context.db);
    const count = await db.careerRecords.countDocuments({ userId, categoryId, deletedAt: null }, { session });
    const candidate = definition.config.defaultValue;
    if (candidate === undefined) {
      if (definition.required && count > 0) throw new CareerError(409, "required property needs a default value for existing records");
      return;
    }
    const parsed = CareerPropertyValueV2Schema.safeParse(candidate);
    if (!parsed.success || parsed.data.type !== definition.type || READ_ONLY_TYPES.has(definition.type)) throw new CareerError(400, "property default value does not match its type");
    if (count > INLINE_MUTATION_LIMIT) {
      await addMongoOutboxEvent({ ...this.context, session }, { userId, topic: "career.property-default", idempotencyKey: `career-property-default:${categoryId}:${definition.id}`, payload: { categoryId, propertyId: definition.id, propertyKey: definition.key, defaultValue: parsed.data } });
      return;
    }
    await db.careerRecords.updateMany({ userId, categoryId, deletedAt: null, [`properties.${definition.key}`]: { $exists: false } }, { $set: { [`properties.${definition.key}`]: parsed.data, updatedAt: now }, $inc: { version: 1 } }, { session });
  }

  private async deleteValues(session: ClientSession, userId: string, categoryId: string, source: CareerPropertyDefinitionV2, confirmLossy: boolean, now: Date): Promise<void> {
    const db = mongoCollections(this.context.db); const filter = affectedFilter(userId, categoryId, source.key);
    const count = await db.careerRecords.countDocuments(filter, { session });
    if (count > 0 && !confirmLossy) throw new CareerError(409, "property deletion requires confirmation");
    if (count > INLINE_MUTATION_LIMIT) { await addMongoOutboxEvent({ ...this.context, session }, { userId, topic: "career.property-deletion", idempotencyKey: `career-property-delete:${categoryId}:${source.id}:${source.version + 1}`, payload: { categoryId, propertyId: source.id, propertyKey: source.key } }); return; }
    const rows = await db.careerRecords.find(filter, { session }).toArray();
    if (rows.length > 0) await db.careerRecords.bulkWrite(rows.map((row) => ({ updateOne: { filter: { _id: row._id, userId, version: row.version }, update: { $set: { [`propertyValueTombstones.${source.id}`]: row.properties[source.key], updatedAt: now }, $unset: { [`properties.${source.key}`]: "" }, $inc: { version: 1 } } } })), { session });
  }

  private async restoreValues(session: ClientSession, userId: string, categoryId: string, source: CareerPropertyDefinitionV2, now: Date): Promise<void> {
    const db = mongoCollections(this.context.db); const path = `propertyValueTombstones.${source.id}`;
    const filter = { userId, categoryId, deletedAt: null, [path]: { $exists: true } } as Filter<CareerRecordDoc>;
    const count = await db.careerRecords.countDocuments(filter, { session });
    if (count > INLINE_MUTATION_LIMIT) { await addMongoOutboxEvent({ ...this.context, session }, { userId, topic: "career.property-restoration", idempotencyKey: `career-property-restore:${categoryId}:${source.id}:${source.version + 1}`, payload: { categoryId, propertyId: source.id, propertyKey: source.key } }); return; }
    const rows = await db.careerRecords.find(filter, { session }).toArray();
    if (rows.length > 0) await db.careerRecords.bulkWrite(rows.map((row) => ({ updateOne: { filter: { _id: row._id, userId, version: row.version }, update: { $set: { [`properties.${source.key}`]: row.propertyValueTombstones?.[source.id], updatedAt: now }, $unset: { [path]: "" }, $inc: { version: 1 } } } })), { session });
  }

  async restoreProperty(userId: string, categoryId: string, propertyId: string, expectedVersion: number) {
    const change = CareerPropertySchemaChangeSchema.parse({ kind: "restore", propertyId });
    return this.applyChange(userId, categoryId, expectedVersion, `restore:${propertyId}:${expectedVersion}`, { change, previewToken: signPreview({ expiresAt: Date.now() + PREVIEW_LIFETIME_MS, userId, categoryId, categoryVersion: expectedVersion, change }, this.signingSecret), confirmLossy: false });
  }
}
