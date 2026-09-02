import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import {
  CareerCategoryMoveCommitSchema,
  CareerCategoryMovePreviewSchema,
  CareerPropertyValueV2Schema,
  PreviewCareerCategoryMoveSchema,
  type CareerCategoryMovePreview,
  type CareerPropertyDefinitionV2,
  type CareerPropertyValueV2,
  type PreviewCareerCategoryMove,
} from "@expresso/contracts";
import { mongoCollections, type CareerCategoryDoc, type CareerRecordDoc } from "@expresso/database";

import { addMongoOutboxEvent } from "../../platform/mongo-outbox.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import type { MongoContext } from "../../platform/mongodb.js";
import { requireActiveUser } from "../identity/index.js";
import { CareerError } from "./errors.js";
import { requireCareerCategory } from "./mongo-categories.js";
import { mapMongoRecord } from "./mongo-records.js";
import { convertCareerPropertyValue } from "./property-schema.js";
import { careerCategoryDefinitions } from "./relations.js";

const PREVIEW_LIFETIME_MS = 15 * 60_000;

interface MoveToken {
  expiresAt: number;
  userId: string;
  recordId: string;
  sourceCategoryId: string;
  targetCategoryId: string;
  recordVersion: number;
  sourceSchemaVersion: number;
  targetSchemaVersion: number;
  conversionHash: string;
}

interface MovePlan {
  preview: CareerCategoryMovePreview;
  conversionHash: string;
  nextProperties: Record<string, unknown>;
  unmappedRaw: Record<string, unknown>;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function schemaVersion(category: CareerCategoryDoc): number {
  return category.schemaVersion ?? category.version;
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase("ko-KR").replace(/\s+/g, " ");
}

function activeDefinitions(category: CareerCategoryDoc): CareerPropertyDefinitionV2[] {
  return careerCategoryDefinitions(category).filter((definition) => definition.deletedAt === null) as CareerPropertyDefinitionV2[];
}

function previewValue(value: unknown, definition: CareerPropertyDefinitionV2): CareerPropertyValueV2 {
  const parsed = CareerPropertyValueV2Schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const candidate = { type: definition.type, value };
  const typed = CareerPropertyValueV2Schema.safeParse(candidate);
  if (typed.success) return typed.data;
  // 기존 v1 값은 원본을 DB의 unmappedProperties에 유지하며, preview에는 읽기 가능한 표현만 낸다.
  return { type: "text", value: JSON.stringify(value) };
}

function readValue(record: CareerRecordDoc, definition: CareerPropertyDefinitionV2): unknown {
  return record.properties[definition.key];
}

function signToken(token: MoveToken, secret: string): string {
  const body = Buffer.from(canonical(token)).toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

function verifyToken(raw: string, expected: Omit<MoveToken, "expiresAt">, secret: string): boolean {
  const separator = raw.lastIndexOf(".");
  if (separator <= 0) return false;
  const body = raw.slice(0, separator);
  const actual = raw.slice(separator + 1);
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  if (actual.length !== signature.length || !timingSafeEqual(Buffer.from(actual), Buffer.from(signature))) return false;
  try {
    const token = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as MoveToken;
    return token.expiresAt >= Date.now()
      && token.userId === expected.userId && token.recordId === expected.recordId
      && token.sourceCategoryId === expected.sourceCategoryId && token.targetCategoryId === expected.targetCategoryId
      && token.recordVersion === expected.recordVersion && token.sourceSchemaVersion === expected.sourceSchemaVersion
      && token.targetSchemaVersion === expected.targetSchemaVersion && token.conversionHash === expected.conversionHash;
  } catch { return false; }
}

function targetFor(source: CareerPropertyDefinitionV2, targets: readonly CareerPropertyDefinitionV2[]): CareerPropertyDefinitionV2 | null {
  return targets.find((target) => normalized(target.key) === normalized(source.key))
    ?? targets.find((target) => normalized(target.name) === normalized(source.name))
    ?? null;
}

function createMovePlan(record: CareerRecordDoc, source: CareerCategoryDoc, target: CareerCategoryDoc, userId: string, secret: string): MovePlan {
  const sourceDefinitions = activeDefinitions(source);
  const targetDefinitions = activeDefinitions(target);
  const nextProperties: Record<string, unknown> = {};
  const unmappedRaw: Record<string, unknown> = { ...(record.unmappedProperties ?? {}) };
  const conversions: CareerCategoryMovePreview["conversions"] = [];

  for (const definition of sourceDefinitions) {
    const value = readValue(record, definition);
    const targetDefinition = targetFor(definition, targetDefinitions);
    if (!targetDefinition) {
      conversions.push({ sourcePropertyId: definition.id, targetPropertyId: null, kind: "unmapped", ...(value === undefined ? {} : { sampleBefore: value }) });
      if (value !== undefined) unmappedRaw[definition.id] = value;
      continue;
    }
    if (value === undefined) {
      conversions.push({ sourcePropertyId: definition.id, targetPropertyId: targetDefinition.id, kind: definition.type === targetDefinition.type ? "exact" : "safe" });
      continue;
    }
    const conversion = convertCareerPropertyValue(value, definition.type, targetDefinition.type);
    conversions.push({ sourcePropertyId: definition.id, targetPropertyId: targetDefinition.id, kind: conversion.kind, sampleBefore: value, ...(conversion.value === undefined ? {} : { sampleAfter: conversion.value }) });
    if (conversion.kind === "unmapped" || conversion.value === undefined) unmappedRaw[definition.id] = value;
    else nextProperties[targetDefinition.key] = conversion.value;
  }

  const sourceSchemaVersion = schemaVersion(source);
  const targetSchemaVersion = schemaVersion(target);
  const conversionHash = digest({ recordId: record._id, recordVersion: record.version, sourceCategoryId: source._id, targetCategoryId: target._id, sourceSchemaVersion, targetSchemaVersion, conversions, unmappedRaw });
  const unmappedProperties = Object.fromEntries(sourceDefinitions
    .filter((definition) => Object.hasOwn(unmappedRaw, definition.id))
    .map((definition) => [definition.id, previewValue(unmappedRaw[definition.id], definition)]));
  const token: MoveToken = {
    expiresAt: Date.now() + PREVIEW_LIFETIME_MS, userId, recordId: record._id,
    sourceCategoryId: source._id, targetCategoryId: target._id, recordVersion: record.version,
    sourceSchemaVersion, targetSchemaVersion, conversionHash,
  };
  const preview = CareerCategoryMovePreviewSchema.parse({
    recordId: record._id, sourceCategoryId: source._id, targetCategoryId: target._id, recordVersion: record.version,
    sourceSchemaVersion, targetSchemaVersion, conversions, unmappedProperties, previewToken: signToken(token, secret),
  });
  return { preview, conversionHash, nextProperties, unmappedRaw };
}

export interface CategoryMoveService {
  preview(userId: string, recordId: string, targetCategoryId: string): Promise<CareerCategoryMovePreview>;
  commit(userId: string, recordId: string, input: unknown): Promise<ReturnType<typeof mapMongoRecord>>;
}

/** 이동은 소속과 값 projection만 바꾼다. 문서 본문과 관계 원장은 recordId에 결속되어 유지된다. */
export class MongoCategoryMoveService implements CategoryMoveService {
  readonly signingSecret: string;
  constructor(readonly context: MongoContext, signingSecret = process.env.CAREER_MOVE_PREVIEW_SECRET ?? "expresso-career-move-preview") { this.signingSecret = signingSecret; }

  async preview(userId: string, recordId: string, rawTargetCategoryId: string): Promise<CareerCategoryMovePreview> {
    const input: PreviewCareerCategoryMove = PreviewCareerCategoryMoveSchema.parse({ targetCategoryId: rawTargetCategoryId });
    const db = mongoCollections(this.context.db);
    const record = await db.careerRecords.findOne({ _id: recordId, userId, deletedAt: null });
    if (!record) throw new CareerError(404, "career record not found");
    if (record.categoryId === input.targetCategoryId) throw new CareerError(400, "record is already in the target category");
    const source = await requireCareerCategory(this.context, userId, record.categoryId);
    const target = await requireCareerCategory(this.context, userId, input.targetCategoryId);
    return createMovePlan(record, source, target, userId, this.signingSecret).preview;
  }

  async commit(userId: string, recordId: string, raw: unknown): Promise<ReturnType<typeof mapMongoRecord>> {
    const input = CareerCategoryMoveCommitSchema.parse(raw);
    if (input.recordId !== recordId) throw new CareerError(400, "move record does not match route");
    return inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const db = mongoCollections(tx.db);
      const record = await db.careerRecords.findOne({ _id: recordId, userId, deletedAt: null }, { session: tx.session });
      if (!record) throw new CareerError(404, "career record not found");
      if (record.version !== input.expectedVersion) throw new CareerError(412, "career record version is stale");
      if (record.categoryId === input.targetCategoryId) throw new CareerError(400, "record is already in the target category");
      const source = await requireCareerCategory(tx, userId, record.categoryId, tx.session);
      const target = await requireCareerCategory(tx, userId, input.targetCategoryId, tx.session);
      const plan = createMovePlan(record, source, target, userId, this.signingSecret);
      if (!verifyToken(input.previewToken, {
        userId, recordId, sourceCategoryId: source._id, targetCategoryId: target._id, recordVersion: record.version,
        sourceSchemaVersion: plan.preview.sourceSchemaVersion, targetSchemaVersion: plan.preview.targetSchemaVersion,
        conversionHash: plan.conversionHash,
      }, this.signingSecret)) throw new CareerError(409, "category move preview is stale");

      const permitted = new Set(Object.keys(plan.unmappedRaw));
      if (input.discardUnmappedPropertyIds.some((id) => !permitted.has(id))) throw new CareerError(400, "discard request contains an unmapped property outside this preview");
      const unmapped = { ...plan.unmappedRaw };
      for (const propertyId of input.discardUnmappedPropertyIds) delete unmapped[propertyId];
      const now = new Date();
      const updated = await db.careerRecords.findOneAndUpdate(
        { _id: recordId, userId, categoryId: source._id, deletedAt: null, version: input.expectedVersion },
        { $set: { categoryId: target._id, properties: plan.nextProperties as CareerRecordDoc["properties"], unmappedProperties: Object.keys(unmapped).length ? unmapped as NonNullable<CareerRecordDoc["unmappedProperties"]> : null, updatedAt: now }, $inc: { version: 1, referenceVersion: 1 } },
        { session: tx.session, returnDocument: "after" },
      );
      if (!updated) throw new CareerError(412, "career record version is stale");
      await addMongoOutboxEvent(tx, {
        userId, topic: "career.computation", idempotencyKey: `career-category-move:${recordId}:v${updated.version}`,
        payload: { userId, recordId, changedPropertyIds: [], sourceRecordVersion: updated.version },
      });
      return mapMongoRecord(updated);
    });
  }
}
